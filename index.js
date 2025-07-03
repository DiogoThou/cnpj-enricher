const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN; // Configure no Vercel

// Função para limpar CNPJ
function cleanCNPJ(cnpj) {
  return cnpj ? cnpj.replace(/[^\d]/g, '') : '';
}

// Endpoint de status para o HubSpot (Account Component)
app.get('/account', (req, res) => {
  res.json({
    status: 'connected',
    app: 'CNPJ Enricher',
    version: '1.0'
  });
});

// Endpoint de enriquecimento de dados
app.post('/enrich', async (req, res) => {
  const { companyId } = req.body;

  if (!companyId) {
    return res.status(400).json({ error: 'Company ID is required' });
  }

  try {
    // 1️⃣ Buscar dados da empresa no HubSpot
    const hubspotCompany = await axios.get(`https://api.hubapi.com/crm/v3/objects/companies/${companyId}`, {
      headers: {
        Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`
      }
    });

    const cnpjRaw = hubspotCompany.data.properties.cnpj;
    const cnpj = cleanCNPJ(cnpjRaw);

    if (!cnpj) {
      return res.status(400).json({ error: 'CNPJ not found or invalid in HubSpot company record' });
    }

    // 2️⃣ Consultar a API publica.cnpj.ws
    const cnpjDataResponse = await axios.get(`https://publica.cnpj.ws/cnpj/${cnpj}`);
    const cnpjData = cnpjDataResponse.data;

    // 3️⃣ Montar o payload de atualização
    const updatePayload = {
      properties: {
        razao_social: cnpjData.razao_social || '',
        nome_fantasia: cnpjData.estabelecimento?.nome_fantasia || '',
        situacao_cadastral: cnpjData.estabelecimento?.situacao_cadastral || '',
        capital_social: cnpjData.capital_social || '',
        porte: cnpjData.porte?.descricao || '',
        atividade_principal: cnpjData.estabelecimento?.atividade_principal?.descricao || '',
        telefone: cnpjData.estabelecimento?.telefone1 || '',
        email: cnpjData.estabelecimento?.email || '',
        logradouro: cnpjData.estabelecimento?.logradouro || '',
        numero: cnpjData.estabelecimento?.numero || '',
        bairro: cnpjData.estabelecimento?.bairro || '',
        cep: cnpjData.estabelecimento?.cep || '',
        cidade: cnpjData.estabelecimento?.cidade?.nome || '',
        estado: cnpjData.estabelecimento?.estado?.sigla || ''
      }
    };

    // 4️⃣ Atualizar empresa no HubSpot
    await axios.patch(`https://api.hubapi.com/crm/v3/objects/companies/${companyId}`, updatePayload, {
      headers: {
        Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({ status: 'success', message: 'Empresa atualizada com dados do CNPJ' });

  } catch (error) {
    console.error('Erro no enriquecimento:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao enriquecer dados' });
  }
});

// Porta automática do Vercel
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CNPJ Enricher rodando na porta ${PORT}`));


const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const HUBSPOT_REFRESH_TOKEN = process.env.HUBSPOT_REFRESH_TOKEN;
const REDIRECT_URI = process.env.REDIRECT_URI;

let mapeamentoCampos = {};
let modoAvancadoAtivo = false;

function cleanCNPJ(cnpj) {
  return cnpj ? cnpj.replace(/[^\d]/g, '') : '';
}

app.get('/account', (req, res) => {
  res.json({
    status: 'connected',
    app: 'CNPJ Enricher',
    version: '1.0'
  });
});

app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('❌ Código de autorização não fornecido.');
  try {
    const response = await axios.post(
      'https://api.hubapi.com/oauth/v1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code: code
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const { access_token, refresh_token, expires_in } = response.data;
    console.log('✅ Access Token:', access_token);
    console.log('🔁 Refresh Token:', refresh_token);
    console.log('⏰ Expira em (segundos):', expires_in);
    res.send('✅ App autorizado com sucesso! Access token gerado.');
  } catch (error) {
    console.error('❌ Erro ao trocar o code pelo token:', error.response?.data || error.message);
    res.status(500).send('❌ Erro ao gerar token.');
  }
});

app.get('/refresh', async (req, res) => {
  if (!HUBSPOT_REFRESH_TOKEN) return res.status(400).send('❌ Refresh token não configurado.');
  try {
    const response = await axios.post(
      'https://api.hubapi.com/oauth/v1/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: HUBSPOT_REFRESH_TOKEN
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const { access_token, refresh_token, expires_in } = response.data;
    console.log('✅ Novo Access Token:', access_token);
    console.log('🔁 Novo Refresh Token:', refresh_token);
    console.log('⏰ Expira em (segundos):', expires_in);
    res.send('✅ Novo access_token gerado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao fazer refresh do token:', error.response?.data || error.message);
    res.status(500).send('❌ Erro ao gerar novo token.');
  }
});

app.get('/settings', (req, res) => {
  res.sendFile(__dirname + '/settings.html');
});

app.post('/settings', (req, res) => {
  const { mapeamento, modoAvancado } = req.body;
  mapeamentoCampos = mapeamento || {};
  modoAvancadoAtivo = modoAvancado || false;
  console.log('⚙️ Modo avançado:', modoAvancadoAtivo);
  console.log('🗺️ Mapeamento salvo:', mapeamentoCampos);
  res.json({ status: 'success', message: 'Configurações salvas com sucesso' });
});

app.post('/enrich', async (req, res) => {
  const { companyId } = req.body;
  if (!companyId) return res.status(400).json({ error: 'Company ID is required' });
  try {
    const hubspotCompany = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/companies/${companyId}`,
      { headers: { Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}` } }
    );
    const cnpjRaw = hubspotCompany.data.properties.cnpj;
    const cnpj = cleanCNPJ(cnpjRaw);
    if (!cnpj) return res.status(400).json({ error: 'CNPJ inválido' });

    const cnpjData = (await axios.get(`https://publica.cnpj.ws/cnpj/${cnpj}`)).data;
    const estabelecimento = cnpjData.estabelecimento || {};
    const dados = {
      razao_social: cnpjData.razao_social,
      nome_fantasia: estabelecimento.nome_fantasia,
      situacao_cadastral: estabelecimento.situacao_cadastral,
      capital_social: cnpjData.capital_social,
      porte: cnpjData.porte?.descricao,
      atividade_principal: estabelecimento.atividade_principal?.descricao,
      telefone: estabelecimento.telefone1,
      email: estabelecimento.email,
      endereco: `${estabelecimento.logradouro}, ${estabelecimento.numero}`,
      cidade: estabelecimento.cidade?.nome,
      estado: estabelecimento.estado?.sigla,
      cep: estabelecimento.cep
    };

    const mapeado = {};
    for (const [chave, valor] of Object.entries(dados)) {
      const campoHubSpot = mapeamentoCampos[chave];
      if (modoAvancadoAtivo && campoHubSpot) {
        mapeado[campoHubSpot] = valor || '';
      }
    }

    const payload = {
      properties: modoAvancadoAtivo && Object.keys(mapeado).length > 0
        ? mapeado
        : { teste_cnpj: JSON.stringify(dados) }
    };

    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/companies/${companyId}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    res.json({ status: 'success', message: 'Empresa enriquecida com sucesso' });
  } catch (error) {
    console.error('❌ Erro no enriquecimento:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao enriquecer dados' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 CNPJ Enricher rodando na porta ${PORT}`));

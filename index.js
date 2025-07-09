
const express = require('express');
const axios = require('axios');
const app = express();
const cors = require('cors');
const path = require('path');

require('dotenv').config();
app.use(express.json());
app.use(cors());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const HUBSPOT_REFRESH_TOKEN = process.env.HUBSPOT_REFRESH_TOKEN;
const REDIRECT_URI = process.env.REDIRECT_URI;

// CORS e segurança compatíveis com iframe
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self' https://app.hubspot.com https://app-eu1.hubspot.com;");
  next();
});

function cleanCNPJ(cnpj) {
  return cnpj ? cnpj.replace(/[^\d]/g, '') : '';
}

function formatCNPJData(cnpj, data) {
  const est = data.estabelecimento || {};
  const socios = data.socios || [];
  const agora = new Date().toLocaleString("pt-BR");

  const texto = `
🏢 DADOS DA EMPRESA (CNPJ: ${cnpj}) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 IDENTIFICAÇÃO:
• Razão Social: ${data.razao_social || ""}
• Nome Fantasia: ${est.nome_fantasia || ""}
• CNPJ: ${cnpj}
• Situação: ${est.situacao_cadastral || ""}

💼 INFORMAÇÕES EMPRESARIAIS:
• Porte: ${data.porte?.descricao || ""}
• Capital Social: R$ ${data.capital_social || ""}
• Atividade Principal: ${est.atividade_principal?.descricao || ""}
• Natureza Jurídica: ${data.natureza_juridica?.descricao || ""}

📍 ENDEREÇO:
• Logradouro: ${est.logradouro || ""}, ${est.numero || ""}
• Complemento: ${est.complemento || ""}
• Bairro: ${est.bairro || ""}
• CEP: ${est.cep || ""}
• Cidade: ${est.cidade?.nome || ""}
• Estado: ${est.estado?.nome || ""} (${est.estado?.sigla || ""})
• País: Brasil

📞 CONTATO:
• Telefone: (${est.ddd1 || ""}) ${est.telefone1 || ""}
• Fax: (${est.ddd_fax || ""}) ${est.fax || ""}
• Email: ${est.email || ""}

📊 OUTRAS INFORMAÇÕES:
• Data de Início: ${est.data_inicio_atividade || ""}
• Última Atualização: ${data.atualizado_em || ""}

👥 SÓCIOS:
${socios.map(s => `• ${s.nome} (${s.qualificacao_socio?.descricao || ""})`).join('
')}

🎯 Dados obtidos automaticamente via CNPJ Enricher em ${agora}
`.trim();

  return texto;
}

// Account Component - status do app
app.get('/account', (req, res) => {
  res.json({
    status: 'connected',
    app: 'CNPJ Enricher',
    version: '1.0'
  });
});

// OAuth callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('❌ Código de autorização não fornecido.');
  }

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
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    console.log('✅ Access Token:', access_token);
    console.log('🔁 Refresh Token:', refresh_token);
    console.log('⏰ Expira em (segundos):', expires_in);
    res.send('✅ App autorizado com sucesso! Access token gerado.');
  } catch (error) {
    console.error('❌ Erro ao trocar code pelo token:', error.response?.data || error.message);
    res.status(500).send('❌ Erro ao gerar token.');
  }
});

// Enrichment via POST
app.post('/enrich', async (req, res) => {
  const { companyId } = req.body;
  if (!companyId) return res.status(400).json({ error: 'Company ID is required' });

  try {
    const hubspotCompany = await axios.get(`https://api.hubapi.com/crm/v3/objects/companies/${companyId}`, {
      headers: { Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}` }
    });

    const cnpjRaw = hubspotCompany.data.properties.cnpj;
    const cnpj = cleanCNPJ(cnpjRaw);
    if (!cnpj) return res.status(400).json({ error: 'CNPJ inválido' });

    const cnpjData = (await axios.get(`https://publica.cnpj.ws/cnpj/${cnpj}`)).data;
    const textoFormatado = formatCNPJData(cnpj, cnpjData);
    console.log("📋 Conteúdo gerado para salvar:", textoFormatado);

    const updatePayload = {
      properties: {
        teste_cnpj: textoFormatado
      }
    };

    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/companies/${companyId}`,
      updatePayload,
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ status: 'success', message: 'Empresa atualizada com dados formatados no campo teste_cnpj.' });
  } catch (error) {
    console.error('❌ Erro no enriquecimento:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao enriquecer dados' });
  }
});

// Settings Page simples para funcionar
app.get('/settings', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Configuração</title></head>
<body>
  <h1>✅ Configuração disponível</h1>
  <p>Esta página está pronta para uso no HubSpot.</p>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor ativo na porta ${PORT}`));

const axios = require('axios');

// Objeto de memória persistente enquanto a função está "quente"
let tokens = {
  portalId: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null
};

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, error, error_description } = req.query;

    if (error) {
      return res.status(400).send(`Erro OAuth: ${error} - ${error_description}`);
    }

    if (!code) return res.status(400).send('Código ausente.');

    // Buscando variáveis (tenta os dois nomes possíveis para garantir)
    const clientId = process.env.HUBSPOT_CLIENT_ID || process.env.CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET || process.env.CLIENT_SECRET;
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI || process.env.REDIRECT_URI;

    if (!clientId) {
        console.error('❌ ERRO: CLIENT_ID não configurado na Vercel');
    }

    console.log('🔄 Trocando código por token para ID:', clientId);

    const formData = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code: code
    });

    const response = await axios.post('https://api.hubapi.com/oauth/v1/token', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, refresh_token, expires_in, hub_id } = response.data;

    // Atualiza a memória
    tokens.portalId = hub_id;
    tokens.accessToken = access_token;
    tokens.refreshToken = refresh_token;
    tokens.expiresAt = expires_in ? Date.now() + (expires_in * 1000) : null;

    console.log('✅ Sucesso! Portal:', hub_id);

    return res.status(302).setHeader('Location', '/?success=true').end();
  } catch (error) {
    console.error('Erro no callback:', error.response?.data || error.message);
    return res.status(500).json(error.response?.data || { error: error.message });
  }
};

// Exportações para o create-fields.js
module.exports.getTokens = () => tokens;
const axios = require('axios');

// Objeto de memória compartilhado
let tokens = {
  portalId: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null
};

module.exports = async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) return res.status(400).send(`Erro OAuth: ${error}`);
    if (!code) return res.status(400).send('Código de autorização ausente.');

    // IMPORTANTE: Verifique se no seu Vercel os nomes são CLIENT_ID ou HUBSPOT_CLIENT_ID
    // Ajustei para os nomes mais comuns que você usou
    const clientId = process.env.CLIENT_ID || process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET || process.env.HUBSPOT_CLIENT_SECRET;
    const redirectUri = process.env.REDIRECT_URI || process.env.HUBSPOT_REDIRECT_URI;

    console.log('🔄 Trocando código por token para ClientID:', clientId);

    const response = await axios.post(
      'https://api.hubapi.com/oauth/v1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: code
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in, hub_id } = response.data;

    // Salva na memória
    tokens.portalId = hub_id;
    tokens.accessToken = access_token;
    tokens.refreshToken = refresh_token;
    tokens.expiresAt = expires_in ? Date.now() + (expires_in * 1000) : null;

    console.log('✅ Token recebido para o portal:', hub_id);

    return res.status(302).setHeader('Location', '/?success=true').end();
  } catch (error) {
    console.error('Erro no callback:', error.response?.data || error.message);
    return res.status(500).json({ error: error.response?.data || error.message });
  }
};

// Exporta as funções para o create-fields.js
module.exports.getTokens = () => tokens;
const axios = require('axios');

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
      return res.status(400).send(`Erro OAuth: ${error}`);
    }

    if (!code) {
      return res.status(400).send('Código de autorização ausente.');
    }

    console.log('🔄 Exchanging code for token...');

    const formData = new URLSearchParams();
    formData.append('grant_type', 'authorization_code');
    formData.append('client_id', process.env.HUBSPOT_CLIENT_ID || process.env.CLIENT_ID);
    formData.append('client_secret', process.env.HUBSPOT_CLIENT_SECRET || process.env.CLIENT_SECRET);
    formData.append('redirect_uri', process.env.HUBSPOT_REDIRECT_URI || process.env.REDIRECT_URI);
    formData.append('code', code);

    const authRes = await axios.post('https://api.hubapi.com/oauth/v1/token', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, refresh_token, expires_in, hub_id } = authRes.data;

    tokens.portalId = hub_id;
    tokens.accessToken = access_token;
    tokens.refreshToken = refresh_token;
    tokens.expiresAt = expires_in ? Date.now() + (expires_in * 1000) : null;

    console.log('✅ Token received:', hub_id);

    return res.status(302).setHeader('Location', '/?success=true').end();

  } catch (error) {
    console.error('OAuth callback error:', error.response?.data || error.message);
    return res.status(500).json(error.response?.data || { error: error.message });
  }
};

// Exportar para o outro arquivo
module.exports.getTokens = () => tokens;
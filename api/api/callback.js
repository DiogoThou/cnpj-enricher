const axios = require('axios');

// Store temporário em memória
let tokens = {
  portalId: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null
};

module.exports = async (req, res) => {
  // Permitir GET e POST para callback OAuth
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, error, error_description } = req.query;

    // Se houver erro do OAuth
    if (error) {
      console.error('OAuth error:', error, error_description);
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Erro OAuth</title>
          <style>
            body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; }
            .error { background: #fee; padding: 20px; border-radius: 10px; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>❌ Erro na autorização</h2>
            <p><strong>Erro:</strong> ${error}</p>
            <p>${error_description || ''}</p>
            <a href="/">← Voltar</a>
          </div>
        </body>
        </html>
      `);
    }

    // Verificar se temos o código
    if (!code) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Callback OAuth</title>
          <style>
            body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; }
            .info { background: #e3f2fd; padding: 20px; border-radius: 10px; }
          </style>
        </head>
        <body>
          <div class="info">
            <h2>🔐 OAuth Callback</h2>
            <p>Este endpoint processa o retorno da autorização do HubSpot.</p>
            <p>Parâmetro <code>?code=</code> não foi fornecido.</p>
            <p><strong>URL esperada:</strong> /api/oauth/callback?code=xxx</p>
            <a href="/">← Ir para home</a>
          </div>
        </body>
        </html>
      `);
    }

    // Buscar variáveis de ambiente
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI;

    // Validar configuração
    if (!clientId || !clientSecret || !redirectUri) {
      console.error('Missing environment variables');
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Erro de Configuração</title>
          <style>
            body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; }
            .error { background: #fee; padding: 20px; border-radius: 10px; }
            .check { margin: 10px 0; }
            .ok { color: green; }
            .missing { color: red; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>❌ Erro de Configuração</h2>
            <p>Variáveis de ambiente não configuradas no Vercel:</p>
            <div class="check ${clientId ? 'ok' : 'missing'}">
              ${clientId ? '✅' : '❌'} HUBSPOT_CLIENT_ID
            </div>
            <div class="check ${clientSecret ? 'ok' : 'missing'}">
              ${clientSecret ? '✅' : '❌'} HUBSPOT_CLIENT_SECRET
            </div>
            <div class="check ${redirectUri ? 'ok' : 'missing'}">
              ${redirectUri ? '✅' : '❌'} HUBSPOT_REDIRECT_URI
            </div>
            <p>Configure essas variáveis no painel do Vercel.</p>
          </div>
        </body>
        </html>
      `);
    }

    console.log('🔄 Exchanging code for token...');
    
    // Trocar código por token
    const response = await axios.post(
      'https://api.hubapi.com/oauth/v1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: code
      }),
      {
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token, expires_in, hub_id } = response.data;
    
    console.log('✅ Token received:', {
      hub_id,
      has_access_token: !!access_token,
      has_refresh_token: !!refresh_token,
      expires_in
    });

    // Armazenar tokens em memória (temporário)
    tokens.portalId = hub_id;
    tokens.accessToken = access_token;
    tokens.refreshToken = refresh_token;
    tokens.expiresAt = expires_in ? Date.now() + (expires_in * 1000) : null;

    // Exportar para uso em outros módulos
    module.exports.tokens = tokens;

    // Redirecionar para home com sucesso
    return res.status(302).setHeader('Location', '/?success=true').end();

  } catch (error) {
    console.error('OAuth callback error:', error.response?.data || error.message);
    
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Erro</title>
        <style>
          body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; }
          .error { background: #fee; padding: 20px; border-radius: 10px; }
          pre { background: #f5f5f5; padding: 10px; overflow: auto; }
        </style>
      </head>
      <body>
        <div class="error">
          <h2>❌ Erro no OAuth</h2>
          <p>Falha ao trocar código por token:</p>
          <pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>
          <a href="/">← Voltar</a>
        </div>
      </body>
      </html>
    `);
  }
};

// Exportar tokens para uso em outros módulos
module.exports.getTokens = () => tokens;
module.exports.setTokens = (newTokens) => { tokens = { ...tokens, ...newTokens }; };
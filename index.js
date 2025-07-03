const express = require('express');
const axios = require('axios');
const app = express();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://seu-vercel-app.vercel.app/oauth/callback';

app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;

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
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token } = response.data;

    console.log('Access Token:', access_token);
    console.log('Refresh Token:', refresh_token);

    res.send('✅ App instalado com sucesso no HubSpot!');
  } catch (error) {
    console.error('Erro ao trocar o código pelo token:', error.response?.data || error.message);
    res.status(500).send('❌ Erro na autorização.');
  }
});

// Porta automática do Vercel
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

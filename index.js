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

    // Mostra na tela também
    res.send(`
      <h1>✅ App autorizado com sucesso!</h1>
      <p><strong>Access Token:</strong> ${access_token}</p>
      <p><strong>Refresh Token:</strong> ${refresh_token}</p>
      <p><strong>Expira em:</strong> ${expires_in} segundos</p>
      <p><em>Copie os tokens e armazene em local seguro.</em></p>
    `);

  } catch (error) {
    console.error('❌ Erro ao trocar o code pelo token:', error.response?.data || error.message);
    res.status(500).send('❌ Erro ao gerar token.');
  }
});

const mysql = require('mysql2/promise');
const axios = require('axios');

module.exports = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código ausente.');

  let connection;
  try {
    // 1. Troca o código pelo token
    const authRes = await axios.post('https://api.hubapi.com/oauth/v1/token', new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.HUBSPOT_CLIENT_ID || process.env.CLIENT_ID,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET || process.env.CLIENT_SECRET,
      redirect_uri: process.env.HUBSPOT_REDIRECT_URI || process.env.REDIRECT_URI,
      code
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const { access_token, refresh_token, expires_in, hub_id } = authRes.data;

    // 2. Conectar ao MySQL Externo
    connection = await mysql.createConnection(process.env.MYSQL_URL);
    console.log('🔌 Conectado ao MySQL com sucesso!');

   const sql = `
      INSERT INTO hubspot_tokens (portal_id, access_token, refresh_token, expires_at, updated_at)
      VALUES (?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE 
      access_token = VALUES(access_token), 
      refresh_token = VALUES(refresh_token), 
      expires_at = VALUES(expires_at),
      updated_at = NOW()
    `;
    
    // O await aqui é obrigatório para a Vercel não fechar antes de salvar
    await connection.execute(sql, [
      String(hub_id), 
      access_token, 
      refresh_token, 
      Date.now() + (expires_in * 1000)
    ]);

    console.log(`✅ Token salvo no banco para o portal ${hub_id}`);

    // Fecha a conexão antes de terminar
    await connection.end();

    return res.status(302).setHeader('Location', '/?success=true').end();
  } catch (err) {
    console.error('❌ Erro no Callback:', err.message);
    if (connection) await connection.end();
    return res.status(500).send(`Erro ao processar: ${err.message}`);
  }
};
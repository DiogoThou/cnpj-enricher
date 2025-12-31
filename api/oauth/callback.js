const mysql = require('mysql2/promise');
const axios = require('axios');

module.exports = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código ausente.');

  try {
    // 1. Troca o código pelo Token no HubSpot
    const authRes = await axios.post('https://api.hubapi.com/oauth/v1/token', new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.HUBSPOT_CLIENT_ID || process.env.CLIENT_ID,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET || process.env.CLIENT_SECRET,
      redirect_uri: process.env.HUBSPOT_REDIRECT_URI || process.env.REDIRECT_URI,
      code
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const { access_token, refresh_token, expires_in, hub_id } = authRes.data;

    // 2. Abre o caderno (MySQL) e anota a chave
    const connection = await mysql.createConnection(process.env.MYSQL_URL);
    const sql = `
      INSERT INTO hubspot_tokens (portal_id, access_token, refresh_token, expires_at)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
      access_token = VALUES(access_token), 
      refresh_token = VALUES(refresh_token), 
      expires_at = VALUES(expires_at)
    `;
    await connection.execute(sql, [String(hub_id), access_token, refresh_token, Date.now() + (expires_in * 1000)]);
    await connection.end();

    return res.status(302).setHeader('Location', '/?success=true').end();
  } catch (err) {
    console.error('Erro no MySQL:', err.message);
    return res.status(500).send('Erro ao guardar o token no banco.');
  }
};
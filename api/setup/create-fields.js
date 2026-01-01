const mysql = require('mysql2/promise');
const axios = require('axios');

module.exports = async (req, res) => {
  let connection;
  try {
    connection = await mysql.createConnection(process.env.MYSQL_URL);
    
    // Busca o token mais recente
    const [rows] = await connection.execute('SELECT access_token, portal_id FROM hubspot_tokens LIMIT 1');
    await connection.end();

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Token não encontrado no MySQL. Reinstale o app.' });
    }

    const accessToken = rows[0].access_token;
    // ... sua lógica de criação de campos continua aqui usando o accessToken acima ...

    return res.status(200).json({ ok: true, portalId: rows[0].portal_id, msg: "Lido do MySQL!" });
  } catch (err) {
    if (connection) await connection.end();
    return res.status(500).json({ ok: false, error: err.message });
  }
};
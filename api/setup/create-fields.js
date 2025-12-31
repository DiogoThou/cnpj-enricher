const mysql = require('mysql2/promise');
const axios = require('axios');

module.exports = async (req, res) => {
  try {
    // 1. Abre o caderno e lê a chave
    const connection = await mysql.createConnection(process.env.MYSQL_URL);
    const [rows] = await connection.execute('SELECT access_token, portal_id FROM hubspot_tokens LIMIT 1');
    await connection.end();

    if (rows.length === 0) return res.status(401).json({ ok: false, error: 'Instale o app primeiro!' });

    const accessToken = rows[0].access_token;

    // 2. Faz o trabalho no HubSpot (Cria os campos)
    // (Mantemos a sua lógica de criação de campos aqui...)
    
    return res.status(200).json({ ok: true, portalId: rows[0].portal_id, msg: "Campos criados via MySQL!" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
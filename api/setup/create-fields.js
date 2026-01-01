const mysql = require('mysql2/promise');
const axios = require('axios');

const COMPANY_FIELDS = [
  { name: "status_enriquecimento", label: "Status do enriquecimento", type: "enumeration", fieldType: "select", groupName: "companyinformation", options: [{ label: "Pendente", value: "pendente" }, { label: "Enriquecer", value: "enriquecer" }, { label: "Enriquecido", value: "enriquecido" }, { label: "Erro", value: "erro" }] },
  { name: "teste_cnpj", label: "Relatório do CNPJ (teste)", type: "string", fieldType: "textarea", groupName: "companyinformation" },
  { name: "cnpj_numero", label: "CNPJ (número)", type: "string", fieldType: "text", groupName: "companyinformation" }
];

module.exports = async (req, res) => {
  // LIBERAÇÃO TOTAL DE CABEÇALHOS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  console.log('🚀 REQUISIÇÃO RECEBIDA! Método:', req.method);

  let connection;
  try {
    connection = await mysql.createConnection(process.env.MYSQL_URL);
    const [rows] = await connection.execute('SELECT access_token, portal_id FROM hubspot_tokens ORDER BY updated_at DESC LIMIT 1');
    await connection.end();

    if (rows.length === 0) return res.status(401).json({ ok: false, error: 'Token não encontrado' });

    const accessToken = rows[0].access_token;
    
    for (const field of COMPANY_FIELDS) {
      try {
        await axios.post('https://api.hubapi.com/crm/v3/properties/companies', field, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
      } catch (e) { /* Ignora se já existir */ }
    }

    return res.status(200).json({ ok: true, portalId: rows[0].portal_id, msg: "Campos processados!" });
  } catch (err) {
    if (connection) await connection.end();
    return res.status(500).json({ ok: false, error: err.message });
  }
};
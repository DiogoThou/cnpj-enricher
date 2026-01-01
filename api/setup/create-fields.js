const mysql = require('mysql2/promise');
const axios = require('axios');

const COMPANY_FIELDS = [
  {
    name: "status_enriquecimento",
    label: "Status do enriquecimento",
    type: "enumeration",
    fieldType: "select",
    groupName: "companyinformation",
    options: [
      { label: "Pendente", value: "pendente" },
      { label: "Enriquecer", value: "enriquecer" },
      { label: "Enriquecido", value: "enriquecido" },
      { label: "Erro", value: "erro" }
    ]
  },
  {
    name: "teste_cnpj",
    label: "Relatório do CNPJ (teste)",
    type: "string",
    fieldType: "textarea",
    groupName: "companyinformation"
  },
  {
    name: "cnpj_numero",
    label: "CNPJ (número)",
    type: "string",
    fieldType: "text",
    groupName: "companyinformation"
  }
];

module.exports = async (req, res) => {
  let connection;
  try {
    connection = await mysql.createConnection(process.env.MYSQL_URL);
    
    // Busca o token no banco. 
    // Como é o primeiro teste, pegamos o último salvo.
    const [rows] = await connection.execute(
      'SELECT access_token, portal_id FROM hubspot_tokens ORDER BY updated_at DESC LIMIT 1'
    );
    await connection.end();

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Nenhum token encontrado no banco de dados. Reinstale o app.' });
    }

    const accessToken = rows[0].access_token;
    const portalId = rows[0].portal_id;
    const results = [];

    // Lógica para criar os campos no HubSpot
    for (const field of COMPANY_FIELDS) {
      try {
        await axios.post(
          'https://api.hubapi.com/crm/v3/properties/companies',
          field,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        results.push({ name: field.name, status: 'created' });
      } catch (err) {
        if (err.response?.status === 409) {
          results.push({ name: field.name, status: 'already_exists' });
        } else {
          console.error(`Erro no campo ${field.name}:`, err.response?.data);
          throw err;
        }
      }
    }

    return res.status(200).json({ 
      ok: true, 
      portalId, 
      results,
      msg: "Campos processados com sucesso!" 
    });

  } catch (err) {
    if (connection) await connection.end();
    console.error('Erro Geral:', err.message);
    return res.status(500).json({ 
      ok: false, 
      error: err.response?.data?.message || err.message 
    });
  }
};
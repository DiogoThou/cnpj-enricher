const mysql = require('mysql2/promise');
const axios = require('axios');

// LISTA DE CAMPOS QUE SERÃO CRIADOS
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
  // --- INÍCIO DA PROTEÇÃO CORS (IMPORTANTE PARA O BOTÃO FUNCIONAR) ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  // --- FIM DA PROTEÇÃO CORS ---

  let connection;
  try {
    // 1. Conecta ao seu MySQL usando a URL que você colocou na Vercel
    connection = await mysql.createConnection(process.env.MYSQL_URL);
    
    // 2. Busca o token mais recente que foi salvo durante a instalação
    const [rows] = await connection.execute(
      'SELECT access_token, portal_id FROM hubspot_tokens ORDER BY updated_at DESC LIMIT 1'
    );
    await connection.end();

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Token não encontrado. Reinstale o app.' });
    }

    const accessToken = rows[0].access_token;
    const portalId = rows[0].portal_id;
    const results = [];

    // 3. Loop para criar cada campo no HubSpot
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
        // Se o campo já existir (erro 409), ignoramos o erro e marcamos como ok
        if (err.response?.status === 409) {
          results.push({ name: field.name, status: 'already_exists' });
        } else {
          throw err;
        }
      }
    }

    // 4. Resposta final para o botão do HubSpot
    return res.status(200).json({ 
      ok: true, 
      portalId, 
      results,
      msg: "Configuração concluída com sucesso!" 
    });

  } catch (err) {
    if (connection) await connection.end();
    return res.status(500).json({ 
      ok: false, 
      error: err.response?.data?.message || err.message 
    });
  }
};
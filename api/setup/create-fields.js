const mysql = require('mysql2/promise');
const axios = require('axios');

const COMPANY_FIELDS = [
  { name: "status_enriquecimento", label: "Status do enriquecimento" },
  { name: "teste_cnpj", label: "Relatório do CNPJ (teste)" },
  { name: "cnpj_numero", label: "CNPJ (número)" }
];

module.exports = async (req, res) => {
  let connection;
  let results = [];
  let portalId = "Desconhecido";

  try {
    connection = await mysql.createConnection(process.env.MYSQL_URL);
    const [rows] = await connection.execute(
      'SELECT access_token, portal_id FROM hubspot_tokens ORDER BY updated_at DESC LIMIT 1'
    );
    await connection.end();

    if (rows.length === 0) throw new Error('Token não encontrado no banco de dados.');

    const accessToken = rows[0].access_token;
    portalId = rows[0].portal_id;

    // Lógica de criação (simplificada para o exemplo)
    for (const field of COMPANY_FIELDS) {
      try {
        await axios.post(
          'https://api.hubapi.com/crm/v3/properties/companies',
          {
            name: field.name,
            label: field.label,
            type: field.name === "status_enriquecimento" ? "enumeration" : "string",
            fieldType: field.name === "status_enriquecimento" ? "select" : "text",
            groupName: "companyinformation",
            options: field.name === "status_enriquecimento" ? [
              { label: "Pendente", value: "pendente" },
              { label: "Enriquecer", value: "enriquecer" },
              { label: "Enriquecido", value: "enriquecido" },
              { label: "Erro", value: "erro" }
            ] : undefined
          },
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        results.push({ name: field.label, status: 'Criado com sucesso ✅' });
      } catch (err) {
        if (err.response?.status === 409) {
          results.push({ name: field.label, status: 'Já existe na conta ✔️' });
        } else {
          results.push({ name: field.label, status: 'Erro ao configurar ❌' });
        }
      }
    }

    // RETORNO DA PÁGINA VISUAL (HTML)
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Instalador CRM Hub</title>
        <style>
          body { font-family: sans-serif; background: #f4f7f9; display: flex; justify-content: center; padding-top: 50px; }
          .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 400px; }
          h2 { color: #33475b; text-align: center; margin-bottom: 5px; }
          p.subtitle { text-align: center; color: #7c98b6; font-size: 14px; margin-bottom: 25px; }
          .field-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; font-size: 14px; }
          .status { font-weight: bold; }
          .footer { margin-top: 25px; text-align: center; font-size: 12px; color: #99a; }
          .btn { display: block; background: #ff7a59; color: white; text-align: center; padding: 12px; border-radius: 6px; text-decoration: none; margin-top: 20px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Configuração Concluída</h2>
          <p class="subtitle">Portal HubSpot: <b>${portalId}</b></p>
          
          ${results.map(r => `
            <div class="field-row">
              <span>${r.name}</span>
              <span class="status">${r.status}</span>
            </div>
          `).join('')}

          <a href="#" onclick="window.close()" class="btn">Fechar esta página</a>
          <div class="footer">Você já pode voltar para o HubSpot e atualizar a página.</div>
        </div>
      </body>
      </html>
    `);

  } catch (err) {
    if (connection) await connection.end();
    return res.status(500).send(`<h2>Erro na configuração: ${err.message}</h2>`);
  }
};
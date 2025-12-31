const axios = require('axios');
const { getTokens } = require('../oauth/callback');

const COMPANY_FIELDS = [
  {
    name: "status_enriquecimento",
    label: "Status do enriquecimento",
    type: "enumeration",
    fieldType: "select",
    groupName: "companyinformation",
    description: "Controla o status do enriquecimento via app",
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
    groupName: "companyinformation",
    description: "Dados enriquecidos em formato de relatório (teste)"
  },
  {
    name: "cnpj_numero",
    label: "CNPJ (número)",
    type: "string",
    fieldType: "text",
    groupName: "companyinformation",
    description: "CNPJ da empresa"
  }
];

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const tokens = getTokens();
    const { accessToken, portalId } = tokens;

    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        error: "App não autenticado. Por favor, instale o app novamente no HubSpot."
      });
    }

    const results = [];
    const errors = [];

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
          errors.push({ name: field.name, error: err.response?.data?.message || err.message });
        }
      }
    }

    return res.status(200).json({
      ok: errors.length === 0,
      portalId,
      summary: {
        total: COMPANY_FIELDS.length,
        created: results.filter(r => r.status === 'created').length,
        already_exists: results.filter(r => r.status === 'already_exists').length,
        errors: errors.length
      },
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};
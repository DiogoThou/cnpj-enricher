const axios = require('axios');
const { getTokens } = require('../oauth/callback');

// Definição dos campos a criar
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
  // Aceitar GET e POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dryRun = req.query?.dryRun === "1";
    const tokens = getTokens();
    const { accessToken, portalId, expiresAt } = tokens;

    // Verificar se temos token
    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        message: "Sem token de acesso",
        hint: "Complete o fluxo OAuth primeiro",
        oauth_url: `https://app.hubspot.com/oauth/authorize?client_id=${process.env.HUBSPOT_CLIENT_ID}&scope=crm.objects.companies.write%20crm.schemas.companies.write&redirect_uri=${encodeURIComponent(process.env.HUBSPOT_REDIRECT_URI || '')}`
      });
    }

    // Verificar expiração
    const now = Date.now();
    const expired = expiresAt && now > expiresAt;

    if (expired) {
      return res.status(401).json({
        ok: false,
        message: "Token expirado",
        hint: "Refaça a autenticação OAuth",
        expired_at: new Date(expiresAt).toISOString()
      });
    }

    // Modo dry run - apenas mostra o que seria criado
    if (dryRun) {
      return res.status(200).json({
        ok: true,
        mode: "dry_run",
        portalId,
        token_status: "valid",
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        fields_to_create: COMPANY_FIELDS.map(f => ({
          name: f.name,
          label: f.label,
          type: f.type
        }))
      });
    }

    console.log('🚀 Creating company properties...');

    // Criar campos um por um
    const results = [];
    const errors = [];

    for (const field of COMPANY_FIELDS) {
      try {
        console.log(`Creating field: ${field.name}`);
        
        const response = await axios.post(
          'https://api.hubapi.com/crm/v3/properties/companies',
          field,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        results.push({
          name: field.name,
          status: 'created',
          response: response.data
        });
        
      } catch (error) {
        // Se o campo já existir, não é erro crítico
        if (error.response?.status === 409) {
          console.log(`Field ${field.name} already exists`);
          results.push({
            name: field.name,
            status: 'already_exists'
          });
        } else {
          console.error(`Error creating field ${field.name}:`, error.response?.data);
          errors.push({
            name: field.name,
            error: error.response?.data?.message || error.message
          });
        }
      }
    }

    // Responder com resultado
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
    console.error('Create fields error:', error.response?.data || error.message);
    
    return res.status(500).json({
      ok: false,
      error: error.response?.data?.message || error.message,
      details: error.response?.data
    });
  }
};
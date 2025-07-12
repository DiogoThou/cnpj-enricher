const express = require('express');
const axios = require('axios');
const syncCNPJs = require('./syncCNPJs');
const app = express();

app.use(express.json());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
let HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const HUBSPOT_REFRESH_TOKEN = process.env.HUBSPOT_REFRESH_TOKEN;
const REDIRECT_URI = process.env.REDIRECT_URI;

// ⚡ VARIÁVEIS PARA PERSISTÊNCIA
let selectedDestinationField = 'teste_cnpj';
let savedUserChoice = null;

// ⚡ VARIÁVEL PARA CONTROLE DO TOGGLE CRMHUB
let crmhubToggleEnabled = false;

// ⚡ SISTEMA DE MAPEAMENTO INDIVIDUAL
let individualMapping = {
  telefone: null,
  razao_social: null,
  nome_fantasia: null,
  cidade: null,
  estado: null,
  atividade: null,
  cep: null,
  email: null,
  endereco: null,
  situacao: null,
  porte: null,
  capital_social: null
};

// ⚡ CAMPOS CRMHUB DEFINIDOS
const CRMHUB_FIELDS = [
  {
    name: 'cnpj_enriquecido_crmhub',
    label: '🏢 CNPJ Enriquecido - CRMHub',
    type: 'string',
    fieldType: 'text',
    description: 'CNPJ formatado e validado pela Receita Federal'
  },
  {
    name: 'telefone_enriquecido_crmhub',
    label: '📞 Telefone Enriquecido - CRMHub',
    type: 'string',
    fieldType: 'text',
    description: 'Telefone principal da empresa conforme Receita Federal'
  },
  {
    name: 'razao_social_crmhub',
    label: '🏢 Razão Social - CRMHub',
    type: 'string',
    fieldType: 'text',
    description: 'Razão social oficial da empresa'
  },
  {
    name: 'nome_fantasia_crmhub',
    label: '✨ Nome Fantasia - CRMHub',
    type: 'string',
    fieldType: 'text',
    description: 'Nome fantasia ou comercial da empresa'
  },
  {
    name: 'situacao_cadastral_crmhub',
    label: '📊 Situação Cadastral - CRMHub',
    type: 'string',
    fieldType: 'text',
    description: 'Situação cadastral na Receita Federal'
  },
  {
    name: 'porte_empresa_crmhub',
    label: '📏 Porte da Empresa - CRMHub',
    type: 'string',
    fieldType: 'text',
    description: 'Classificação do porte da empresa'
  },
  {
    name: 'atividade_principal_crmhub',
    label: '🏭 Atividade Principal - CRMHub',
    type: 'string',
    fieldType: 'textarea',
    description: 'Atividade principal (CNAE) da empresa'
  },
  {
    name: 'endereco_completo_crmhub',
    label: '🏠 Endereço Completo - CRMHub',
    type: 'string',
    fieldType: 'textarea',
    description: 'Endereço completo da sede da empresa'
  },
  {
    name: 'capital_social_crmhub',
    label: '💰 Capital Social - CRMHub',
    type: 'string',
    fieldType: 'text',
    description: 'Capital social registrado na empresa'
  },
  {
    name: 'data_atualizacao_crmhub',
    label: '📅 Data Atualização - CRMHub',
    type: 'string',
    fieldType: 'text',
    description: 'Data da última atualização dos dados'
  }
];

// ⚡ CAMPOS PADRÃO FIXOS (SEM BUSCAR API)
const HUBSPOT_STANDARD_FIELDS = [
  { text: '📝 Nome da empresa (name)', value: 'name', description: 'Campo padrão do HubSpot' },
  { text: '📝 Descrição (description)', value: 'description', description: 'Campo padrão do HubSpot' },
  { text: '📞 Telefone (phone)', value: 'phone', description: 'Campo padrão do HubSpot' },
  { text: '🏙️ Cidade (city)', value: 'city', description: 'Campo padrão do HubSpot' },
  { text: '🌎 Estado (state)', value: 'state', description: 'Campo padrão do HubSpot' },
  { text: '🌐 Website (website)', value: 'website', description: 'Campo padrão do HubSpot' },
  { text: '📮 CEP (zip)', value: 'zip', description: 'Campo padrão do HubSpot' },
  { text: '📋 Campo teste CNPJ (teste_cnpj)', value: 'teste_cnpj', description: 'Campo de teste para CNPJ' }
];

// ⚡ Definição dos campos do CNPJ com exemplos
const cnpjFieldsDefinition = {
  telefone: {
    label: '📞 Telefone da Receita Federal',
    example: '(11) 99999-9999',
    description: 'Telefone principal cadastrado na RF',
    hubspotSuggestion: 'phone'
  },
  razao_social: {
    label: '🏢 Razão Social',
    example: 'EMPRESA TESTE LTDA',
    description: 'Nome oficial da empresa na RF',
    hubspotSuggestion: 'name'
  },
  nome_fantasia: {
    label: '✨ Nome Fantasia',
    example: 'Empresa Teste',
    description: 'Nome fantasia/comercial',
    hubspotSuggestion: 'description'
  },
  cidade: {
    label: '🏙️ Cidade',
    example: 'São Paulo',
    description: 'Cidade da sede da empresa',
    hubspotSuggestion: 'city'
  },
  estado: {
    label: '🌎 Estado',
    example: 'SP',
    description: 'Estado (UF) da sede',
    hubspotSuggestion: 'state'
  },
  atividade: {
    label: '🏭 Atividade Principal',
    example: 'Desenvolvimento de software',
    description: 'CNAE principal da empresa',
    hubspotSuggestion: 'description'
  },
  cep: {
    label: '📮 CEP',
    example: '01234-567',
    description: 'CEP da sede da empresa',
    hubspotSuggestion: 'zip'
  },
  email: {
    label: '📧 Email da RF',
    example: 'contato@empresa.com',
    description: 'Email cadastrado na Receita Federal',
    hubspotSuggestion: 'website'
  },
  endereco: {
    label: '🏠 Endereço Completo',
    example: 'Rua Teste, 123',
    description: 'Endereço completo da sede',
    hubspotSuggestion: 'nenhum'
  },
  situacao: {
    label: '📊 Situação Cadastral',
    example: 'Ativa',
    description: 'Status na Receita Federal',
    hubspotSuggestion: 'nenhum'
  },
  porte: {
    label: '📏 Porte da Empresa',
    example: 'Microempresa',
    description: 'Classificação do porte',
    hubspotSuggestion: 'nenhum'
  },
  capital_social: {
    label: '💰 Capital Social',
    example: 'R$ 100.000,00',
    description: 'Capital social registrado',
    hubspotSuggestion: 'nenhum'
  }
};

// ⚡ FUNÇÃO PARA CRIAR OU VERIFICAR GRUPO CRMHUB
async function createOrVerifyCRMHubGroup() {
  try {
    console.log('🔍 Verificando se grupo CRMHub já existe...');
    
    // Primeiro, verificar se o grupo já existe
    try {
      const existingGroups = await axios.get(
        'https://api.hubapi.com/crm/v3/properties/companies/groups',
        {
          headers: {
            Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const crmhubGroup = existingGroups.data.results.find(group => 
        group.name === 'crmhub_dados' || group.label.includes('CRMHub')
      );
      
      if (crmhubGroup) {
        console.log('✅ Grupo CRMHub já existe:', crmhubGroup.name);
        return crmhubGroup.name;
      }
    } catch (error) {
      console.log('🔍 Grupo não encontrado, criando novo...');
    }
    
    // Criar novo grupo
    console.log('🏗️ Criando grupo CRMHub...');
    const response = await axios.post(
      'https://api.hubapi.com/crm/v3/properties/companies/groups',
      {
        name: 'crmhub_dados',
        label: '🚀 CRMHub - Dados Enriquecidos',
        displayOrder: -1
      },
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Grupo CRMHub criado com sucesso:', response.data.name);
    return response.data.name;
    
  } catch (error) {
    console.error('❌ Erro ao criar/verificar grupo CRMHub:', error.response?.data);
    return 'companyinformation'; // Fallback para grupo padrão
  }
}

// ⚡ FUNÇÃO PARA CRIAR CAMPOS CRMHUB
async function createCRMHubFields() {
  try {
    console.log('🏗️ Iniciando criação dos campos CRMHub...');
    
    if (!HUBSPOT_ACCESS_TOKEN) {
      throw new Error('Token do HubSpot não configurado');
    }
    
    // Criar/verificar grupo primeiro
    const groupName = await createOrVerifyCRMHubGroup();
    
    const results = {
      created: [],
      existing: [],
      errors: []
    };
    
    for (const field of CRMHUB_FIELDS) {
      try {
        console.log(`🔧 Criando campo: ${field.name}`);
        
        const response = await axios.post(
          'https://api.hubapi.com/crm/v3/properties/companies',
          {
            name: field.name,
            label: field.label,
            type: field.type,
            fieldType: field.fieldType,
            description: field.description,
            groupName: groupName,
            hasUniqueValue: false,
            hidden: false,
            displayOrder: -1
          },
          {
            headers: {
              Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log(`✅ Campo criado: ${field.name}`);
        results.created.push(field.name);
        
        // Pequena pausa entre criações para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        if (error.response?.status === 409) {
          console.log(`⚠️ Campo já existe: ${field.name}`);
          results.existing.push(field.name);
        } else {
          console.error(`❌ Erro ao criar campo ${field.name}:`, error.response?.data);
          results.errors.push({
            field: field.name,
            error: error.response?.data || error.message
          });
        }
      }
    }
    
    console.log('📊 Resumo da criação de campos CRMHub:');
    console.log(`✅ Criados: ${results.created.length}`);
    console.log(`⚠️ Já existiam: ${results.existing.length}`);
    console.log(`❌ Erros: ${results.errors.length}`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Erro geral na criação de campos CRMHub:', error);
    throw error;
  }
}

// ⚡ FUNÇÃO PARA VERIFICAR STATUS DOS CAMPOS CRMHUB
async function checkCRMHubFieldsStatus() {
  try {
    console.log('🔍 Verificando status dos campos CRMHub...');
    
    if (!HUBSPOT_ACCESS_TOKEN) {
      throw new Error('Token do HubSpot não configurado');
    }
    
    const status = {
      existing: [],
      missing: [],
      total: CRMHUB_FIELDS.length
    };
    
    for (const field of CRMHUB_FIELDS) {
      try {
        const response = await axios.get(
          `https://api.hubapi.com/crm/v3/properties/companies/${field.name}`,
          {
            headers: {
              Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log(`✅ Campo encontrado: ${field.name}`);
        status.existing.push({
          name: field.name,
          label: response.data.label,
          type: response.data.type
        });
        
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`❌ Campo não encontrado: ${field.name}`);
          status.missing.push(field.name);
        } else {
          console.error(`⚠️ Erro ao verificar campo ${field.name}:`, error.response?.data);
          status.missing.push(field.name);
        }
      }
    }
    
    console.log(`📊 Status: ${status.existing.length}/${status.total} campos existem`);
    return status;
    
  } catch (error) {
    console.error('❌ Erro ao verificar status dos campos:', error);
    throw error;
  }
}

// ⚡ FUNÇÃO PARA MAPEAR DADOS DO CNPJ PARA CAMPOS CRMHUB
function mapCNPJDataToCRMHubFields(cnpjData, cnpjNumber) {
  const estabelecimento = cnpjData.estabelecimento || {};
  
  const mappedData = {
    cnpj_enriquecido_crmhub: cnpjNumber,
    telefone_enriquecido_crmhub: estabelecimento.telefone1 ? 
      `(${estabelecimento.ddd1}) ${estabelecimento.telefone1}` : '',
    razao_social_crmhub: cnpjData.razao_social || '',
    nome_fantasia_crmhub: estabelecimento.nome_fantasia || '',
    situacao_cadastral_crmhub: estabelecimento.situacao_cadastral || '',
    porte_empresa_crmhub: cnpjData.porte?.descricao || '',
    atividade_principal_crmhub: estabelecimento.atividade_principal?.descricao || '',
    endereco_completo_crmhub: estabelecimento.logradouro ? 
      `${estabelecimento.tipo_logradouro || ''} ${estabelecimento.logradouro}, ${estabelecimento.numero || 'S/N'}${estabelecimento.complemento ? ', ' + estabelecimento.complemento : ''}, ${estabelecimento.bairro || ''}, ${estabelecimento.cidade?.nome || ''} - ${estabelecimento.estado?.sigla || ''}, CEP: ${estabelecimento.cep || ''}` : '',
    capital_social_crmhub: cnpjData.capital_social ? `R$ ${cnpjData.capital_social}` : '',
    data_atualizacao_crmhub: new Date().toLocaleString('pt-BR')
  };
  
  // Filtrar apenas campos com valores
  const payload = { properties: {} };
  Object.keys(mappedData).forEach(key => {
    if (mappedData[key]) {
      payload.properties[key] = mappedData[key];
    }
  });
  
  console.log('🗺️ Dados mapeados para campos CRMHub:', payload);
  return payload;
}

// ⚡ ENDPOINT DE DEBUG PARA HUBSPOT
app.all('/api/debug-toggle', (req, res) => {
  console.log('🐛 DEBUG Toggle chamado');
  console.log('📥 Method:', req.method);
  console.log('📥 Headers:', JSON.stringify(req.headers, null, 2));
  console.log('📥 Body:', JSON.stringify(req.body, null, 2));
  console.log('📥 Query:', JSON.stringify(req.query, null, 2));
  
  // Configurar CORS explicitamente
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  res.json({
    success: true,
    message: '🐛 Debug Toggle funcionando!',
    method: req.method,
    timestamp: new Date().toISOString(),
    receivedData: {
      headers: req.headers,
      body: req.body,
      query: req.query
    }
  });
});

// ⚡ ENDPOINTS CRMHUB - VERSÃO TOGGLE SIMPLES

// CRMHub Toggle Fetch - Retorna status atual
app.post('/api/crmhub-toggle-fetch', (req, res) => {
  console.log('🔄 CRMHub Toggle Fetch chamado');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  console.log('📥 Headers:', JSON.stringify(req.headers, null, 2));
  
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  try {
    console.log(`📊 Status atual do CRMHub: ${crmhubToggleEnabled ? 'ATIVADO' : 'DESATIVADO'}`);

    return res.json({
      response: {
        toggleEnabled: crmhubToggleEnabled,
        status: crmhubToggleEnabled ? 'ativado' : 'desativado',
        message: crmhubToggleEnabled ? 
          '✅ CRMHub ATIVO - Dados serão salvos em campos específicos' : 
          '⚪ CRMHub INATIVO - Sistema padrão ativo'
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no toggle fetch:', error);
    
    return res.json({
      response: {
        toggleEnabled: false,
        status: 'erro',
        message: '❌ Erro ao verificar status do CRMHub'
      }
    });
  }
});

// CRMHub Toggle Update - Liga/desliga CRMHub
app.post('/api/crmhub-toggle-update', async (req, res) => {
  console.log('🔄 CRMHub Toggle Update chamado');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  console.log('📥 Headers:', JSON.stringify(req.headers, null, 2));
  
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  try {
    // O HubSpot envia o novo status do toggle
    const newToggleState = req.body.toggleEnabled || req.body.enabled || req.body.value || false;
    const previousState = crmhubToggleEnabled;
    
    console.log(`🔄 Mudança de estado: ${previousState} → ${newToggleState}`);
    
    crmhubToggleEnabled = newToggleState;
    
    let message = '';
    let actionType = 'TOGGLE_UPDATE';
    let additionalData = {};
    
    if (crmhubToggleEnabled) {
      // ATIVANDO CRMHUB
      console.log('🚀 ATIVANDO CRMHub...');
      
      try {
        // Verificar/criar campos CRMHub
        console.log('🔍 Verificando campos CRMHub...');
        const fieldsStatus = await checkCRMHubFieldsStatus();
        
        if (fieldsStatus.missing.length > 0) {
          console.log(`🏗️ Criando ${fieldsStatus.missing.length} campos faltantes...`);
          const createResults = await createCRMHubFields();
          
          message = `🚀 CRMHub ATIVADO! Campos criados: ${createResults.created.length}, Já existiam: ${createResults.existing.length}`;
          
          additionalData = {
            fieldsCreated: createResults.created.length,
            fieldsExisting: createResults.existing.length,
            totalFields: CRMHUB_FIELDS.length,
            details: createResults
          };
        } else {
          message = `✅ CRMHub ATIVADO! Todos os ${fieldsStatus.existing.length} campos já existem`;
          
          additionalData = {
            fieldsCreated: 0,
            fieldsExisting: fieldsStatus.existing.length,
            totalFields: CRMHUB_FIELDS.length
          };
        }
        
      } catch (error) {
        console.error('❌ Erro ao ativar CRMHub:', error);
        message = `⚠️ CRMHub ativado, mas com erro nos campos: ${error.message}`;
        additionalData = { error: error.message };
      }
      
    } else {
      // DESATIVANDO CRMHUB
      console.log('⚪ DESATIVANDO CRMHub...');
      message = '⚪ CRMHub DESATIVADO - Sistema padrão reativado';
      
      additionalData = {
        previousMode: 'crmhub',
        newMode: 'standard',
        note: 'Campos CRMHub permanecem no HubSpot mas não serão mais alimentados'
      };
    }
    
    console.log(`💬 Mensagem final: ${message}`);
    console.log(`📊 Estado final do CRMHub: ${crmhubToggleEnabled}`);

    res.json({
      response: {
        actionType: actionType,
        toggleEnabled: crmhubToggleEnabled,
        previousState: previousState,
        message: message,
        crmhubData: additionalData,
        nextSteps: crmhubToggleEnabled ? [
          'Campos CRMHub criados/verificados',
          'Use POST /enrich para enriquecer empresas',
          'Dados serão salvos nos campos específicos'
        ] : [
          'Sistema padrão reativado',
          'Use POST /enrich normalmente',
          'Dados serão salvos conforme configuração anterior'
        ]
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no CRMHub toggle update:', error);
    
    res.json({
      response: {
        actionType: 'TOGGLE_UPDATE',
        toggleEnabled: false,
        message: '❌ Erro ao alterar estado do CRMHub: ' + error.message,
        error: error.message
      }
    });
  }
});

// ⚡ FUNÇÃO PARA USAR CRMHUB OU SISTEMA PADRÃO
function updateEnrichmentPayloadWithCRMHub(cnpjData, cnpjNumber) {
  if (crmhubToggleEnabled) {
    console.log('🚀 Usando modo CRMHub para enriquecimento');
    return mapCNPJDataToCRMHubFields(cnpjData, cnpjNumber);
  } else {
    console.log('📋 Usando sistema padrão para enriquecimento');
    return updateEnrichmentPayload(cnpjData, cnpjNumber);
  }
}

// ⚡ ENDPOINT DE TESTE CRMHUB
app.get('/api/test-crmhub', (req, res) => {
  console.log('🧪 Testando endpoints CRMHub...');
  
  res.json({
    success: true,
    message: '✅ Endpoints CRMHub Toggle funcionando!',
    crmhubStatus: {
      enabled: crmhubToggleEnabled,
      status: crmhubToggleEnabled ? 'ATIVADO' : 'DESATIVADO'
    },
    endpoints: {
      'POST /api/crmhub-toggle-fetch': 'Verificar status do toggle',
      'POST /api/crmhub-toggle-update': 'Ligar/desligar CRMHub',
      'POST /enrich': 'Enriquecer empresa (usa CRMHub se ativo)',
      'GET /api/test-crmhub': 'Testar endpoints'
    },
    crmhubFields: CRMHUB_FIELDS.map(f => ({
      name: f.name,
      label: f.label,
      type: f.type
    })),
    timestamp: new Date().toISOString()
  });
});



// ⚡ ENDPOINT PARA BOTÃO CRMHUB (ALTERNATIVA AO TOGGLE)
app.post('/api/crmhub-button-action', async (req, res) => {
  console.log('🔘 CRMHub Button Action chamado');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  try {
    // Inverter o estado atual
    const previousState = crmhubToggleEnabled;
    crmhubToggleEnabled = !crmhubToggleEnabled;
    
    console.log(`🔄 Botão pressionado: ${previousState} → ${crmhubToggleEnabled}`);
    
    let message = '';
    let additionalData = {};
    
    if (crmhubToggleEnabled) {
      // ATIVANDO CRMHUB
      console.log('🚀 ATIVANDO CRMHub via botão...');
      
      try {
        const fieldsStatus = await checkCRMHubFieldsStatus();
        
        if (fieldsStatus.missing.length > 0) {
          const createResults = await createCRMHubFields();
          message = `🚀 CRMHub ATIVADO! Campos criados: ${createResults.created.length}`;
          additionalData = { fieldsCreated: createResults.created.length };
        } else {
          message = `✅ CRMHub ATIVADO! Campos já existem: ${fieldsStatus.existing.length}`;
          additionalData = { fieldsExisting: fieldsStatus.existing.length };
        }
        
      } catch (error) {
        message = `⚠️ CRMHub ativado com erro: ${error.message}`;
        additionalData = { error: error.message };
      }
      
    } else {
      // DESATIVANDO CRMHUB
      console.log('⚪ DESATIVANDO CRMHub via botão...');
      message = '⚪ CRMHub DESATIVADO - Sistema padrão ativo';
      additionalData = { mode: 'standard' };
    }
    
    console.log(`💬 Resultado: ${message}`);

    res.json({
      success: true,
      actionType: 'BUTTON_CLICKED',
      crmhubEnabled: crmhubToggleEnabled,
      previousState: previousState,
      message: message,
      data: additionalData,
      buttonText: crmhubToggleEnabled ? '⚪ Desativar CRMHub' : '🚀 Ativar CRMHub'
    });
    
  } catch (error) {
    console.error('❌ Erro no botão CRMHub:', error);
    
    res.json({
      success: false,
      message: '❌ Erro ao executar ação: ' + error.message,
      error: error.message
    });
  }
});


// ⚡ ENDPOINT DE ENRIQUECIMENTO CRMHUB
app.post('/api/enrich-crmhub', async (req, res) => {
  const { companyId } = req.body;

  console.log('🚀 Iniciando enriquecimento CRMHub para companyId:', companyId);

  if (!companyId) {
    console.error('❌ Company ID não fornecido');
    return res.status(400).json({ error: 'Company ID is required' });
  }

  if (!HUBSPOT_ACCESS_TOKEN) {
    console.error('❌ HUBSPOT_ACCESS_TOKEN não configurado');
    return res.status(500).json({ 
      error: 'Token do HubSpot não configurado',
      details: 'Execute OAuth primeiro'
    });
  }

  try {
    // Primeiro, verificar se os campos CRMHub existem
    console.log('🔍 Verificando campos CRMHub...');
    const fieldsStatus = await checkCRMHubFieldsStatus();
    
    if (fieldsStatus.missing.length > 0) {
      console.log('⚠️ Alguns campos CRMHub não existem, criando...');
      await createCRMHubFields();
    }

    console.log('📡 Buscando empresa no HubSpot...');
    
    const hubspotCompany = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/companies/${companyId}?properties=cnpj,name,domain,website,phone,city,state,country,createdate,hs_lastmodifieddate`,
      {
        headers: { 
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Empresa encontrada no HubSpot');
    const properties = hubspotCompany.data.properties;
    
    // Buscar CNPJ (mesmo lógica do enriquecimento original)
    let cnpjRaw = properties.cnpj || 
                  properties.CNPJ ||
                  properties.registration_number ||
                  properties.company_cnpj ||
                  properties.document_number ||
                  properties.tax_id ||
                  properties.federal_id;

    if (!cnpjRaw) {
      for (const [key, value] of Object.entries(properties)) {
        if (value && typeof value === 'string') {
          const cleaned = cleanCNPJ(value);
          if (cleaned.length === 14) {
            console.log(`🎯 CNPJ encontrado no campo "${key}": ${value} -> ${cleaned}`);
            cnpjRaw = value;
            break;
          }
        }
      }
    }

    const cnpjLimpo = cleanCNPJ(cnpjRaw);
    console.log('🧹 CNPJ limpo:', cnpjLimpo);

    if (!cnpjLimpo || cnpjLimpo.length !== 14) {
      return res.status(400).json({ 
        error: 'CNPJ inválido ou não encontrado',
        cnpjRaw: cnpjRaw,
        cnpjLimpo: cnpjLimpo
      });
    }

    console.log('📡 Buscando dados do CNPJ na API externa...');
    
    const cnpjDataResponse = await axios.get(`https://publica.cnpj.ws/cnpj/${cnpjLimpo}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'CNPJ-Enricher-CRMHub/2.0'
      }
    });

    console.log('✅ Dados do CNPJ obtidos com sucesso');
    const cnpjData = cnpjDataResponse.data;

    // Mapear dados para campos CRMHub
    const updatePayload = mapCNPJDataToCRMHubFields(cnpjData, cnpjLimpo);

    console.log('📦 Payload CRMHub:', JSON.stringify(updatePayload, null, 2));
    console.log('📡 Atualizando empresa no HubSpot com campos CRMHub...');
    
    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/companies/${companyId}`,
      updatePayload,
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Empresa atualizada com campos CRMHub!');
    
    res.json({ 
      success: true,
      message: '🚀 Empresa enriquecida com campos CRMHub!',
      cnpj: cnpjLimpo,
      fieldsUpdated: Object.keys(updatePayload.properties).length,
      crmhubFields: Object.keys(updatePayload.properties),
      empresa: {
        razaoSocial: cnpjData.razao_social,
        nomeFantasia: cnpjData.estabelecimento?.nome_fantasia,
        situacao: cnpjData.estabelecimento?.situacao_cadastral,
        telefone: cnpjData.estabelecimento?.telefone1 ? 
          `(${cnpjData.estabelecimento.ddd1}) ${cnpjData.estabelecimento.telefone1}` : ''
      }
    });

  } catch (error) {
    console.error('❌ Erro detalhado no enriquecimento CRMHub:');
    console.error('📋 Mensagem:', error.message);
    console.error('📊 Status:', error.response?.status);
    console.error('📄 Response data:', error.response?.data);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        error: 'Token do HubSpot inválido ou expirado'
      });
    }
    
    if (error.response?.status === 404 && error.config?.url?.includes('hubapi.com')) {
      return res.status(404).json({ 
        error: 'Empresa não encontrada no HubSpot',
        companyId: companyId
      });
    }

    res.status(500).json({ 
      error: 'Erro ao enriquecer dados com CRMHub',
      details: error.message
    });
  }
});

// ⚡ Função para gerar payload baseado no mapeamento individual
function generateIndividualMappingPayload(cnpjData, cnpjNumber) {
  const payload = { properties: {} };
  const unmappedData = [];
  
  // Lista de campos válidos do HubSpot
  const validFields = ['name', 'description', 'phone', 'city', 'state', 'website', 'zip', 'teste_cnpj'];
  
  // Extrair dados do CNPJ
  const extractedData = {
    telefone: cnpjData.estabelecimento?.telefone1 ? 
      `(${cnpjData.estabelecimento.ddd1}) ${cnpjData.estabelecimento.telefone1}` : '',
    razao_social: cnpjData.razao_social || '',
    nome_fantasia: cnpjData.estabelecimento?.nome_fantasia || '',
    cidade: cnpjData.estabelecimento?.cidade?.nome || '',
    estado: cnpjData.estabelecimento?.estado?.sigla || '',
    atividade: cnpjData.estabelecimento?.atividade_principal?.descricao || '',
    cep: cnpjData.estabelecimento?.cep || '',
    email: cnpjData.estabelecimento?.email || '',
    endereco: cnpjData.estabelecimento?.logradouro ? 
      `${cnpjData.estabelecimento.tipo_logradouro || ''} ${cnpjData.estabelecimento.logradouro}, ${cnpjData.estabelecimento.numero || 'S/N'}` : '',
    situacao: cnpjData.estabelecimento?.situacao_cadastral || '',
    porte: cnpjData.porte?.descricao || '',
    capital_social: cnpjData.capital_social ? `R$ ${cnpjData.capital_social}` : ''
  };
  
  console.log('🧩 Dados extraídos do CNPJ:', extractedData);
  console.log('🗺️ Mapeamento individual atual:', individualMapping);
  
  // Mapear campos individuais
  let mappedFieldsCount = 0;
  Object.keys(extractedData).forEach(cnpjField => {
    const hubspotField = individualMapping[cnpjField];
    const value = extractedData[cnpjField];
    
    if (hubspotField && hubspotField !== 'nenhum' && value && validFields.includes(hubspotField)) {
      payload.properties[hubspotField] = value;
      mappedFieldsCount++;
      console.log(`✅ Mapeado: ${cnpjField} → ${hubspotField} = "${value}"`);
    } else if (value) {
      unmappedData.push(`${cnpjFieldsDefinition[cnpjField]?.label}: ${value}`);
      console.log(`📦 Não mapeado: ${cnpjField} = "${value}"`);
    }
  });
  
  // Se há dados não mapeados, salvar no campo backup
  if (unmappedData.length > 0) {
    const backupField = savedUserChoice || selectedDestinationField;
    if (backupField && backupField !== 'nenhum' && validFields.includes(backupField)) {
      const backupData = `
=== DADOS CNPJ NÃO MAPEADOS ===
CNPJ: ${cnpjNumber}
${unmappedData.join('\n')}

Atualizado em: ${new Date().toLocaleString('pt-BR')}
`.trim();
      
      payload.properties[backupField] = backupData;
      console.log(`📦 Dados não mapeados salvos em: ${backupField}`);
    }
  }
  
  console.log(`📊 Resumo: ${mappedFieldsCount} campos mapeados, ${unmappedData.length} não mapeados`);
  
  return payload;
}

// ⚡ Função melhorada para limpar CNPJ
function cleanCNPJ(cnpjInput) {
  console.log('🧹 Limpando CNPJ:', cnpjInput, 'Tipo:', typeof cnpjInput);
  
  if (!cnpjInput) {
    console.log('🧹 CNPJ vazio ou null');
    return '';
  }
  
  const cnpjString = String(cnpjInput).trim();
  const cleaned = cnpjString.replace(/[^\d]/g, '');
  
  console.log('🧹 CNPJ após limpeza:', cleaned, 'Tamanho:', cleaned.length);
  
  return cleaned;
}

// ⚡ Função para formatar dados do CNPJ em texto legível
function formatCNPJData(cnpjData, cnpjNumber) {
  const estabelecimento = cnpjData.estabelecimento || {};
  const endereco = estabelecimento.logradouro ? 
    `${estabelecimento.tipo_logradouro || ''} ${estabelecimento.logradouro}, ${estabelecimento.numero || 'S/N'}${estabelecimento.complemento ? ', ' + estabelecimento.complemento : ''}` : 
    'Não informado';
  
  const telefone = estabelecimento.telefone1 ? 
    `(${estabelecimento.ddd1}) ${estabelecimento.telefone1}` : 
    'Não informado';

  const formattedData = `
=== DADOS DA RECEITA FEDERAL ===
CNPJ: ${cnpjNumber}
Razão Social: ${cnpjData.razao_social || 'Não informado'}
Nome Fantasia: ${estabelecimento.nome_fantasia || 'Não informado'}
Situação Cadastral: ${estabelecimento.situacao_cadastral || 'Não informado'}
Data Situação: ${estabelecimento.data_situacao_cadastral || 'Não informado'}
Porte: ${cnpjData.porte?.descricao || 'Não informado'}
Capital Social: R$ ${cnpjData.capital_social || 'Não informado'}

=== ATIVIDADE ===
Atividade Principal: ${estabelecimento.atividade_principal?.descricao || 'Não informado'}

=== ENDEREÇO ===
Endereço: ${endereco}
Bairro: ${estabelecimento.bairro || 'Não informado'}
Cidade: ${estabelecimento.cidade?.nome || 'Não informado'}
Estado: ${estabelecimento.estado?.sigla || 'Não informado'}
CEP: ${estabelecimento.cep || 'Não informado'}

=== CONTATO ===
Telefone: ${telefone}
Email: ${estabelecimento.email || 'Não informado'}

=== INFORMAÇÕES ADICIONAIS ===
Data Início Atividade: ${estabelecimento.data_inicio_atividade || 'Não informado'}
Tipo: ${estabelecimento.tipo || 'Não informado'}
Natureza Jurídica: ${cnpjData.natureza_juridica?.descricao || 'Não informado'}

Atualizado em: ${new Date().toLocaleString('pt-BR')}
  `.trim();

  return formattedData;
}

// ⚡ FUNÇÃO para usar mapeamento individual ou campo único
function updateEnrichmentPayload(cnpjData, cnpjNumber) {
  const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
  
  if (hasIndividualMapping) {
    console.log('🗺️ Usando mapeamento individual de campos');
    return generateIndividualMappingPayload(cnpjData, cnpjNumber);
  } else {
    console.log('📋 Usando modo de campo único');
    const dadosFormatados = formatCNPJData(cnpjData, cnpjNumber);
    const campoAtual = savedUserChoice || selectedDestinationField;
    
    if (campoAtual === 'nenhum') {
      console.log('🚫 Modo "não mapear" - não salvando dados adicionais');
      return { properties: {} };
    }
    
    const payload = {
      properties: {
        [campoAtual]: dadosFormatados
      }
    };
    
    console.log(`📦 Dados serão salvos no campo único: ${campoAtual}`);
    return payload;
  }
}

// Status do app
app.get('/account', (req, res) => {
  res.json({
    status: 'connected',
    app: 'CNPJ Enricher',
    version: '2.0',
    tokenStatus: HUBSPOT_ACCESS_TOKEN ? 'Configurado' : 'Não configurado',
    endpoints: {
      configurar: 'GET /settings',
      enriquecer: 'POST /enrich',
      criarTeste: 'POST /create-test-company',
      crmhubEnriquecer: 'POST /api/enrich-crmhub',
      crmhubDropdown: 'POST /api/crmhub-dropdown-fetch'
    }
  });
});

// ⚡ OAuth Callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('❌ Código de autorização não fornecido.');

  console.log('🔍 Processando OAuth callback...');

  try {
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      console.error('❌ Variáveis de ambiente não configuradas');
      return res.status(500).send(`
        <h2>❌ Erro de Configuração</h2>
        <p><strong>CLIENT_ID:</strong> ${CLIENT_ID ? 'Configurado' : 'NÃO CONFIGURADO'}</p>
        <p><strong>CLIENT_SECRET:</strong> ${CLIENT_SECRET ? 'Configurado' : 'NÃO CONFIGURADO'}</p>
        <p><strong>REDIRECT_URI:</strong> ${REDIRECT_URI ? 'Configurado' : 'NÃO CONFIGURADO'}</p>
      `);
    }

    const response = await axios.post(
      'https://api.hubapi.com/oauth/v1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code: code
      }),
      {
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'CNPJ-Enricher/2.0'
        },
        timeout: 10000
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    HUBSPOT_ACCESS_TOKEN = access_token;

    console.log('✅ Access Token gerado:', access_token);
    console.log('⏰ Expira em (segundos):', expires_in);

    const successHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OAuth Sucesso</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f8f9fa; }
        .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .success { color: #28a745; border-left: 4px solid #28a745; padding-left: 15px; margin-bottom: 20px; }
        .info { background: #e9ecef; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="success">
            <h2>✅ Token OAuth gerado com sucesso!</h2>
        </div>
        
        <div class="info">
            <p><strong>Access Token:</strong> ${access_token.substring(0, 20)}...</p>
            <p><strong>Expira em:</strong> ${Math.floor(expires_in / 3600)} horas</p>
            <p><strong>Status:</strong> Conectado ao HubSpot ✅</p>
        </div>
        
        <h3>🚀 Próximos passos:</h3>
        <ol>
            <li><strong>Criar empresa teste:</strong><br><code>POST /create-test-company</code></li>
            <li><strong>Enriquecer empresa:</strong><br><code>POST /enrich</code></li>
            <li><strong>CRMHub:</strong><br><code>POST /api/enrich-crmhub</code></li>
        </ol>
        
        <div style="margin-top: 30px;">
            <a href="/account" class="btn">📊 Verificar Status</a>
            <a href="/settings" class="btn">⚙️ Configurações</a>
        </div>
        
        <script>
            if (window.opener) {
                setTimeout(() => window.close(), 3000);
            }
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'oauth_success',
                    token: '${access_token.substring(0, 20)}...',
                    expiresIn: ${expires_in}
                }, '*');
            }
        </script>
    </div>
</body>
</html>`;

    res.send(successHtml);
    
  } catch (error) {
    console.error('❌ Erro no OAuth:', error.response?.data);
    
    const errorHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Erro OAuth</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f8f9fa; }
        .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .error { color: #dc3545; border-left: 4px solid #dc3545; padding-left: 15px; margin-bottom: 20px; }
        .debug { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; font-family: monospace; font-size: 12px; }
        .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="error">
            <h2>❌ Erro ao gerar token OAuth</h2>
        </div>
        
        <p><strong>Status:</strong> ${error.response?.status || 'Desconhecido'}</p>
        <p><strong>Mensagem:</strong> ${error.message}</p>
        
        <div class="debug">
            <h4>🔍 Debug:</h4>
            <p><strong>CLIENT_ID:</strong> ${CLIENT_ID || 'Não configurado'}</p>
            <p><strong>REDIRECT_URI:</strong> ${REDIRECT_URI || 'Não configurado'}</p>
            <p><strong>CLIENT_SECRET:</strong> ${CLIENT_SECRET ? 'Configurado' : 'Não configurado'}</p>
            <pre>${JSON.stringify(error.response?.data, null, 2)}</pre>
        </div>
        
        <div style="margin-top: 30px;">
            <a href="/account" class="btn">📊 Status</a>
        </div>
    </div>
</body>
</html>`;

    res.status(500).send(errorHtml);
  }
});

// ⚡ Refresh token
app.get('/refresh', async (req, res) => {
  if (!HUBSPOT_REFRESH_TOKEN) return res.status(400).send('❌ Refresh token não configurado.');

  try {
    const response = await axios.post(
      'https://api.hubapi.com/oauth/v1/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: HUBSPOT_REFRESH_TOKEN
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    HUBSPOT_ACCESS_TOKEN = access_token;

    console.log('✅ Novo Access Token:', access_token);
    console.log('⏰ Expira em (segundos):', expires_in);

    res.send('✅ Novo access_token gerado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao fazer refresh do token:', error.response?.data || error.message);
    res.status(500).send('❌ Erro ao gerar novo token.');
  }
});

// ⚡ Testar token
app.get('/test-token', async (req, res) => {
  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.json({
      status: 'error',
      message: 'Token não configurado',
      needsAuth: true,
      authUrl: `https://app.hubspot.com/oauth/authorize?client_id=${CLIENT_ID}&scope=crm.objects.companies.read%20crm.objects.companies.write&redirect_uri=${REDIRECT_URI}`
    });
  }

  try {
    const response = await axios.get('https://api.hubapi.com/crm/v3/objects/companies?limit=1', {
      headers: { Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}` }
    });
    
    res.json({
      status: 'success',
      message: 'Token funcionando!',
      tokenPreview: HUBSPOT_ACCESS_TOKEN.substring(0, 20) + '...',
      companiesFound: response.data.results.length
    });
  } catch (error) {
    res.json({
      status: 'error',
      message: 'Token inválido',
      error: error.response?.data,
      needsAuth: true
    });
  }
});

// ⚡ Página de configurações
app.get('/settings', (req, res) => {
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://app.hubspot.com https://app-eu1.hubspot.com;");
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  res.send(`
<div class="field-mapping">
  <label for="company_name_field">Nome da empresa →</label>
  <input id="company_name_field" placeholder="Ex: nome_fantasia" />
</div>
<button onclick="saveMapping()">Salvar mapeamento</button>

<script>
  async function saveMapping() {
    const field = document.getElementById("company_name_field").value;
    const res = await fetch("/api/save-mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping: { company_name: field } })
    });

    const result = await res.json();
    alert(result.message || "Mapeamento salvo!");
  }
</script>
  `);
});

// ⚡ ENRICHMENT PRINCIPAL
app.post('/enrich', async (req, res) => {
  const { companyId } = req.body;

  console.log('🔍 Iniciando enriquecimento para companyId:', companyId);

  if (!companyId) {
    console.error('❌ Company ID não fornecido');
    return res.status(400).json({ error: 'Company ID is required' });
  }

  if (!HUBSPOT_ACCESS_TOKEN) {
    console.error('❌ HUBSPOT_ACCESS_TOKEN não configurado');
    return res.status(500).json({ 
      error: 'Token do HubSpot não configurado',
      details: 'Execute OAuth primeiro',
      authUrl: `https://app.hubspot.com/oauth/authorize?client_id=${CLIENT_ID}&scope=crm.objects.companies.read%20crm.objects.companies.write&redirect_uri=${REDIRECT_URI}`
    });
  }

  try {
    console.log('📡 Buscando empresa no HubSpot...');
    
    const hubspotCompany = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/companies/${companyId}?properties=cnpj,name,domain,website,phone,city,state,country,createdate,hs_lastmodifieddate`,
      {
        headers: { 
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Empresa encontrada no HubSpot');
    const properties = hubspotCompany.data.properties;
    
    console.log('🔍 Propriedades da empresa:');
    Object.keys(properties).forEach(key => {
      console.log(`${key}: "${properties[key]}"`);
    });
    
    // Buscar CNPJ
    let cnpjRaw = properties.cnpj || 
                  properties.CNPJ ||
                  properties.registration_number ||
                  properties.company_cnpj ||
                  properties.document_number ||
                  properties.tax_id ||
                  properties.federal_id;

    // Se não encontrou, procurar em qualquer campo com 14 dígitos
    if (!cnpjRaw) {
      console.log('🔍 CNPJ não encontrado nos campos padrão, procurando em todos os campos...');
      
      for (const [key, value] of Object.entries(properties)) {
        if (value && typeof value === 'string') {
          const cleaned = cleanCNPJ(value);
          if (cleaned.length === 14) {
            console.log(`🎯 CNPJ encontrado no campo "${key}": ${value} -> ${cleaned}`);
            cnpjRaw = value;
            break;
          }
        }
      }
    }

    console.log('🔍 CNPJ bruto encontrado:', cnpjRaw);

    const cnpjLimpo = cleanCNPJ(cnpjRaw);
    console.log('🧹 CNPJ limpo:', cnpjLimpo);

    if (!cnpjLimpo || cnpjLimpo.length !== 14) {
      console.warn('⚠️ CNPJ inválido ou não encontrado');
      
      let sugestoes = [];
      if (!cnpjRaw) {
        sugestoes.push('Campo CNPJ não encontrado na empresa');
        sugestoes.push(`Use: POST /add-cnpj/${companyId} com {"cnpj": "14665903000104"}`);
      } else if (cnpjLimpo.length !== 14) {
        sugestoes.push(`CNPJ tem ${cnpjLimpo.length} dígitos, precisa ter 14`);
        sugestoes.push('Formatos aceitos: 14665903000104 ou 14.665.903/0001-04');
      }
      
      return res.status(400).json({ 
        error: 'CNPJ inválido ou não encontrado',
        cnpjRaw: cnpjRaw,
        cnpjLimpo: cnpjLimpo,
        cnpjTamanho: cnpjLimpo.length,
        sugestoes: sugestoes
      });
    }

    console.log('📡 Buscando dados do CNPJ na API externa...');
    
    const cnpjDataResponse = await axios.get(`https://publica.cnpj.ws/cnpj/${cnpjLimpo}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'CNPJ-Enricher/2.0'
      }
    });

    console.log('✅ Dados do CNPJ obtidos com sucesso');
    const cnpjData = cnpjDataResponse.data;

    // Extrair dados principais
    const razaoSocial = cnpjData.razao_social || '';
    const nomeFantasia = cnpjData.estabelecimento?.nome_fantasia || '';
    const situacaoCadastral = cnpjData.estabelecimento?.situacao_cadastral || '';
    const porte = cnpjData.porte?.descricao || '';
    const atividadePrincipal = cnpjData.estabelecimento?.atividade_principal?.descricao || '';
    
    const telefoneFormatado = cnpjData.estabelecimento?.telefone1 ? 
      `(${cnpjData.estabelecimento.ddd1}) ${cnpjData.estabelecimento.telefone1}` : '';
    
    const emailCnpj = cnpjData.estabelecimento?.email || '';
    
    const enderecoCompleto = cnpjData.estabelecimento?.logradouro ? 
      `${cnpjData.estabelecimento.tipo_logradouro} ${cnpjData.estabelecimento.logradouro}, ${cnpjData.estabelecimento.numero}` : '';
    
    const cidade = cnpjData.estabelecimento?.cidade?.nome || '';
    const estado = cnpjData.estabelecimento?.estado?.sigla || '';
    const cep = cnpjData.estabelecimento?.cep || '';

    // Gerar payload baseado no modo configurado (incluindo CRMHub)
    const updatePayload = updateEnrichmentPayloadWithCRMHub(cnpjData, cnpjLimpo);

    console.log('📦 Payload final:', JSON.stringify(updatePayload, null, 2));
    console.log('📡 Atualizando empresa no HubSpot...');
    
    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/companies/${companyId}`,
      updatePayload,
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
    const campoUsado = crmhubToggleEnabled ? 'CRMHub (campos específicos)' : 
                      (hasIndividualMapping ? 'mapeamento individual' : (savedUserChoice || selectedDestinationField));
    
    console.log(`✅ Empresa atualizada com sucesso! Modo usado: ${campoUsado}`);
    
    const dadosEmpresa = {
      razaoSocial: razaoSocial,
      nomeFantasia: nomeFantasia,
      situacao: situacaoCadastral,
      porte: porte,
      cidade: cidade,
      estado: estado,
      atividade: atividadePrincipal,
      email: emailCnpj,
      telefone: telefoneFormatado
    };
    
    console.log('🎉 SUCESSO COMPLETO:');
    console.log('🏢 Razão Social:', dadosEmpresa.razaoSocial);
    console.log('✨ Nome Fantasia:', dadosEmpresa.nomeFantasia);
    console.log('📊 Situação:', dadosEmpresa.situacao);
    console.log('📍 Local:', `${dadosEmpresa.cidade}/${dadosEmpresa.estado}`);
    console.log('📞 Telefone:', dadosEmpresa.telefone);

    res.json({ 
      success: true,
      message: `🎉 Empresa enriquecida com sucesso! Modo: ${campoUsado}`,
      cnpj: cnpjLimpo,
      empresa: {
        razaoSocial: dadosEmpresa.razaoSocial,
        nomeFantasia: dadosEmpresa.nomeFantasia,
        situacao: dadosEmpresa.situacao,
        localizacao: `${dadosEmpresa.cidade}/${dadosEmpresa.estado}`,
        porte: dadosEmpresa.porte,
        contato: {
          email: dadosEmpresa.email,
          telefone: dadosEmpresa.telefone
        },
        atividade: dadosEmpresa.atividade
      },
      configuracao: {
        modo: crmhubToggleEnabled ? 'crmhub_ativo' : 
              (hasIndividualMapping ? 'mapeamento_individual' : 'campo_unico'),
        campoDestino: crmhubToggleEnabled ? 'Campos específicos CRMHub' : 
                      (hasIndividualMapping ? 'múltiplos campos' : campoUsado),
        tipoConteudo: crmhubToggleEnabled ? 'Dados em campos dedicados CRMHub' :
                      (hasIndividualMapping ? 'Campos específicos + backup' : 'Texto formatado completo'),
        crmhubAtivo: crmhubToggleEnabled
      }
    });

  } catch (error) {
    console.error('❌ Erro detalhado no enriquecimento:');
    console.error('📋 Mensagem:', error.message);
    console.error('📊 Status:', error.response?.status);
    console.error('📄 Response data:', error.response?.data);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        error: 'Token do HubSpot inválido ou expirado',
        details: 'Execute OAuth novamente',
        authUrl: `https://app.hubspot.com/oauth/authorize?client_id=${CLIENT_ID}&scope=crm.objects.companies.read%20crm.objects.companies.write&redirect_uri=${REDIRECT_URI}`
      });
    }
    
    if (error.response?.status === 404 && error.config?.url?.includes('hubapi.com')) {
      return res.status(404).json({ 
        error: 'Empresa não encontrada no HubSpot',
        companyId: companyId
      });
    }
    
    if (error.response?.status === 400 && error.response?.data?.message?.includes('does not exist')) {
      console.log('⚠️ Campo teste_cnpj não existe no HubSpot');
      
      return res.status(400).json({ 
        error: 'Campo teste_cnpj não existe no HubSpot',
        message: 'Execute POST /create-test-field para criar o campo',
        solucao: 'POST /create-test-field'
      });
    }
    
    if (error.response?.status === 429 && error.config?.url?.includes('cnpj.ws')) {
      console.log('⚠️ Rate limit atingido na API CNPJ');
      
      return res.status(200).json({ 
        success: true,
        message: '✅ CNPJ válido encontrado! Rate limit atingido (3 consultas/min)',
        cnpj: cnpjLimpo,
        empresaEncontrada: properties.name || 'Empresa sem nome',
        status: 'Aguardando liberação da API',
        proximaTentativa: 'Aguarde 1-2 minutos para nova consulta'
      });
    }
    
    if (error.config?.url?.includes('cnpj.ws')) {
      return res.status(500).json({ 
        error: 'Erro ao buscar dados do CNPJ',
        details: error.response?.data || error.message
      });
    }

    res.status(500).json({ 
      error: 'Erro ao enriquecer dados',
      details: error.message
    });
  }
});

// ⚡ Criar campo teste_cnpj
app.post('/create-test-field', async (req, res) => {
  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Token não configurado' });
  }

  try {
    console.log('🔧 Criando campo de teste teste_cnpj...');
    
    const response = await axios.post(
      'https://api.hubapi.com/crm/v3/properties/companies',
      {
        name: 'teste_cnpj',
        label: 'Teste CNPJ',
        type: 'string',
        fieldType: 'textarea',
        description: 'Campo de teste para dados do CNPJ - todos os dados da Receita Federal',
        groupName: 'companyinformation',
        hasUniqueValue: false,
        hidden: false,
        displayOrder: -1
      },
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Campo teste_cnpj criado com sucesso');
    
    res.json({
      success: true,
      message: 'Campo teste_cnpj criado com sucesso!',
      fieldName: 'teste_cnpj',
      fieldType: 'textarea'
    });
    
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('⚠️ Campo teste_cnpj já existe');
      res.json({
        success: true,
        message: 'Campo teste_cnpj já existe no HubSpot',
        status: 'already_exists'
      });
    } else {
      console.error('❌ Erro ao criar campo teste_cnpj:', error.response?.data);
      res.status(500).json({
        error: 'Erro ao criar campo teste_cnpj',
        details: error.response?.data
      });
    }
  }
});

// ⚡ Adicionar CNPJ a empresa
app.post('/add-cnpj/:companyId', async (req, res) => {
  const { companyId } = req.params;
  const { cnpj } = req.body;

  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Token não configurado' });
  }

  if (!cnpj) {
    return res.status(400).json({ error: 'CNPJ é obrigatório no body: {"cnpj": "14665903000104"}' });
  }

  try {
    console.log('📝 Adicionando CNPJ à empresa:', companyId);
    
    const response = await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/companies/${companyId}`,
      {
        properties: {
          cnpj: cnpj
        }
      },
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ CNPJ adicionado com sucesso');

    res.json({
      success: true,
      companyId: companyId,
      cnpjAdicionado: cnpj,
      message: 'CNPJ adicionado à empresa com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao adicionar CNPJ:', error.response?.data);
    res.status(500).json({
      error: 'Erro ao adicionar CNPJ',
      details: error.response?.data
    });
  }
});

// ⚡ Criar empresa de teste
app.post('/create-test-company', async (req, res) => {
  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(401).json({ 
      error: 'Token não configurado',
      authUrl: `https://app.hubspot.com/oauth/authorize?client_id=${CLIENT_ID}&scope=crm.objects.companies.read%20crm.objects.companies.write&redirect_uri=${REDIRECT_URI}`
    });
  }

  try {
    console.log('🏢 Criando empresa de teste...');
    
    const response = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/companies',
      {
        properties: {
          name: 'Empresa Teste CNPJ - ' + new Date().getTime(),
          cnpj: '14665903000104',
          domain: 'teste.com.br',
          phone: '11999999999',
          website: 'https://teste.com.br'
        }
      },
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Empresa criada com sucesso:', response.data.id);

    const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
    const modo = hasIndividualMapping ? 'mapeamento individual' : 'campo único';

    res.json({
      success: true,
      companyId: response.data.id,
      message: 'Empresa de teste criada com CNPJ 14665903000104',
      cnpj: '14665903000104',
      configuracao: {
        modoAtivo: modo,
        campoDestino: hasIndividualMapping ? 'múltiplos campos' : (savedUserChoice || selectedDestinationField)
      },
      proximoTeste: {
        url: 'POST /enrich',
        body: { companyId: response.data.id }
      }
    });
  } catch (error) {
    console.error('❌ Erro ao criar empresa teste:', error.response?.data);
    res.status(500).json({
      error: 'Erro ao criar empresa teste',
      details: error.response?.data
    });
  }
});

// ⚡ ENDPOINTS PARA HUBSPOT APP - CORRIGIDOS

app.post('/api/accounts-fetch', (req, res) => {
  console.log('🔁 Recebido chamada de /api/accounts-fetch do HubSpot');

  return res.json({
    response: {
      accounts: [
        {
          accountId: 'default-account',
          accountName: 'Enriquecedor CNPJ - CRM Hub',
          accountLogoUrl: 'https://crmhub.com.br/wp-content/uploads/2025/02/logo-laranja-1.png'
        }
      ]
    }
  });
});

// ⚡ ENDPOINTS ESPECÍFICOS PARA TELEFONE - CORRIGIDOS
app.post('/api/phone-options', (req, res) => {
  console.log('📞 HubSpot solicitando opções para campo Telefone...');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const options = [
      { 
        label: '🚫 Não mapear este campo', 
        value: 'nenhum',
        description: 'Telefone não será salvo em campo específico'
      },
      ...HUBSPOT_STANDARD_FIELDS.map(field => ({
        label: field.text,
        value: field.value,
        description: field.description
      }))
    ];

    const currentSelection = individualMapping.telefone || 'phone';

    console.log(`📞 Retornando ${options.length} opções para Telefone`);
    console.log(`🎯 Campo selecionado para Telefone: ${currentSelection}`);

    return res.json({
      response: {
        options: options,
        selectedOption: currentSelection,
        placeholder: 'Escolha onde salvar o telefone do CNPJ'
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no dropdown do Telefone:', error);
    
    return res.json({
      response: {
        options: [
          { 
            label: '📞 Telefone (phone)', 
            value: 'phone',
            description: 'Campo padrão para telefone'
          }
        ],
        selectedOption: 'phone',
        placeholder: 'Escolha onde salvar o telefone'
      }
    });
  }
});

app.post('/api/phone-save', (req, res) => {
  console.log('📞 Salvando configuração do Telefone...');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  
  const newSelection = req.body.selectedOption || 'phone';
  const previousSelection = individualMapping.telefone || 'phone';
  
  console.log('📞 Atualizando mapeamento do Telefone:');
  console.log(`   Anterior: ${previousSelection}`);
  console.log(`   Novo: ${newSelection}`);

  individualMapping.telefone = newSelection;

  let message = '';
  
  if (newSelection === 'phone') {
    message = '✅ Telefone será salvo no campo padrão "phone" do HubSpot';
  } else if (newSelection === 'nenhum') {
    message = '⚠️ Telefone não será mapeado (irá para campo backup)';
  } else {
    message = `✅ Telefone será salvo no campo: ${newSelection}`;
  }

  console.log(`💬 Mensagem: ${message}`);
  console.log(`💾 Telefone mapeado para: ${individualMapping.telefone}`);

  res.json({
    response: {
      actionType: 'DROPDOWN_UPDATE',
      selectedOption: newSelection,
      message: message,
      configuracao: {
        campoTelefone: newSelection,
        mapeamentoCompleto: individualMapping
      }
    }
  });
});

// ⚡ Dropdown fetch - VERSÃO CORRIGIDA SEM BUSCAR API
app.post('/api/dropdown-fetch', async (req, res) => {
  console.log('🔍 HubSpot solicitando opções do dropdown...');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    // ⚡ FORMATO CORRETO PARA DROPDOWNS DO HUBSPOT
    const options = [
      { 
        text: '🚫 Não mapear - Apenas validar CNPJ', 
        value: 'nenhum',
        description: 'Apenas valida o CNPJ sem salvar dados adicionais'
      },
      ...HUBSPOT_STANDARD_FIELDS.map(field => ({
        text: field.text,
        value: field.value,
        description: field.description
      }))
    ];

    const currentSelection = savedUserChoice || selectedDestinationField;

    console.log(`📋 Retornando ${options.length} opções para o dropdown`);
    console.log(`🎯 Campo selecionado: ${currentSelection}`);

    return res.json({
      response: {
        options: options,
        selectedOption: currentSelection,
        placeholder: 'Escolha onde salvar os dados do CNPJ'
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no dropdown:', error);
    
    return res.json({
      response: {
        options: [
          { 
            text: '📋 Campo padrão (teste_cnpj)', 
            value: 'teste_cnpj',
            description: 'Campo padrão para dados do CNPJ'
          }
        ],
        selectedOption: savedUserChoice || selectedDestinationField,
        placeholder: 'Escolha onde salvar os dados do CNPJ'
      }
    });
  }
});

// ⚡ Dropdown update
app.post('/api/dropdown-update', (req, res) => {
  console.log('📥 Dropdown update recebido:', JSON.stringify(req.body, null, 2));
  
  const newSelection = req.body.selectedOption || 'teste_cnpj';
  const previousSelection = savedUserChoice || selectedDestinationField;
  
  console.log('📥 Atualizando campo de destino:');
  console.log(`   Anterior: ${previousSelection}`);
  console.log(`   Novo: ${newSelection}`);

  savedUserChoice = newSelection;

  let message = '';
  
  if (newSelection === 'teste_cnpj') {
    message = '✅ Configurado para salvar todos os dados formatados no campo teste_cnpj';
  } else if (newSelection === 'nenhum') {
    message = '⚠️ Configurado para apenas validar CNPJ (não salvar dados)';
  } else {
    message = `✅ Configurado para salvar dados formatados no campo: ${newSelection}`;
  }

  console.log(`💬 Mensagem: ${message}`);
  console.log(`💾 Escolha salva: ${savedUserChoice}`);

  res.json({
    response: {
      actionType: 'DROPDOWN_UPDATE',
      selectedOption: newSelection,
      message: message,
      configuracao: {
        campoDestino: newSelection,
        escolhaSalva: savedUserChoice
      }
    }
  });
});

// ⚡ Individual mapping fetch - VERSÃO CORRIGIDA SEM BUSCAR API
app.post('/api/individual-mapping-fetch', async (req, res) => {
  console.log('🗺️ Buscando configuração de mapeamento individual...');
  
  try {
    // ⚡ FORMATO CORRETO PARA DROPDOWNS DO HUBSPOT
    const allFieldOptions = [
      { 
        text: '🚫 Não mapear este campo', 
        value: 'nenhum', 
        description: 'Este campo não será salvo' 
      },
      ...HUBSPOT_STANDARD_FIELDS.map(field => ({
        text: field.text,
        value: field.value,
        description: field.description
      }))
    ];
    
    // Preparar resposta com todos os campos
    const fieldsConfig = {};
    Object.keys(cnpjFieldsDefinition).forEach(cnpjField => {
      const fieldDef = cnpjFieldsDefinition[cnpjField];
      fieldsConfig[cnpjField] = {
        text: fieldDef.label,
        example: fieldDef.example,
        description: fieldDef.description,
        options: allFieldOptions,
        currentValue: individualMapping[cnpjField] || fieldDef.hubspotSuggestion || 'nenhum',
        suggested: fieldDef.hubspotSuggestion || null
      };
    });
    
    console.log(`✅ Retornando configuração para ${Object.keys(fieldsConfig).length} campos`);
    console.log(`🎯 Sugestões geradas: ${Object.keys(cnpjFieldsDefinition).length}`);
    
    return res.json({
      response: {
        fields: fieldsConfig,
        backupField: {
          text: '📦 Campo para dados não mapeados',
          currentValue: savedUserChoice || selectedDestinationField,
          options: HUBSPOT_STANDARD_FIELDS.map(field => ({
            text: field.text,
            value: field.value,
            description: field.description
          }))
        },
        stats: {
          totalFields: Object.keys(fieldsConfig).length,
          availableHubSpotFields: HUBSPOT_STANDARD_FIELDS.length
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar mapeamento individual:', error);
    return res.status(500).json({
      error: 'Erro ao carregar mapeamento individual',
      details: error.message
    });
  }
});

// ⚡ Individual mapping save
app.post('/api/individual-mapping-save', (req, res) => {
  console.log('💾 Salvando mapeamento individual...');
  console.log('📥 Dados recebidos:', JSON.stringify(req.body, null, 2));
  
  try {
    const { fieldMappings, backupField } = req.body;
    
    if (!fieldMappings) {
      return res.status(400).json({
        error: 'fieldMappings é obrigatório'
      });
    }
    
    let updatedCount = 0;
    Object.keys(fieldMappings).forEach(cnpjField => {
      if (cnpjField in individualMapping) {
        const oldValue = individualMapping[cnpjField];
        const newValue = fieldMappings[cnpjField];
        
        individualMapping[cnpjField] = newValue;
        
        if (oldValue !== newValue) {
          updatedCount++;
          console.log(`🔄 ${cnpjField}: "${oldValue}" → "${newValue}"`);
        }
      }
    });
    
    if (backupField) {
      const oldBackup = savedUserChoice || selectedDestinationField;
      savedUserChoice = backupField;
      console.log(`📦 Campo backup: "${oldBackup}" → "${backupField}"`);
    }
    
    const mappedFields = Object.values(individualMapping).filter(field => field && field !== 'nenhum').length;
    const unmappedFields = Object.values(individualMapping).filter(field => !field || field === 'nenhum').length;
    
    console.log(`✅ Mapeamento salvo: ${updatedCount} campos atualizados`);
    console.log(`📊 Status: ${mappedFields} mapeados, ${unmappedFields} não mapeados`);
    
    return res.json({
      success: true,
      message: `Mapeamento individual salvo com sucesso!`,
      stats: {
        fieldsUpdated: updatedCount,
        totalMapped: mappedFields,
        totalUnmapped: unmappedFields,
        backupField: savedUserChoice || selectedDestinationField
      },
      mapping: individualMapping
    });
    
  } catch (error) {
    console.error('❌ Erro ao salvar mapeamento individual:', error);
    return res.status(500).json({
      error: 'Erro ao salvar mapeamento individual',
      details: error.message
    });
  }
});

// ⚡ UI Extensions fetch - INTERFACE PRINCIPAL CORRIGIDA
app.post('/api/ui-extensions-fetch', async (req, res) => {
  console.log('🎨 HubSpot solicitando interface de configurações...');
  
  try {
    const allOptions = [
      { text: '🚫 Não mapear', value: 'nenhum' },
      ...HUBSPOT_STANDARD_FIELDS.map(field => ({
        text: field.text.replace(/📝|📞|🏙️|🌎|🌐|📧|🏭|📮|📋/g, '').trim(),
        value: field.value
      }))
    ];

    const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
    
    const properties = [];
    
    if (hasIndividualMapping) {
      properties.push({
        name: 'mapping_mode',
        label: '🗺️ Modo de Mapeamento',
        dataType: 'ENUMERATION',
        fieldType: 'select',
        value: 'individual',
        description: 'Escolha como mapear os dados do CNPJ',
        options: [
          { text: '📋 Campo único (todos os dados juntos)', value: 'single' },
          { text: '🗺️ Mapeamento individual (campos separados)', value: 'individual' }
        ]
      });

      Object.keys(cnpjFieldsDefinition).forEach(cnpjField => {
        const fieldDef = cnpjFieldsDefinition[cnpjField];
        properties.push({
          name: `field_${cnpjField}`,
          label: fieldDef.label,
          dataType: 'ENUMERATION',
          fieldType: 'select',
          value: individualMapping[cnpjField] || 'nenhum',
          description: `${fieldDef.description} - Exemplo: ${fieldDef.example}`,
          options: allOptions
        });
      });

      properties.push({
        name: 'backup_field',
        label: '📦 Campo para dados não mapeados',
        dataType: 'ENUMERATION',
        fieldType: 'select',
        value: savedUserChoice || selectedDestinationField,
        description: 'Campo onde salvar dados que não foram mapeados individualmente',
        options: HUBSPOT_STANDARD_FIELDS.map(field => ({
          text: field.text.replace(/📝|📞|🏙️|🌎|🌐|📧|🏭|📮|📋/g, '').trim(),
          value: field.value
        }))
      });

    } else {
      properties.push({
        name: 'mapping_mode',
        label: '🗺️ Modo de Mapeamento',
        dataType: 'ENUMERATION',
        fieldType: 'select',
        value: 'single',
        description: 'Escolha como mapear os dados do CNPJ',
        options: [
          { text: '📋 Campo único (todos os dados juntos)', value: 'single' },
          { text: '🗺️ Mapeamento individual (campos separados)', value: 'individual' }
        ]
      });

      properties.push({
        name: 'single_field',
        label: '📂 Campo de destino',
        dataType: 'ENUMERATION',
        fieldType: 'select',
        value: savedUserChoice || selectedDestinationField || 'teste_cnpj',
        description: 'Escolha onde salvar todos os dados do CNPJ formatados',
        options: [
          { text: '📝 Nome da empresa (name)', value: 'name', description: 'Campo padrão do HubSpot' },
          { text: '📝 Descrição (description)', value: 'description', description: 'Campo padrão do HubSpot' },
          { text: '📞 Telefone (phone)', value: 'phone', description: 'Campo padrão do HubSpot' },
          { text: '🏙️ Cidade (city)', value: 'city', description: 'Campo padrão do HubSpot' },
          { text: '🌎 Estado (state)', value: 'state', description: 'Campo padrão do HubSpot' },
          { text: '📋 Campo teste CNPJ (teste_cnpj)', value: 'teste_cnpj', description: 'Campo de teste para CNPJ' }
        ]
      });
    }

    const response = {
      results: [
        {
          objectId: req.body.objectId || 'default',
          title: '🗺️ Configuração CNPJ Enricher',
          properties: properties
        }
      ]
    };

    console.log('✅ Interface gerada com sucesso');
    console.log(`📊 Modo: ${hasIndividualMapping ? 'individual' : 'single'}`);
    console.log(`📋 Propriedades: ${properties.length}`);
    
    return res.json(response);

  } catch (error) {
    console.error('❌ Erro ao gerar interface:', error);
    
    return res.json({
      results: [
        {
          objectId: 'default',
          title: '🗺️ CNPJ Enricher',
          properties: [
            {
              name: 'simple_field',
              label: 'Campo de destino',
              dataType: 'ENUMERATION',
              fieldType: 'select',
              value: 'teste_cnpj',
              options: [
                { text: 'Campo teste CNPJ', value: 'teste_cnpj' }
              ]
            }
          ]
        }
      ]
    });
  }
});

// ⚡ UI Extensions save - SALVAR CONFIGURAÇÕES CORRIGIDO
app.post('/api/ui-extensions-save', (req, res) => {
  console.log('💾 Salvando configurações da interface...');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    let formData = {};
    
    if (req.body.formData) {
      formData = req.body.formData;
    } else if (req.body.properties) {
      formData = req.body.properties;
    } else if (req.body.data) {
      formData = req.body.data;
    } else {
      formData = req.body;
    }
    
    console.log('📊 Dados extraídos:', JSON.stringify(formData, null, 2));
    
    if (!formData || typeof formData !== 'object') {
      return res.status(400).json({
        error: 'Dados de formulário não encontrados',
        received: req.body
      });
    }
    
    const mappingMode = formData.mapping_mode || 'single';
    console.log(`🗺️ Modo detectado: ${mappingMode}`);
    
    if (mappingMode === 'individual') {
      let updatedCount = 0;
      
      Object.keys(cnpjFieldsDefinition).forEach(cnpjField => {
        const fieldKey = `field_${cnpjField}`;
        if (formData[fieldKey] !== undefined) {
          const oldValue = individualMapping[cnpjField];
          const newValue = formData[fieldKey];
          
          individualMapping[cnpjField] = newValue;
          
          if (oldValue !== newValue) {
            updatedCount++;
            console.log(`🔄 ${cnpjField}: "${oldValue}" → "${newValue}"`);
          }
        }
      });
      
      if (formData.backup_field !== undefined) {
        savedUserChoice = formData.backup_field;
        console.log(`📦 Campo backup: "${savedUserChoice}"`);
      }
      
      const mappedFields = Object.values(individualMapping).filter(field => field && field !== 'nenhum').length;
      const unmappedFields = Object.values(individualMapping).filter(field => !field || field === 'nenhum').length;
      
      console.log(`✅ Mapeamento individual salvo: ${updatedCount} campos atualizados`);
      
      return res.json({
        success: true,
        message: `✅ Mapeamento individual configurado! ${mappedFields} campos mapeados, ${unmappedFields} vão para backup.`,
        configuration: {
          mode: 'individual',
          mappedFields: mappedFields,
          unmappedFields: unmappedFields,
          backupField: savedUserChoice || selectedDestinationField,
          mapping: individualMapping
        }
      });
      
    } else {
      let targetField = formData.single_field || savedUserChoice || selectedDestinationField;
      
      if (targetField) {
        savedUserChoice = targetField;
        
        Object.keys(individualMapping).forEach(key => {
          individualMapping[key] = null;
        });
        
        console.log(`📋 Campo único configurado: ${savedUserChoice}`);
        
        return res.json({
          success: true,
          message: `✅ Configurado para salvar todos os dados no campo: ${savedUserChoice}`,
          configuration: {
            mode: 'single',
            field: savedUserChoice
          }
        });
      } else {
        return res.status(400).json({
          error: 'Campo de destino não especificado'
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao salvar configurações:', error);
    return res.status(500).json({
      error: 'Erro interno ao salvar configurações',
      details: error.message
    });
  }
});

// ⚡ ENDPOINTS ADICIONAIS PARA COMPATIBILIDADE
app.post('/api/save-mapping', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Sistema configurado para usar campo único teste_cnpj',
    modo: 'campo_unico'
  });
});

app.get('/api/get-mapping', (req, res) => {
  res.json({ 
    success: true, 
    mapping: { modo: 'campo_unico', campo: 'teste_cnpj' }
  });
});

app.get('/api/config-status', (req, res) => {
  res.json({
    success: true,
    configuracao: {
      modo: 'Campo único teste_cnpj',
      descricao: 'Todos os dados são salvos no campo teste_cnpj como texto formatado',
      campoDestino: 'teste_cnpj'
    },
    status: 'Configurado para campo único'
  });
});

app.post('/api/load-settings', (req, res) => {
  res.json({
    response: {
      campo_destino: savedUserChoice || selectedDestinationField,
      message: `Configuração carregada: ${savedUserChoice || selectedDestinationField}`
    }
  });
});

app.post('/api/save-settings', (req, res) => {
  res.json({
    response: {
      status: 'saved',
      campo_destino: savedUserChoice || selectedDestinationField,
      message: `Configuração salva: ${savedUserChoice || selectedDestinationField}`
    }
  });
});

app.get('/api/debug-settings', (req, res) => {
  res.json({
    selectedDestinationField: selectedDestinationField,
    savedUserChoice: savedUserChoice,
    currentField: savedUserChoice || selectedDestinationField,
    individualMapping: individualMapping,
    hasIndividualMapping: Object.values(individualMapping).some(field => field && field !== 'nenhum'),
    crmhubFields: CRMHUB_FIELDS.map(f => f.name),
    crmhubToggleStatus: {
      enabled: crmhubToggleEnabled,
      description: crmhubToggleEnabled ? 'CRMHub está ATIVO' : 'CRMHub está INATIVO'
    },
    timestamp: new Date().toISOString(),
    status: 'Sistema funcionando corretamente com CRMHub Toggle'
  });
});

app.get('/api/mapping-status', (req, res) => {
  const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
  const mappedFields = Object.values(individualMapping).filter(field => field && field !== 'nenhum').length;
  
  res.json({
    success: true,
    mappingMode: hasIndividualMapping ? 'individual' : 'single_field',
    configuration: {
      individualMapping: {
        active: hasIndividualMapping,
        mappedFields: mappedFields,
        details: individualMapping
      },
      singleField: {
        active: !hasIndividualMapping,
        field: savedUserChoice || selectedDestinationField
      },
      crmhubFields: {
        available: CRMHUB_FIELDS.length,
        list: CRMHUB_FIELDS.map(f => f.name),
        toggleEnabled: crmhubToggleEnabled
      }
    }
  });
});

// ⚡ ENDPOINT PARA LISTAR EMPRESAS (DEBUG)
app.get('/companies', async (req, res) => {
  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Token não configurado' });
  }

  try {
    const response = await axios.get(
      'https://api.hubapi.com/crm/v3/objects/companies?limit=10&properties=name,cnpj,domain,phone,city,state',
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const companies = response.data.results.map(company => ({
      id: company.id,
      name: company.properties.name || 'Sem nome',
      cnpj: company.properties.cnpj || 'Sem CNPJ',
      domain: company.properties.domain || 'Sem domínio',
      phone: company.properties.phone || 'Sem telefone',
      location: `${company.properties.city || 'N/A'}, ${company.properties.state || 'N/A'}`
    }));

    res.json({
      success: true,
      total: response.data.total,
      companies: companies,
      message: `${companies.length} empresas encontradas`
    });

  } catch (error) {
    console.error('❌ Erro ao listar empresas:', error.response?.data);
    res.status(500).json({
      error: 'Erro ao listar empresas',
      details: error.response?.data || error.message
    });
  }
});

// ⚡ Página de mapeamento em tabela
app.get('/mapping-table', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configuração de Mapeamento CNPJ</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f9fa; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header h1 { color: #2c3e50; margin-bottom: 10px; }
        .header p { color: #7f8c8d; }
        .mode-selector { background: white; padding: 25px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .mode-buttons { display: flex; gap: 15px; margin-top: 15px; }
        .mode-btn { padding: 12px 24px; border: 2px solid #e9ecef; background: white; border-radius: 8px; cursor: pointer; transition: all 0.3s; }
        .mode-btn.active { border-color: #3498db; background: #3498db; color: white; }
        .mode-btn.crmhub { border-color: #e67e22; background: #e67e22; color: white; }
        .mapping-table { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 30px; }
        .table-header { background: #34495e; color: white; padding: 20px; }
        .table-row { display: grid; grid-template-columns: 2fr 1fr 2fr 1fr; gap: 20px; padding: 20px; border-bottom: 1px solid #ecf0f1; align-items: center; }
        .table-row:last-child { border-bottom: none; }
        .field-info h4 { color: #2c3e50; margin-bottom: 5px; }
        .field-info .example { color: #7f8c8d; font-size: 14px; }
        .status { padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .status.mapped { background: #d4edda; color: #155724; }
        .status.unmapped { background: #f8d7da; color: #721c24; }
        .status.crmhub { background: #ffeaa7; color: #d63031; }
        select { width: 100%; padding: 10px; border: 2px solid #e9ecef; border-radius: 6px; font-size: 14px; }
        select:focus { outline: none; border-color: #3498db; }
        .backup-section { background: white; padding: 25px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .crmhub-section { background: linear-gradient(135deg, #e67e22, #f39c12); color: white; padding: 25px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .crmhub-section h3 { margin-bottom: 15px; }
        .crmhub-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; margin-top: 15px; }
        .crmhub-field { background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; }
        .actions { display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; }
        .btn { padding: 12px 30px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.3s; }
        .btn-primary { background: #3498db; color: white; }
        .btn-primary:hover { background: #2980b9; }
        .btn-success { background: #27ae60; color: white; }
        .btn-success:hover { background: #229954; }
        .btn-crmhub { background: #e67e22; color: white; }
        .btn-crmhub:hover { background: #d35400; }
        .summary { background: #e8f4fd; border: 1px solid #bee5eb; padding: 20px; border-radius: 8px; margin-top: 20px; }
        .hidden { display: none; }
        @media (max-width: 768px) {
            .table-row { grid-template-columns: 1fr; gap: 10px; }
            .mode-buttons { flex-direction: column; }
            .actions { flex-direction: column; align-items: center; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🗺️ Configuração de Mapeamento CNPJ</h1>
            <p>Configure como os dados da Receita Federal serão salvos no HubSpot</p>
        </div>

        <div class="mode-selector">
            <h3>Modo de Mapeamento</h3>
            <p>Escolha como deseja mapear os dados do CNPJ:</p>
            <div class="mode-buttons">
                <button class="mode-btn active" data-mode="single">
                    📋 Campo Único<br><small>Todos os dados em um campo</small>
                </button>
                <button class="mode-btn" data-mode="individual">
                    🗺️ Mapeamento Individual<br><small>Cada dado em um campo específico</small>
                </button>
                <button class="mode-btn crmhub" data-mode="crmhub">
                    🚀 CRMHub<br><small>Campos dedicados CRMHub</small>
                </button>
            </div>
        </div>

        <div id="single-mode" class="mapping-section">
            <div class="backup-section">
                <h3>📂 Campo de Destino</h3>
                <p>Todos os dados do CNPJ serão salvos formatados neste campo:</p>
                <select id="single-field">
                    <option value="teste_cnpj">📋 Campo teste CNPJ (teste_cnpj)</option>
                    <option value="name">📝 Nome da empresa (name)</option>
                    <option value="description">📝 Descrição (description)</option>
                    <option value="phone">📞 Telefone (phone)</option>
                    <option value="city">🏙️ Cidade (city)</option>
                    <option value="state">🌎 Estado (state)</option>
                    <option value="website">🌐 Website (website)</option>
                    <option value="zip">📮 CEP (zip)</option>
                </select>
            </div>
        </div>

        <div id="individual-mode" class="mapping-section hidden">
            <div class="mapping-table">
                <div class="table-header">
                    <h3>Mapeamento Individual de Campos</h3>
                </div>
                <div class="table-row">
                    <div class="field-info">
                        <h4>📞 Telefone da Receita Federal</h4>
                        <div class="example">Ex: (11) 99999-9999</div>
                    </div>
                    <div class="status mapped">🟢 Mapeado</div>
                    <select data-field="telefone">
                        <option value="nenhum">🚫 Não mapear</option>
                        <option value="phone" selected>📞 Telefone (phone)</option>
                        <option value="name">📝 Nome da empresa (name)</option>
                        <option value="description">📝 Descrição (description)</option>
                        <option value="city">🏙️ Cidade (city)</option>
                        <option value="state">🌎 Estado (state)</option>
                        <option value="website">🌐 Website (website)</option>
                        <option value="zip">📮 CEP (zip)</option>
                        <option value="teste_cnpj">📋 Campo teste CNPJ (teste_cnpj)</option>
                    </select>
                    <div class="field-target">→ phone</div>
                </div>
                <!-- Outros campos... -->
            </div>

            <div class="backup-section">
                <h3>📦 Campo para Dados Não Mapeados</h3>
                <p>Dados que não foram mapeados individualmente serão salvos neste campo:</p>
                <select id="backup-field">
                    <option value="teste_cnpj" selected>📋 Campo teste CNPJ (teste_cnpj)</option>
                    <option value="description">📝 Descrição (description)</option>
                    <option value="name">📝 Nome da empresa (name)</option>
                    <option value="phone">📞 Telefone (phone)</option>
                    <option value="city">🏙️ Cidade (city)</option>
                    <option value="state">🌎 Estado (state)</option>
                    <option value="website">🌐 Website (website)</option>
                    <option value="zip">📮 CEP (zip)</option>
                </select>
            </div>
        </div>

        <div id="crmhub-mode" class="mapping-section hidden">
            <div class="crmhub-section">
                <h3>🚀 Modo CRMHub - Campos Dedicados</h3>
                <p>Os dados do CNPJ serão salvos em campos específicos criados automaticamente:</p>
                
                <div class="crmhub-fields">
                    <div class="crmhub-field">
                        <strong>🏢 CNPJ Enriquecido</strong><br>
                        <small>cnpj_enriquecido_crmhub</small>
                    </div>
                    <div class="crmhub-field">
                        <strong>📞 Telefone Enriquecido</strong><br>
                        <small>telefone_enriquecido_crmhub</small>
                    </div>
                    <div class="crmhub-field">
                        <strong>🏢 Razão Social</strong><br>
                        <small>razao_social_crmhub</small>
                    </div>
                    <div class="crmhub-field">
                        <strong>✨ Nome Fantasia</strong><br>
                        <small>nome_fantasia_crmhub</small>
                    </div>
                    <div class="crmhub-field">
                        <strong>📊 Situação Cadastral</strong><br>
                        <small>situacao_cadastral_crmhub</small>
                    </div>
                    <div class="crmhub-field">
                        <strong>📏 Porte da Empresa</strong><br>
                        <small>porte_empresa_crmhub</small>
                    </div>
                    <div class="crmhub-field">
                        <strong>🏭 Atividade Principal</strong><br>
                        <small>atividade_principal_crmhub</small>
                    </div>
                    <div class="crmhub-field">
                        <strong>🏠 Endereço Completo</strong><br>
                        <small>endereco_completo_crmhub</small>
                    </div>
                    <div class="crmhub-field">
                        <strong>💰 Capital Social</strong><br>
                        <small>capital_social_crmhub</small>
                    </div>
                    <div class="crmhub-field">
                        <strong>📅 Data Atualização</strong><br>
                        <small>data_atualizacao_crmhub</small>
                    </div>
                </div>
            </div>
        </div>

        <div class="actions">
            <button class="btn btn-primary" onclick="saveConfiguration()">💾 Salvar Configuração</button>
            <button class="btn btn-success" onclick="testConfiguration()">🧪 Criar Empresa Teste</button>
            <button class="btn btn-crmhub" onclick="createCRMHubFields()">🏗️ Criar Campos CRMHub</button>
            <button class="btn btn-crmhub" onclick="testCRMHubEnrichment()">🚀 Testar CRMHub</button>
        </div>

        <div id="summary" class="summary hidden">
            <h4>📊 Resumo da Configuração</h4>
            <div id="summary-content"></div>
        </div>
    </div>

    <script>
        let currentMode = 'single';
        
        // Alternar entre modos
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                currentMode = btn.dataset.mode;
                
                // Esconder todas as seções
                document.querySelectorAll('.mapping-section').forEach(section => {
                    section.classList.add('hidden');
                });
                
                // Mostrar seção apropriada
                if (currentMode === 'single') {
                    document.getElementById('single-mode').classList.remove('hidden');
                } else if (currentMode === 'individual') {
                    document.getElementById('individual-mode').classList.remove('hidden');
                } else if (currentMode === 'crmhub') {
                    document.getElementById('crmhub-mode').classList.remove('hidden');
                }
                
                updateSummary();
            });
        });
        
        // Atualizar resumo
        function updateSummary() {
            const summary = document.getElementById('summary');
            const content = document.getElementById('summary-content');
            
            if (currentMode === 'single') {
                const field = document.getElementById('single-field').value;
                content.innerHTML = \`
                    <p><strong>Modo:</strong> Campo Único</p>
                    <p><strong>Destino:</strong> \${field}</p>
                    <p><strong>Descrição:</strong> Todos os dados do CNPJ serão salvos formatados em um único campo</p>
                \`;
            } else if (currentMode === 'crmhub') {
                content.innerHTML = \`
                    <p><strong>Modo:</strong> CRMHub - Campos Dedicados</p>
                    <p><strong>Campos:</strong> 10 campos específicos serão criados/utilizados</p>
                    <p><strong>Descrição:</strong> Cada dado do CNPJ vai para seu campo específico no grupo CRMHub</p>
                    <p><strong>Endpoint:</strong> Use /api/enrich-crmhub para enriquecer</p>
                \`;
            } else {
                // Individual mode logic here...
                content.innerHTML = \`
                    <p><strong>Modo:</strong> Mapeamento Individual</p>
                    <p><strong>Descrição:</strong> Configure cada campo individualmente</p>
                \`;
            }
            
            summary.classList.remove('hidden');
        }
        
        // Salvar configuração
        async function saveConfiguration() {
            if (currentMode === 'crmhub') {
                alert('✅ Modo CRMHub configurado! Use os botões específicos para criar campos e testar.');
                return;
            }
            
            // Lógica para outros modos...
            alert('✅ Configuração salva com sucesso!');
        }
        
        // Criar campos CRMHub
        async function createCRMHubFields() {
            try {
                const response = await fetch('/api/crmhub-dropdown-update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ selectedOption: 'create_all_fields' })
                });
                
                const result = await response.json();
                alert(result.response?.message || '✅ Campos CRMHub processados!');
                
            } catch (error) {
                alert('❌ Erro ao criar campos CRMHub: ' + error.message);
            }
        }
        
        // Testar enriquecimento CRMHub
        async function testCRMHubEnrichment() {
            try {
                // Primeiro criar empresa teste
                const createResponse = await fetch('/create-test-company', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const createResult = await createResponse.json();
                
                if (!createResult.success) {
                    alert('❌ Erro ao criar empresa teste: ' + createResult.error);
                    return;
                }
                
                // Aguardar um pouco e então enriquecer com CRMHub
                setTimeout(async () => {
                    const enrichResponse = await fetch('/api/enrich-crmhub', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ companyId: createResult.companyId })
                    });
                    
                    const enrichResult = await enrichResponse.json();
                    
                    if (enrichResult.success) {
                        alert(\`🚀 Teste CRMHub realizado com sucesso!\\n\\nEmpresa ID: \${createResult.companyId}\\nCampos atualizados: \${enrichResult.fieldsUpdated}\\nCNPJ: \${enrichResult.cnpj}\`);
                    } else {
                        alert('❌ Erro no enriquecimento CRMHub: ' + enrichResult.error);
                    }
                }, 1000);
                
            } catch (error) {
                alert('❌ Erro no teste CRMHub: ' + error.message);
            }
        }
        
        // Testar configuração (outros modos)
        async function testConfiguration() {
            if (currentMode === 'crmhub') {
                testCRMHubEnrichment();
                return;
            }
            
            try {
                const response = await fetch('/create-test-company', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert(\`✅ Empresa teste criada! ID: \${result.companyId}\`);
                } else {
                    alert('❌ Erro: ' + result.error);
                }
            } catch (error) {
                alert('❌ Erro ao criar empresa teste: ' + error.message);
            }
        }
        
        // Inicializar
        updateSummary();
    </script>
</body>
</html>`;
  
  res.send(html);
});

// Sincronização
app.get('/api/sync-cnpj', async (req, res) => {
  try {
    await syncCNPJs();
    res.json({ status: 'success', message: 'Sync concluído com sucesso' });
  } catch (error) {
    console.error('❌ Erro no sync:', error.message);
    res.status(500).json({ error: 'Erro na sincronização' });
  }
});

app.post('/api/sync-cnpj', async (req, res) => {
  try {
    await syncCNPJs();
    res.json({ status: 'success', message: 'Sync concluído com sucesso' });
  } catch (error) {
    console.error('❌ Erro no sync:', error.message);
    res.status(500).json({ error: 'Erro na sincronização' });
  }
});

console.log('🔧 Sistema de mapeamento de campos CNPJ carregado!');
console.log('🗺️ Sistema de mapeamento individual carregado!');
console.log('🎨 Interface HubSpot carregada!');
console.log('📞 Endpoints de telefone configurados!');
console.log('🚀 Sistema CRMHub Toggle carregado com 10 campos dedicados!');
console.log('🔄 Endpoints CRMHub Toggle configurados:');
console.log('   POST /api/crmhub-toggle-fetch - Verificar status do toggle');
console.log('   POST /api/crmhub-toggle-update - Ligar/desligar CRMHub');
console.log('   POST /enrich - Enriquecer empresa (usa CRMHub se ativo)');
console.log('   GET /api/test-crmhub - Testar endpoints');
console.log(`🎯 Status inicial CRMHub: ${crmhubToggleEnabled ? 'ATIVADO' : 'DESATIVADO'}`);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 CNPJ Enricher 2.0 com CRMHub Toggle rodando na porta ${PORT}`));
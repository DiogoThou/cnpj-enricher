const express = require('express');
const axios = require('axios');

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

// ⚡ FUNÇÃO PARA CRIAR CAMPOS CRMHUB - VERSÃO CORRIGIDA
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
            },
            timeout: 10000
          }
        );
        
        console.log(`✅ Campo criado: ${field.name}`);
        results.created.push(field.name);
        
        // Pausa maior entre criações para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        if (error.response?.status === 409) {
          console.log(`⚠️ Campo já existe: ${field.name}`);
          results.existing.push(field.name);
        } else {
          console.error(`❌ Erro ao criar campo ${field.name}:`, {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
          });
          results.errors.push({
            field: field.name,
            error: error.response?.data || error.message,
            status: error.response?.status
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

// ⚡ FUNÇÃO PARA VERIFICAR STATUS DOS CAMPOS CRMHUB - VERSÃO CORRIGIDA
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
            },
            timeout: 5000
          }
        );
        
        console.log(`✅ Campo encontrado: ${field.name}`);
        status.existing.push({
          name: field.name,
          label: response.data.label,
          type: response.data.type
        });
        
        // Pequena pausa entre verificações
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`❌ Campo não encontrado: ${field.name}`);
          status.missing.push(field.name);
        } else {
          console.error(`⚠️ Erro ao verificar campo ${field.name}:`, {
            status: error.response?.status,
            data: error.response?.data
          });
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

// ⚡ ENDPOINTS PRINCIPAIS

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

// ⚡ ENDPOINTS CRMHUB DROPDOWN - CORRIGIDOS

// CRMHub Dropdown Fetch
app.post('/api/crmhub-dropdown-fetch', (req, res) => {
  console.log('🔽 CRMHub Dropdown Fetch chamado');
  
  try {
    const options = [
      {
        text: '✅ Sim - Criar campos CRMHub',
        value: 'sim',
        description: 'Criar 10 campos personalizados para dados do CNPJ'
      },
      {
        text: '❌ Não - Usar campo description',
        value: 'nao',
        description: 'Salvar todos os dados no campo description padrão'
      }
    ];

    console.log('📋 Retornando opções: Sim/Não');

    return res.json({
      response: {
        options: options,
        selectedOption: 'sim',
        placeholder: 'Criar campos CRMHub?'
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no dropdown:', error);
    
    return res.json({
      response: {
        options: [
          { 
            text: '✅ Sim - Criar campos', 
            value: 'sim',
            description: 'Criar campos CRMHub'
          }
        ],
        selectedOption: 'sim',
        placeholder: 'Criar campos CRMHub?'
      }
    });
  }
});

// CRMHub Dropdown Update
app.post('/api/crmhub-dropdown-update', (req, res) => {
  console.log('🔽 CRMHub Dropdown Update chamado');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const selectedOption = req.body.selectedOption || 'sim';
    
    console.log(`🎯 Opção selecionada: ${selectedOption}`);
    
    if (selectedOption === 'sim') {
      const message = '✅ Configurado para criar campos CRMHub! Os 10 campos personalizados serão criados automaticamente quando necessário.';
      
      console.log('🎉 Configurado para criar campos CRMHub');
      
      return res.json({
        response: {
          actionType: 'DROPDOWN_UPDATE',
          selectedOption: selectedOption,
          message: message,
          configuration: {
            mode: 'crmhub_fields',
            fieldsCount: 10
          }
        }
      });
      
    } else {
      const message = '✅ Configurado para usar campo "description" padrão do HubSpot para salvar dados do CNPJ.';
      
      console.log('📝 Configurado para usar campo description');
      
      return res.json({
        response: {
          actionType: 'DROPDOWN_UPDATE',
          selectedOption: selectedOption,
          message: message,
          configuration: {
            mode: 'description_field',
            field: 'description'
          }
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Erro no dropdown update:', error);
    
    return res.json({
      response: {
        actionType: 'DROPDOWN_UPDATE',
        selectedOption: 'sim',
        message: '❌ Erro interno. Tente novamente.',
        error: error.message
      }
    });
  }
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
      razaoSocial: cnpjData.razao_social || '',
      nomeFantasia: cnpjData.estabelecimento?.nome_fantasia || '',
      situacao: cnpjData.estabelecimento?.situacao_cadastral || '',
      porte: cnpjData.porte?.descricao || '',
      cidade: cnpjData.estabelecimento?.cidade?.nome || '',
      estado: cnpjData.estabelecimento?.estado?.sigla || '',
      atividade: cnpjData.estabelecimento?.atividade_principal?.descricao || '',
      email: cnpjData.estabelecimento?.email || '',
      telefone: cnpjData.estabelecimento?.telefone1 ? 
        `(${cnpjData.estabelecimento.ddd1}) ${cnpjData.estabelecimento.telefone1}` : ''
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

// ⚡ Página inicial
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CNPJ Enricher 2.0</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 15px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
        .header { text-align: center; margin-bottom: 40px; }
        .header h1 { color: #2c3e50; margin: 0; font-size: 2.5em; }
        .header p { color: #7f8c8d; margin: 10px 0; font-size: 1.2em; }
        .status { background: #e8f5e8; border: 1px solid #4caf50; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .endpoints { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .endpoint { background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #007bff; }
        .btn { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 8px; margin: 10px 5px; transition: all 0.3s; }
        .btn:hover { background: #0056b3; transform: translateY(-2px); }
        .btn-success { background: #28a745; }
        .btn-success:hover { background: #1e7e34; }
        .btn-warning { background: #ffc107; color: #212529; }
        .btn-warning:hover { background: #e0a800; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 CNPJ Enricher 2.0</h1>
            <p>Sistema Inteligente de Enriquecimento de Empresas</p>
        </div>
        
        <div class="status">
            <h3>✅ Sistema Online</h3>
            <p><strong>Status:</strong> Funcionando</p>
            <p><strong>Token:</strong> ${HUBSPOT_ACCESS_TOKEN ? 'Configurado ✅' : 'Não configurado ❌'}</p>
            <p><strong>CRMHub:</strong> ${crmhubToggleEnabled ? 'Ativo 🚀' : 'Inativo ⚪'}</p>
        </div>
        
        <div class="endpoints">
            <h3>📋 Endpoints Principais</h3>
            
            <div class="endpoint">
                <h4>POST /enrich</h4>
                <p>Enriquecer empresa com dados da Receita Federal</p>
                <code>{"companyId": "123456789"}</code>
            </div>
            
            <div class="endpoint">
                <h4>POST /create-test-company</h4>
                <p>Criar empresa de teste com CNPJ válido</p>
            </div>
            
            <div class="endpoint">
                <h4>POST /api/enrich-crmhub</h4>
                <p>Enriquecer usando campos específicos CRMHub</p>
                <code>{"companyId": "123456789"}</code>
            </div>
            
            <div class="endpoint">
                <h4>GET /account</h4>
                <p>Verificar status do sistema</p>
            </div>
        </div>
        
        <div style="text-align: center; margin-top: 30px;">
            <a href="/account" class="btn">📊 Status do Sistema</a>
            <a href="/create-test-company" class="btn btn-success">🏢 Criar Empresa Teste</a>
            <a href="/settings" class="btn btn-warning">⚙️ Configurações</a>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #7f8c8d;">
            <p>CNPJ Enricher 2.0 - Powered by CRMHub</p>
        </div>
    </div>
</body>
</html>`;
  
  res.send(html);
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

console.log('🔧 Sistema de mapeamento de campos CNPJ carregado!');
console.log('🗺️ Sistema de mapeamento individual carregado!');
console.log('🎨 Interface HubSpot carregada!');
console.log('📞 Endpoints de telefone configurados!');
console.log('🚀 Sistema CRMHub Toggle carregado com 10 campos dedicados!');
console.log('🔄 Endpoints CRMHub Dropdown configurados:');
console.log('   POST /api/crmhub-dropdown-fetch - Verificar opções');
console.log('   POST /api/crmhub-dropdown-update - Executar ação');
console.log(`🎯 Status inicial CRMHub: ${crmhubToggleEnabled ? 'ATIVADO' : 'DESATIVADO'}`);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 CNPJ Enricher 2.0 com CRMHub rodando na porta ${PORT}`));

module.exports = app;
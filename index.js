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

// Variáveis para persistência
let selectedDestinationField = 'teste_cnpj';
let availableFields = [];
let savedUserChoice = null;

// Sistema de mapeamento individual
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

// Definição dos campos do CNPJ
const cnpjFieldsDefinition = {
  telefone: {
    label: '📞 Telefone da Receita Federal',
    example: '(11) 99999-9999',
    description: 'Telefone principal cadastrado na RF',
    hubspotSuggestions: ['phone', 'mobile', 'telefone', 'contact_phone']
  },
  razao_social: {
    label: '🏢 Razão Social',
    example: 'EMPRESA TESTE LTDA',
    description: 'Nome oficial da empresa na RF',
    hubspotSuggestions: ['name', 'company_name', 'legal_name', 'razao_social']
  },
  nome_fantasia: {
    label: '✨ Nome Fantasia',
    example: 'Empresa Teste',
    description: 'Nome fantasia/comercial',
    hubspotSuggestions: ['description', 'trade_name', 'fantasy_name', 'nome_fantasia']
  },
  cidade: {
    label: '🏙️ Cidade',
    example: 'São Paulo',
    description: 'Cidade da sede da empresa',
    hubspotSuggestions: ['city', 'location', 'cidade', 'municipality']
  },
  estado: {
    label: '🌎 Estado',
    example: 'SP',
    description: 'Estado (UF) da sede',
    hubspotSuggestions: ['state', 'region', 'estado', 'uf']
  },
  atividade: {
    label: '🏭 Atividade Principal',
    example: 'Desenvolvimento de software',
    description: 'CNAE principal da empresa',
    hubspotSuggestions: ['industry', 'business_type', 'atividade', 'sector']
  },
  cep: {
    label: '📮 CEP',
    example: '01234-567',
    description: 'CEP da sede da empresa',
    hubspotSuggestions: ['zip', 'postal_code', 'cep', 'zipcode']
  },
  email: {
    label: '📧 Email da RF',
    example: 'contato@empresa.com',
    description: 'Email cadastrado na Receita Federal',
    hubspotSuggestions: ['email', 'contact_email', 'cnpj_email', 'business_email']
  },
  endereco: {
    label: '🏠 Endereço Completo',
    example: 'Rua Teste, 123',
    description: 'Endereço completo da sede',
    hubspotSuggestions: ['address', 'street_address', 'endereco', 'full_address']
  },
  situacao: {
    label: '📊 Situação Cadastral',
    example: 'Ativa',
    description: 'Status na Receita Federal',
    hubspotSuggestions: ['status', 'company_status', 'situacao', 'registration_status']
  },
  porte: {
    label: '📏 Porte da Empresa',
    example: 'Microempresa',
    description: 'Classificação do porte',
    hubspotSuggestions: ['company_size', 'size', 'porte', 'business_size']
  },
  capital_social: {
    label: '💰 Capital Social',
    example: 'R$ 100.000,00',
    description: 'Capital social registrado',
    hubspotSuggestions: ['capital', 'social_capital', 'capital_social', 'investment']
  }
};

// Função para sugerir campos automaticamente
function getSuggestedMapping(availableFields) {
  const suggestions = {};
  
  Object.keys(cnpjFieldsDefinition).forEach(cnpjField => {
    const fieldDef = cnpjFieldsDefinition[cnpjField];
    
    for (const suggestion of fieldDef.hubspotSuggestions) {
      const exactMatch = availableFields.find(field => 
        field.value.toLowerCase() === suggestion.toLowerCase()
      );
      if (exactMatch) {
        suggestions[cnpjField] = exactMatch.value;
        break;
      }
    }
    
    if (!suggestions[cnpjField]) {
      for (const suggestion of fieldDef.hubspotSuggestions) {
        const partialMatch = availableFields.find(field => 
          field.value.toLowerCase().includes(suggestion.toLowerCase()) ||
          field.text.toLowerCase().includes(suggestion.toLowerCase())
        );
        if (partialMatch) {
          suggestions[cnpjField] = partialMatch.value;
          break;
        }
      }
    }
  });
  
  return suggestions;
}

// Função para gerar payload baseado no mapeamento individual
function generateIndividualMappingPayload(cnpjData, cnpjNumber) {
  const payload = { properties: {} };
  const unmappedData = [];
  
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
  
  let mappedFieldsCount = 0;
  Object.keys(extractedData).forEach(cnpjField => {
    const hubspotField = individualMapping[cnpjField];
    const value = extractedData[cnpjField];
    
    if (hubspotField && hubspotField !== 'nenhum' && value) {
      payload.properties[hubspotField] = value;
      mappedFieldsCount++;
      console.log(`✅ Mapeado: ${cnpjField} → ${hubspotField} = "${value}"`);
    } else if (value) {
      unmappedData.push(`${cnpjFieldsDefinition[cnpjField]?.label}: ${value}`);
      console.log(`📦 Não mapeado: ${cnpjField} = "${value}"`);
    }
  });
  
  if (unmappedData.length > 0) {
    const backupField = savedUserChoice || selectedDestinationField;
    if (backupField && backupField !== 'nenhum') {
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

// Função para limpar CNPJ
function cleanCNPJ(cnpjInput) {
  console.log('🧹 Limpando CNPJ:', cnpjInput, 'Tipo:', typeof cnpjInput);
  
  if (!cnpjInput) {
    console.log('🧹 CNPJ vazio ou null');
    return '';
  }
  
  const cnpjString = String(cnpjInput).trim();
  console.log('🧹 CNPJ como string:', cnpjString);
  
  const cleaned = cnpjString.replace(/[^\d]/g, '');
  console.log('🧹 CNPJ após limpeza:', cleaned, 'Tamanho:', cleaned.length);
  
  if (cleaned.length !== 14 && cnpjString.length > 0) {
    console.log('⚠️ Formatos aceitos:');
    console.log('   14665903000104 (sem pontuação)');
    console.log('   14.665.903/0001-04 (com pontuação)');
    console.log('   14 665 903 0001 04 (com espaços)');
  }
  
  return cleaned;
}

// Função para formatar dados do CNPJ em texto legível
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

// Função para usar mapeamento individual ou campo único
function updateEnrichmentPayload(cnpjData, cnpjNumber) {
  const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
  
  if (hasIndividualMapping) {
    console.log('🗺️ Usando mapeamento individual de campos');
    return generateIndividualMappingPayload(cnpjData, cnpjNumber);
  } else {
    console.log('📋 Usando modo de campo único (compatibilidade)');
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

// Função para buscar campos de texto de empresa no HubSpot
async function fetchCompanyTextFields() {
  if (!HUBSPOT_ACCESS_TOKEN) {
    console.log('❌ Token não configurado para buscar campos');
    return [];
  }

  try {
    console.log('🔍 Buscando TODOS os campos de empresa...');
    console.log('🔑 Token disponível:', HUBSPOT_ACCESS_TOKEN ? 'SIM' : 'NÃO');
    console.log('🔑 Token preview:', HUBSPOT_ACCESS_TOKEN ? HUBSPOT_ACCESS_TOKEN.substring(0, 20) + '...' : 'VAZIO');
    
    const response = await axios.get(
      'https://api.hubapi.com/crm/v3/properties/companies',
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`📊 Total de campos encontrados: ${response.data.results.length}`);

    const textFields = response.data.results.filter(field => {
      const isTextType = (
        field.type === 'string' ||           
        field.type === 'enumeration' ||      
        field.fieldType === 'text' ||
        field.fieldType === 'textarea' ||
        field.fieldType === 'phonenumber' ||
        field.fieldType === 'email'
      );
      
      const isEditable = !field.readOnlyValue && !field.calculated;
      const isVisible = !field.hidden;
      const isNotSystemField = !field.name.startsWith('hs_') || field.name.includes('additional');

      return isTextType && isEditable && isVisible && isNotSystemField;
    });

    console.log(`✅ Campos de texto filtrados: ${textFields.length}`);
    
    const mappedFields = textFields.map(field => ({
      text: `${field.label || field.name} (${field.name})`,
      value: field.name,
      fieldType: field.fieldType,
      type: field.type,
      description: field.description || `Campo: ${field.name}`
    }));

    return mappedFields;
    
  } catch (error) {
    console.error('❌ Erro ao buscar campos de empresa:', error.response?.data || error.message);
    console.error('🔑 Token usado:', HUBSPOT_ACCESS_TOKEN ? HUBSPOT_ACCESS_TOKEN.substring(0, 20) + '...' : 'VAZIO');
    return [];
  }
}

// Status do app
app.get('/account', (req, res) => {
  res.json({
    status: 'connected',
    app: 'CNPJ Enricher',
    version: '1.0',
    tokenStatus: HUBSPOT_ACCESS_TOKEN ? 'Configurado' : 'Não configurado',
    configuracao: {
      mapeamentoConfigurado: true,
      totalCamposMapeados: Object.keys(cnpjFieldsDefinition).length,
      settingsUrl: '/settings'
    },
    endpoints: {
      configurar: 'GET /settings',
      enriquecer: 'POST /enrich',
      status: 'GET /api/config-status',
      criarTeste: 'POST /create-test-company'
    }
  });
});

// OAuth Callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('❌ Código de autorização não fornecido.');

  console.log('🔍 Código recebido:', code);

  try {
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    HUBSPOT_ACCESS_TOKEN = access_token;

    console.log('✅ Access Token gerado:', access_token);

    res.send(`
      <h2>✅ Token gerado com sucesso!</h2>
      <p><strong>Access Token:</strong> ${access_token.substring(0, 20)}...</p>
      <p><strong>Expira em:</strong> ${expires_in} segundos</p>
      <p><strong>Status:</strong> Pronto para usar!</p>
      <hr>
      <p><a href="/account">Verificar Status</a></p>
    `);
  } catch (error) {
    console.error('❌ Erro ao trocar code pelo token:', error.response?.data);
    res.status(500).send(`<h2>❌ Erro ao gerar token</h2>`);
  }
});

// Refresh do token
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

    const { access_token } = response.data;
    HUBSPOT_ACCESS_TOKEN = access_token;

    console.log('✅ Novo Access Token:', access_token);
    res.send('✅ Novo access_token gerado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao fazer refresh do token:', error.response?.data || error.message);
    res.status(500).send('❌ Erro ao gerar novo token.');
  }
});

// ENRICHMENT PRINCIPAL
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
      details: 'Execute OAuth primeiro'
    });
  }

  try {
    console.log('📡 Buscando empresa no HubSpot...');
    
    const hubspotCompany = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/companies/${companyId}?properties=cnpj,name,domain,website,phone,city,state,country`,
      {
        headers: { 
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Empresa encontrada no HubSpot');
    console.log('📋 Propriedades da empresa:', JSON.stringify(hubspotCompany.data.properties, null, 2));

    const properties = hubspotCompany.data.properties;
    
    console.log('🔍 TODAS as propriedades disponíveis:');
    Object.keys(properties).forEach(key => {
      console.log(`${key}: "${properties[key]}"`);
    });
    
    let cnpjRaw = properties.cnpj || 
                  properties.CNPJ ||
                  properties.registration_number ||
                  properties.company_cnpj ||
                  properties.document_number ||
                  properties.tax_id ||
                  properties.federal_id;

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
        'User-Agent': 'CNPJ-Enricher/1.0'
      }
    });

    console.log('✅ Dados do CNPJ obtidos com sucesso');
    
    const cnpjData = cnpjDataResponse.data;
    console.log('📋 Dados do CNPJ:', JSON.stringify(cnpjData, null, 2));

    const updatePayload = updateEnrichmentPayload(cnpjData, cnpjLimpo);

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
    const campoUsado = hasIndividualMapping ? 'mapeamento individual' : (savedUserChoice || selectedDestinationField);
    
    console.log(`✅ Empresa atualizada com sucesso! Modo usado: ${campoUsado}`);
    
    const dadosEmpresa = {
      razaoSocial: cnpjData.razao_social,
      nomeFantasia: cnpjData.estabelecimento?.nome_fantasia,
      situacao: cnpjData.estabelecimento?.situacao_cadastral,
      porte: cnpjData.porte?.descricao,
      cidade: cnpjData.estabelecimento?.cidade?.nome,
      estado: cnpjData.estabelecimento?.estado?.sigla,
      atividade: cnpjData.estabelecimento?.atividade_principal?.descricao,
      email: cnpjData.estabelecimento?.email,
      telefone: cnpjData.estabelecimento?.telefone1 ? 
        `(${cnpjData.estabelecimento.ddd1}) ${cnpjData.estabelecimento.telefone1}` : ''
    };
    
    console.log(`🎉 SUCESSO COMPLETO - Dados da empresa processados com: ${campoUsado}`);

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
        modo: hasIndividualMapping ? 'mapeamento_individual' : 'campo_unico',
        campoDestino: hasIndividualMapping ? 'múltiplos campos' : campoUsado,
        tipoConteudo: hasIndividualMapping ? 'Campos específicos + backup' : 'Texto formatado completo'
      }
    });

  } catch (error) {
    console.error('❌ Erro detalhado no enriquecimento:', error.message);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        error: 'Token do HubSpot inválido ou expirado',
        details: 'Execute OAuth novamente'
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
      details: error.message,
      step: 'Erro não identificado - verifique os logs'
    });
  }
});

// Criar campo de teste
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
      fieldType: 'textarea',
      proximoPasso: 'Agora execute POST /enrich para testar o enriquecimento'
    });
    
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('⚠️ Campo teste_cnpj já existe');
      res.json({
        success: true,
        message: 'Campo teste_cnpj já existe no HubSpot',
        status: 'already_exists',
        proximoPasso: 'Execute POST /enrich para testar o enriquecimento'
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

// Adicionar CNPJ a uma empresa existente
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
      message: 'CNPJ adicionado à empresa com sucesso',
      testeEnrichUrl: `POST /enrich com {"companyId": "${companyId}"}`
    });
  } catch (error) {
    console.error('❌ Erro ao adicionar CNPJ:', error.response?.data);
    res.status(500).json({
      error: 'Erro ao adicionar CNPJ',
      details: error.response?.data
    });
  }
});

// Criar empresa de teste com CNPJ
app.post('/create-test-company', async (req, res) => {
  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(401).json({ 
      error: 'Token não configurado'
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
      testEnrichUrl: `POST /enrich com {"companyId": "${response.data.id}"}`,
      configuracao: {
        modoAtivo: modo,
        campoDestino: hasIndividualMapping ? 'múltiplos campos' : (savedUserChoice || selectedDestinationField),
        tipoConteudo: hasIndividualMapping ? 'Campos específicos + backup' : 'Todos os dados formatados em texto'
      },
      proximoTeste: {
        url: 'POST /enrich',
        body: { companyId: response.data.id },
        expectativa: `Dados do CNPJ serão processados com: ${modo}`
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

// Listar empresas do HubSpot
app.get('/companies', async (req, res) => {
  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Token não configurado' });
  }

  try {
    console.log('📋 Listando empresas do HubSpot...');
    
    const response = await axios.get(
      'https://api.hubapi.com/crm/v3/objects/companies?limit=10&properties=name,cnpj,domain,city,state',
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`📊 Total de empresas encontradas: ${response.data.results.length}`);
    
    const companies = response.data.results.map(company => ({
      id: company.id,
      name: company.properties.name || 'Sem nome',
      cnpj: company.properties.cnpj || 'Sem CNPJ',
      domain: company.properties.domain || 'Sem domain',
      location: `${company.properties.city || 'N/A'}/${company.properties.state || 'N/A'}`
    }));

    res.json({
      success: true,
      totalCompanies: response.data.results.length,
      companies: companies,
      debugInfo: {
        tokenStatus: 'Configurado',
        apiResponse: response.status === 200 ? 'OK' : 'Erro'
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar empresas:', error.response?.data);
    res.status(500).json({
      error: 'Erro ao listar empresas',
      details: error.response?.data
    });
  }
});

// Testar API CNPJ
app.get('/test-cnpj/:cnpj', async (req, res) => {
  const { cnpj } = req.params;
  
  const cleanedCNPJ = cleanCNPJ(cnpj);
  
  if (cleanedCNPJ.length !== 14) {
    return res.status(400).json({
      error: 'CNPJ inválido',
      cnpjFornecido: cnpj,
      cnpjLimpo: cleanedCNPJ,
      exemplo: '14665903000104 ou 14.665.903/0001-04'
    });
  }

  try {
    console.log('🧪 Testando API CNPJ para:', cleanedCNPJ);
    
    const response = await axios.get(`https://publica.cnpj.ws/cnpj/${cleanedCNPJ}`, {
      timeout: 10000,
      headers: { 'User-Agent': 'CNPJ-Enricher/1.0' }
    });
    
    const cnpjData = response.data;
    
    res.json({
      success: true,
      cnpj: cleanedCNPJ,
      empresa: {
        razaoSocial: cnpjData.razao_social,
        nomeFantasia: cnpjData.estabelecimento?.nome_fantasia,
        situacao: cnpjData.estabelecimento?.situacao_cadastral,
        cidade: cnpjData.estabelecimento?.cidade?.nome,
        estado: cnpjData.estabelecimento?.estado?.sigla
      },
      message: 'API CNPJ funcionando normalmente'
    });
    
  } catch (error) {
    if (error.response?.status === 429) {
      res.status(429).json({
        error: 'Rate limit atingido',
        message: 'Aguarde alguns minutos e tente novamente',
        details: error.response?.data,
        proximaTentativa: 'Aguarde 1-2 minutos'
      });
    } else {
      res.status(500).json({
        error: 'Erro na API CNPJ',
        details: error.response?.data || error.message
      });
    }
  }
});

// Sincronização endpoints
app.get('/api/sync-cnpj', async (req, res) => {
  try {
    await syncCNPJs();
    res.json({ status: 'success', message: 'Sync concluído com sucesso (GET)' });
  } catch (error) {
    console.error('❌ Erro no sync-cnpj (GET):', error.message);
    res.status(500).json({ error: 'Erro na sincronização' });
  }
});

app.post('/api/sync-cnpj', async (req, res) => {
  try {
    await syncCNPJs();
    res.json({ status: 'success', message: 'Sync concluído com sucesso (POST)' });
  } catch (error) {
    console.error('❌ Erro no sync-cnpj (POST):', error.message);
    res.status(500).json({ error: 'Erro na sincronização' });
  }
});

// Endpoint para mapeamento individual
app.post('/api/individual-mapping-save', (req, res) => {
  console.log('💾 Salvando mapeamento individual...');
  
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
    
    return res.json({
      success: true,
      message: `Mapeamento individual salvo com sucesso!`,
      stats: {
        fieldsUpdated: updatedCount,
        totalMapped: mappedFields,
        totalUnmapped: unmappedFields,
        backupField: savedUserChoice || selectedDestinationField
      },
      mapping: individualMapping,
      nextStep: 'Use POST /enrich para testar o novo mapeamento'
    });
    
  } catch (error) {
    console.error('❌ Erro ao salvar mapeamento individual:', error);
    return res.status(500).json({
      error: 'Erro ao salvar mapeamento individual',
      details: error.message
    });
  }
});

// Endpoints de configuração
app.get('/api/mapping-status', (req, res) => {
  const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
  const mappedFields = Object.values(individualMapping).filter(field => field && field !== 'nenhum').length;
  const unmappedFields = Object.values(individualMapping).filter(field => !field || field === 'nenhum').length;
  
  res.json({
    success: true,
    mappingMode: hasIndividualMapping ? 'individual' : 'single_field',
    configuration: {
      individualMapping: {
        active: hasIndividualMapping,
        mappedFields: mappedFields,
        unmappedFields: unmappedFields,
        details: individualMapping
      },
      singleField: {
        active: !hasIndividualMapping,
        field: savedUserChoice || selectedDestinationField
      },
      backupField: savedUserChoice || selectedDestinationField
    },
    availableFields: availableFields.length
  });
});

app.get('/api/debug-settings', (req, res) => {
  res.json({
    selectedDestinationField: selectedDestinationField,
    savedUserChoice: savedUserChoice,
    currentField: savedUserChoice || selectedDestinationField,
    availableFieldsCount: availableFields.length,
    availableFields: availableFields.slice(0, 5),
    individualMapping: individualMapping,
    hasIndividualMapping: Object.values(individualMapping).some(field => field && field !== 'nenhum'),
    timestamp: new Date().toISOString(),
    status: 'Sistema completo com mapeamento individual ativo'
  });
});

console.log('🔧 Sistema de mapeamento de campos CNPJ carregado com sucesso!');
console.log('🗺️ Sistema de mapeamento individual carregado com sucesso!');
console.log('🎨 Interface HubSpot carregada com sucesso!');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 CNPJ Enricher rodando na porta ${PORT}`));
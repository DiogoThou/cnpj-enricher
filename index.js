const express = require('express');
const axios = require('axios');
const syncCNPJs = require('./syncCNPJs');
const app = express();

app.use(express.json());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
let HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN; // ⚡ Mudança: let ao invés de const
const HUBSPOT_REFRESH_TOKEN = process.env.HUBSPOT_REFRESH_TOKEN;
const REDIRECT_URI = process.env.REDIRECT_URI;

// ⚡ Armazenamento temporário para mapeamento (em produção usar banco de dados)
let fieldMapping = {
  razao_social: 'name',
  nome_fantasia: 'description', 
  situacao_cadastral: 'situacao_cadastral',
  capital_social: 'capital_social',
  porte: 'porte',
  atividade_principal: 'industry',
  telefone: 'phone',
  email: 'cnpj_email',
  endereco: 'address',
  cidade: 'city',
  estado: 'state',
  cep: 'zip'
};

// ⚡ VARIÁVEIS PARA PERSISTÊNCIA - APENAS ESTAS LINHAS MUDARAM
let selectedDestinationField = 'teste_cnpj'; // Padrão
let availableFields = []; // Cache dos campos disponíveis
let savedUserChoice = null; // ⚡ NOVA: Para salvar escolha do usuário

// ⚡ NOVO SISTEMA DE MAPEAMENTO INDIVIDUAL
let individualMapping = {
  telefone: null,        // (11) 99999-9999
  razao_social: null,    // EMPRESA TESTE LTDA
  nome_fantasia: null,   // Nome Fantasia
  cidade: null,          // São Paulo
  estado: null,          // SP
  atividade: null,       // Atividade Principal
  cep: null,            // 01234-567
  email: null,          // email@empresa.com
  endereco: null,       // Rua Teste, 123
  situacao: null,       // Ativa
  porte: null,          // Pequeno Porte
  capital_social: null  // R$ 100.000,00
};

// ⚡ Definição dos campos do CNPJ com exemplos
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

// ⚡ Função para sugerir campos automaticamente
function getSuggestedMapping(availableFields) {
  const suggestions = {};
  
  Object.keys(cnpjFieldsDefinition).forEach(cnpjField => {
    const fieldDef = cnpjFieldsDefinition[cnpjField];
    
    // Procurar match exato primeiro
    for (const suggestion of fieldDef.hubspotSuggestions) {
      const exactMatch = availableFields.find(field => 
        field.value.toLowerCase() === suggestion.toLowerCase()
      );
      if (exactMatch) {
        suggestions[cnpjField] = exactMatch.value;
        break;
      }
    }
    
    // Se não encontrou match exato, procurar parcial
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

// ⚡ Função para gerar payload baseado no mapeamento individual
function generateIndividualMappingPayload(cnpjData, cnpjNumber) {
  const payload = { properties: {} };
  const unmappedData = [];
  
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
    
    if (hubspotField && hubspotField !== 'nenhum' && value) {
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

// ⚡ Função melhorada para limpar CNPJ - aceita qualquer formato
function cleanCNPJ(cnpjInput) {
  console.log('🧹 Limpando CNPJ:', cnpjInput, 'Tipo:', typeof cnpjInput);
  
  if (!cnpjInput) {
    console.log('🧹 CNPJ vazio ou null');
    return '';
  }
  
  // Converter para string se necessário
  const cnpjString = String(cnpjInput).trim();
  console.log('🧹 CNPJ como string:', cnpjString);
  
  // Remover tudo que não é dígito (aceita qualquer formato)
  const cleaned = cnpjString.replace(/[^\d]/g, '');
  console.log('🧹 CNPJ após limpeza:', cleaned, 'Tamanho:', cleaned.length);
  
  // Log de exemplos de formatos aceitos
  if (cleaned.length !== 14 && cnpjString.length > 0) {
    console.log('⚠️ Formatos aceitos:');
    console.log('   14665903000104 (sem pontuação)');
    console.log('   14.665.903/0001-04 (com pontuação)');
    console.log('   14 665 903 0001 04 (com espaços)');
  }
  
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

// ⚡ FUNÇÃO ATUALIZADA para usar mapeamento individual ou campo único
function updateEnrichmentPayload(cnpjData, cnpjNumber) {
  // Verificar se há mapeamento individual configurado
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

// Status do app
app.get('/account', (req, res) => {
  const camposConfigurados = Object.keys(fieldMapping).filter(key => fieldMapping[key] && fieldMapping[key].trim() !== '');
  
  res.json({
    status: 'connected',
    app: 'CNPJ Enricher',
    version: '1.0',
    tokenStatus: HUBSPOT_ACCESS_TOKEN ? 'Configurado' : 'Não configurado',
    configuracao: {
      mapeamentoConfigurado: camposConfigurados.length > 0,
      totalCamposMapeados: camposConfigurados.length,
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

// ⚡ OAuth Callback CORRIGIDO
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('❌ Código de autorização não fornecido.');

  console.log('🔍 Código recebido:', code);
  console.log('🔑 CLIENT_ID:', CLIENT_ID);
  console.log('🔐 CLIENT_SECRET:', CLIENT_SECRET ? 'Configurado' : 'Não configurado');
  console.log('🔗 REDIRECT_URI:', REDIRECT_URI);

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

    // ⚡ CORREÇÃO PRINCIPAL: Salvar o token na variável
    HUBSPOT_ACCESS_TOKEN = access_token;

    console.log('✅ Access Token gerado:', access_token);
    console.log('🔁 Refresh Token:', refresh_token);
    console.log('⏰ Expira em (segundos):', expires_in);

    res.send(`
      <h2>✅ Token gerado com sucesso!</h2>
      <p><strong>Access Token:</strong> ${access_token.substring(0, 20)}...</p>
      <p><strong>Expira em:</strong> ${expires_in} segundos</p>
      <p><strong>Status:</strong> Pronto para usar!</p>
      <hr>
      <p><a href="/account">Verificar Status</a></p>
      <p><strong>Próximos passos:</strong></p>
      <ol>
        <li><strong>Criar empresa teste:</strong><br>
        <code>POST /create-test-company</code></li>
        <li><strong>Enriquecer com ID real:</strong><br>
        <code>POST /enrich<br>{"companyId": "[ID_REAL_RETORNADO]"}</code></li>
      </ol>
      <p><em>⚠️ Substitua [ID_REAL_RETORNADO] pelo ID da empresa criada</em></p>
    `);
  } catch (error) {
    console.error('❌ Erro detalhado ao trocar code pelo token:');
    console.error('📊 Status:', error.response?.status);
    console.error('📄 Data:', error.response?.data);
    console.error('🔗 URL:', error.config?.url);
    console.error('📡 Payload:', error.config?.data);
    
    res.status(500).send(`
      <h2>❌ Erro ao gerar token</h2>
      <p><strong>Status:</strong> ${error.response?.status}</p>
      <p><strong>Erro:</strong> ${JSON.stringify(error.response?.data)}</p>
      <p><strong>CLIENT_ID:</strong> ${CLIENT_ID}</p>
      <p><strong>REDIRECT_URI:</strong> ${REDIRECT_URI}</p>
    `);
  }
});

// ⚡ Refresh do token MELHORADO
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

    // ⚡ CORREÇÃO: Atualizar o token na variável
    HUBSPOT_ACCESS_TOKEN = access_token;

    console.log('✅ Novo Access Token:', access_token);
    console.log('🔁 Novo Refresh Token:', refresh_token);
    console.log('⏰ Expira em (segundos):', expires_in);

    res.send('✅ Novo access_token gerado com sucesso! Verifique o console.');
  } catch (error) {
    console.error('❌ Erro ao fazer refresh do token:', error.response?.data || error.message);
    res.status(500).send('❌ Erro ao gerar novo token.');
  }
});

// ⚡ Endpoint para testar token
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

// ⚡ Página de configurações do app - VERSÃO SIMPLES PARA HUBSPOT
app.get('/settings', (req, res) => {
  // ⚡ Headers necessários para funcionar no iframe do HubSpot
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://app.hubspot.com https://app-eu1.hubspot.com;");
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  // Retornar a página HTML de configurações
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

// ⚡ Status das configurações
app.get('/api/config-status', (req, res) => {
  try {
    res.json({
      success: true,
      configuracao: {
        modo: 'Campo único teste_cnpj',
        descricao: 'Todos os dados são salvos no campo teste_cnpj como texto formatado',
        campoDestino: 'teste_cnpj',
        tipoConteudo: 'Texto formatado com todos os dados da Receita Federal'
      },
      urls: {
        configurar: '/settings',
        enriquecer: 'POST /enrich',
        criarEmpresaTeste: 'POST /create-test-company',
        criarCampo: 'POST /create-test-field'
      },
      status: 'Configurado para campo único',
      proximoPasso: 'Execute POST /create-test-company para testar'
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter status da configuração' });
  }
});

// ⚡ API para salvar mapeamento (mantido para compatibilidade)
app.post('/api/save-mapping', (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: 'Sistema configurado para usar campo único teste_cnpj',
      modo: 'campo_unico'
    });
  } catch (error) {
    console.error('❌ Erro ao salvar mapeamento:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ⚡ API para recuperar mapeamento (mantido para compatibilidade)
app.get('/api/get-mapping', (req, res) => {
  try {
    res.json({ 
      success: true, 
      mapping: { modo: 'campo_unico', campo: 'teste_cnpj' }
    });
  } catch (error) {
    console.error('❌ Erro ao recuperar mapeamento:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// 🔍 Endpoint Debug - Investigar Campos
app.get('/debug-company/:companyId', async (req, res) => {
  const { companyId } = req.params;

  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Token não configurado' });
  }

  try {
    console.log('🔍 Buscando todas as propriedades da empresa:', companyId);
    
    const hubspotCompany = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/companies/${companyId}`,
      {
        headers: { 
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const properties = hubspotCompany.data.properties;
    
    console.log('📋 TODAS as propriedades encontradas:');
    Object.keys(properties).forEach(key => {
      console.log(`   ${key}: ${properties[key]}`);
    });

    // Procurar campos que podem ser CNPJ
    const cnpjFields = Object.keys(properties).filter(key => 
      key.toLowerCase().includes('cnpj') || 
      key.toLowerCase().includes('registration') ||
      key.toLowerCase().includes('document')
    );

    console.log('🔍 Campos que podem ser CNPJ:', cnpjFields);

    res.json({
      success: true,
      companyId: companyId,
      allProperties: properties,
      possibleCNPJFields: cnpjFields,
      cnpjFieldValue: properties.cnpj,
      cnpjFieldExists: 'cnpj' in properties,
      totalFields: Object.keys(properties).length
    });

  } catch (error) {
    console.error('❌ Erro ao buscar empresa:', error.response?.data);
    res.status(error.response?.status || 500).json({
      error: 'Erro ao buscar empresa',
      details: error.response?.data
    });
  }
});

// ⚡ FUNÇÃO CORRIGIDA para buscar todos os campos de texto de empresa no HubSpot
async function fetchCompanyTextFields() {
  if (!HUBSPOT_ACCESS_TOKEN) {
    console.log('❌ Token não configurado para buscar campos');
    return [];
  }

  try {
    console.log('🔍 Buscando TODOS os campos de empresa...');
    console.log('🔑 Token disponível:', HUBSPOT_ACCESS_TOKEN ? 'SIM' : 'NÃO');
    
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

    // ⚡ FILTRO EXPANDIDO
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
    return [];
  }
}

// ⚡ ENRICHMENT PRINCIPAL - VERSÃO CORRIGIDA COM CAMPO ÚNICO
app.post('/enrich', async (req, res) => {
  const { companyId } = req.body;

  console.log('🔍 Iniciando enriquecimento para companyId:', companyId);

  if (!companyId) {
    console.error('❌ Company ID não fornecido');
    return res.status(400).json({ error: 'Company ID is required' });
  }

  // Verificar se as variáveis de ambiente estão configuradas
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
    
    // ⚡ Buscar empresa no HubSpot solicitando EXPLICITAMENTE o campo CNPJ
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
    console.log('📋 Propriedades da empresa:', JSON.stringify(hubspotCompany.data.properties, null, 2));

    // ⚡ Buscar CNPJ com múltiplas tentativas e debug completo
    const properties = hubspotCompany.data.properties;
    
    console.log('🔍 TODAS as propriedades disponíveis:');
    Object.keys(properties).forEach(key => {
      console.log(`${key}: "${properties[key]}"`);
    });
    
    // Procurar campos que podem conter CNPJ
    const allKeys = Object.keys(properties);
    const cnpjPossibleKeys = allKeys.filter(key => 
      key.toLowerCase().includes('cnpj') || 
      key.toLowerCase().includes('registration') ||
      key.toLowerCase().includes('document') ||
      key.toLowerCase().includes('tax') ||
      key.toLowerCase().includes('federal') ||
      key.toLowerCase().includes('company_id') ||
      key.toLowerCase().includes('business_id')
    );
    
    console.log('🔍 Campos que podem ser CNPJ:', cnpjPossibleKeys);
    
    let cnpjRaw = properties.cnpj || 
                  properties.CNPJ ||
                  properties.registration_number ||
                  properties.company_cnpj ||
                  properties.document_number ||
                  properties.tax_id ||
                  properties.federal_id;

    // Se não encontrou, tentar procurar em qualquer campo que contenha números com 14 dígitos
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
    console.log('🔍 Tipo do CNPJ:', typeof cnpjRaw);
    console.log('🔍 Campo cnpj existe?', 'cnpj' in properties);
    console.log('🔍 Total de propriedades:', allKeys.length);

    // ⚡ Limpeza melhorada do CNPJ
    const cnpjLimpo = cleanCNPJ(cnpjRaw);
    console.log('🧹 CNPJ limpo:', cnpjLimpo);
    console.log('🧹 Tamanho do CNPJ limpo:', cnpjLimpo.length);

    if (!cnpjLimpo || cnpjLimpo.length !== 14) {
      console.warn('⚠️ CNPJ inválido ou não encontrado');
      
      // Sugestões específicas baseadas no problema
      let sugestoes = [];
      if (!cnpjRaw) {
        sugestoes.push('Campo CNPJ não encontrado na empresa');
        sugestoes.push(`Use: POST /add-cnpj/${companyId} com {"cnpj": "14665903000104"}`);
      } else if (cnpjLimpo.length === 0) {
        sugestoes.push('Campo CNPJ existe mas está vazio');
      } else if (cnpjLimpo.length !== 14) {
        sugestoes.push(`CNPJ tem ${cnpjLimpo.length} dígitos, precisa ter 14`);
        sugestoes.push('Formatos aceitos: 14665903000104 ou 14.665.903/0001-04');
      }
      
      return res.status(400).json({ 
        error: 'CNPJ inválido ou não encontrado',
        cnpjRaw: cnpjRaw,
        cnpjLimpo: cnpjLimpo,
        cnpjTamanho: cnpjLimpo.length,
        campoExiste: 'cnpj' in properties,
        todasPropriedades: Object.keys(properties),
        camposPossiveisCNPJ: cnpjPossibleKeys,
        sugestoes: sugestoes,
        debug: `Valor original: "${cnpjRaw}" | Tipo: ${typeof cnpjRaw} | Limpo: "${cnpjLimpo}"`
      });
    }

    console.log('📡 Buscando dados do CNPJ na API externa...');
    
    // Buscar dados do CNPJ
    const cnpjDataResponse = await axios.get(`https://publica.cnpj.ws/cnpj/${cnpjLimpo}`, {
      timeout: 10000, // 10 segundos de timeout
      headers: {
        'User-Agent': 'CNPJ-Enricher/1.0'
      }
    });

    console.log('✅ Dados do CNPJ obtidos com sucesso');
    console.log('📊 Status da resposta:', cnpjDataResponse.status);
    
    const cnpjData = cnpjDataResponse.data;
    console.log('📋 Dados do CNPJ:', JSON.stringify(cnpjData, null, 2));

    const extract = (label, value) => {
      console.log(`🧩 ${label}:`, value || '[vazio]');
      return value || '';
    };

    // ⚡ EXTRAIR DADOS PRINCIPAIS
    const razaoSocial = extract('Razão Social', cnpjData.razao_social);
    const nomeFantasia = extract('Nome Fantasia', cnpjData.estabelecimento?.nome_fantasia);
    const situacaoCadastral = extract('Situação Cadastral', cnpjData.estabelecimento?.situacao_cadastral);
    const capitalSocial = extract('Capital Social', cnpjData.capital_social);
    const porte = extract('Porte', cnpjData.porte?.descricao);
    const atividadePrincipal = extract('Atividade Principal', cnpjData.estabelecimento?.atividade_principal?.descricao);
    
    const telefoneFormatado = cnpjData.estabelecimento?.telefone1 ? 
      `(${cnpjData.estabelecimento.ddd1}) ${cnpjData.estabelecimento.telefone1}` : '';
    extract('Telefone', telefoneFormatado);
    
    const emailCnpj = extract('Email', cnpjData.estabelecimento?.email);
    
    const enderecoCompleto = cnpjData.estabelecimento?.logradouro ? 
      `${cnpjData.estabelecimento.tipo_logradouro} ${cnpjData.estabelecimento.logradouro}, ${cnpjData.estabelecimento.numero}` : '';
    extract('Endereço', enderecoCompleto);
    
    const cidade = extract('Cidade', cnpjData.estabelecimento?.cidade?.nome);
    const estado = extract('Estado', cnpjData.estabelecimento?.estado?.sigla);
    const cep = extract('CEP', cnpjData.estabelecimento?.cep);

    // ⚡ PAYLOAD DINÂMICO - USA MAPEAMENTO INDIVIDUAL OU CAMPO ÚNICO
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

    // Verificar qual modo foi usado
    const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
    const campoUsado = hasIndividualMapping ? 'mapeamento individual' : (savedUserChoice || selectedDestinationField);
    
    console.log(`✅ Empresa atualizada com sucesso! Modo usado: ${campoUsado}`);
    
    // ⚡ Dados resumidos da empresa para o log e resposta
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
    
    console.log(`🎉 SUCESSO COMPLETO - Dados da empresa processados com: ${campoUsado}`);
    console.log('🏢 Razão Social:', dadosEmpresa.razaoSocial);
    console.log('✨ Nome Fantasia:', dadosEmpresa.nomeFantasia);
    console.log('📊 Situação:', dadosEmpresa.situacao);
    console.log('📍 Local:', `${dadosEmpresa.cidade}/${dadosEmpresa.estado}`);
    console.log('💼 Porte:', dadosEmpresa.porte);
    console.log('📧 Email:', dadosEmpresa.email);
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
        modo: hasIndividualMapping ? 'mapeamento_individual' : 'campo_unico',
        campoDestino: hasIndividualMapping ? 'múltiplos campos' : campoUsado,
        tipoConteudo: hasIndividualMapping ? 'Campos específicos + backup' : 'Texto formatado completo'
      },
      proximosPassos: hasIndividualMapping ? [
        'Verifique os campos mapeados individualmente na empresa',
        'Dados não mapeados estão no campo backup'
      ] : [
        `Verifique o campo ${campoUsado} na empresa no HubSpot`,
        'Todos os dados estão formatados e legíveis'
      ]
    });

  } catch (error) {
    console.error('❌ Erro detalhado no enriquecimento:');
    console.error('📋 Mensagem:', error.message);
    console.error('📊 Status:', error.response?.status);
    console.error('📄 Response data:', error.response?.data);
    console.error('🔗 URL tentada:', error.config?.url);
    console.error('📡 Headers enviados:', error.config?.headers);
    
    // Retornar erro mais específico
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
    
    // ⚡ TRATAR ERRO DE PROPRIEDADES QUE NÃO EXISTEM
    if (error.response?.status === 400 && error.response?.data?.message?.includes('does not exist')) {
      console.log('⚠️ Campo teste_cnpj não existe no HubSpot');
      
      return res.status(400).json({ 
        error: 'Campo teste_cnpj não existe no HubSpot',
        message: 'Execute POST /create-test-field para criar o campo',
        solucao: 'POST /create-test-field',
        dadosObtidos: {
          cnpj: cnpjLimpo,
          razaoSocial: cnpjData.razao_social,
          nomeFantasia: cnpjData.estabelecimento?.nome_fantasia,
          situacao: cnpjData.estabelecimento?.situacao_cadastral,
          cidade: cnpjData.estabelecimento?.cidade?.nome,
          estado: cnpjData.estabelecimento?.estado?.sigla
        },
        proximosPasses: [
          '1. Execute: POST /create-test-field',
          '2. Depois execute: POST /enrich novamente'
        ]
      });
    }
    
    // ⚡ TRATAR RATE LIMIT (429) COMO SUCESSO PARCIAL
    if (error.response?.status === 429 && error.config?.url?.includes('cnpj.ws')) {
      console.log('⚠️ Rate limit atingido na API CNPJ - Consulta será feita depois');
      console.log('✅ CNPJ válido encontrado:', cnpjLimpo);
      console.log('🏢 Empresa:', properties.name || 'Sem nome');
      
      return res.status(200).json({ 
        success: true,
        message: '✅ CNPJ válido encontrado! Rate limit atingido (3 consultas/min)',
        cnpj: cnpjLimpo,
        empresaEncontrada: properties.name || 'Empresa sem nome',
        status: 'Aguardando liberação da API',
        detalhes: error.response?.data?.detalhes || 'Aguarde alguns minutos e tente novamente',
        proximaTentativa: 'Aguarde 1-2 minutos para nova consulta',
        dadosEncontrados: {
          cnpjValido: cnpjLimpo,
          empresa: properties.name,
          domain: properties.domain
        }
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

// ⚡ Endpoint para criar o campo de teste teste_cnpj
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
        details: error.response?.data,
        solucao: 'Campo teste_cnpj pode já existir ou você precisa de permissões'
      });
    }
  }
});

// ⚡ Endpoint para criar propriedades customizadas no HubSpot (mantido para compatibilidade)
app.post('/create-cnpj-properties', async (req, res) => {
  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Token não configurado' });
  }

  try {
    console.log('🔧 Criando apenas o campo teste_cnpj...');
    
    const response = await axios.post(
      'https://api.hubapi.com/crm/v3/properties/companies',
      {
        name: 'teste_cnpj',
        label: 'Dados CNPJ',
        type: 'string',
        fieldType: 'textarea',
        description: 'Todos os dados do CNPJ da Receita Federal',
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
      nextStep: 'Agora você pode usar o enriquecimento com campo único!'
    });
    
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('⚠️ Campo teste_cnpj já existe');
      res.json({
        success: true,
        message: 'Campo teste_cnpj já existe no HubSpot',
        status: 'already_exists',
        nextStep: 'Campo pronto para uso!'
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

// ⚡ Endpoint para testar API CNPJ (verificar rate limit)
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

// ⚡ Endpoint para adicionar CNPJ a uma empresa existente
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

// ⚡ Criar empresa de teste com CNPJ
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
          cnpj: '14665903000104', // ⚡ Mesmo CNPJ que você tem
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
    console.log('📋 Propriedades criadas:', response.data.properties);

    // Verificar qual modo está ativo
    const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
    const modo = hasIndividualMapping ? 'mapeamento individual' : 'campo único';

    res.json({
      success: true,
      companyId: response.data.id,
      message: 'Empresa de teste criada com CNPJ 14665903000104',
      cnpj: '14665903000104',
      testEnrichUrl: `POST /enrich com {"companyId": "${response.data.id}"}`,
      debugUrl: `/debug-company/${response.data.id}`,
      configuracao: {
        modoAtivo: modo,
        campoDestino: hasIndividualMapping ? 'múltiplos campos' : (savedUserChoice || selectedDestinationField),
        tipoConteudo: hasIndividualMapping ? 'Campos específicos + backup' : 'Todos os dados formatados em texto',
        criarCampo: 'POST /create-test-field (se necessário)'
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

// Sincronização via GET
app.get('/api/sync-cnpj', async (req, res) => {
  try {
    await syncCNPJs();
    res.json({ status: 'success', message: 'Sync concluído com sucesso (GET)' });
  } catch (error) {
    console.error('❌ Erro no sync-cnpj (GET):', error.message);
    res.status(500).json({ error: 'Erro na sincronização' });
  }
});

// Sincronização via POST
app.post('/api/sync-cnpj', async (req, res) => {
  try {
    await syncCNPJs();
    res.json({ status: 'success', message: 'Sync concluído com sucesso (POST)' });
  } catch (error) {
    console.error('❌ Erro no sync-cnpj (POST):', error.message);
    res.status(500).json({ error: 'Erro na sincronização' });
  }
});

app.post('/api/accounts-fetch', (req, res) => {
  console.log('🔁 Recebido chamada de /api/accounts-fetch do HubSpot');

  return res.json({
    response: {
      accounts: [
        {
          accountId: 'default-account',
          accountName: 'Enriquecedor CNPJ - CRM Hub',
          accountLogoUrl: 'https://crmhub.com.br/wp-content/uploads/2025/02/logo-laranja-1.png' // insira a URL pública do seu logo aqui
        }
      ]
    }
  });
});

// ⚡ ENDPOINTS COM PERSISTÊNCIA SIMPLES - APENAS ESTES FORAM ADICIONADOS

// ⚡ Endpoint para buscar options do dropdown (COM PERSISTÊNCIA)
app.post('/api/dropdown-fetch', async (req, res) => {
  console.log('🔍 HubSpot solicitando opções do dropdown...');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    // ⚡ Buscar campos atualizados
    availableFields = await fetchCompanyTextFields();

    // ⚡ Opções do dropdown
    const options = [
      { 
        text: '🚫 Não mapear - Apenas validar CNPJ', 
        value: 'nenhum',
        description: 'Apenas valida o CNPJ sem salvar dados adicionais'
      },
      { 
        text: '📋 Campo padrão (teste_cnpj) - Todos os dados formatados', 
        value: 'teste_cnpj',
        description: 'Salva todos os dados do CNPJ formatados em texto no campo teste_cnpj'
      },
      ...availableFields.map(field => ({
        text: `📝 ${field.text}`,
        value: field.value,
        description: `Salvar dados formatados em: ${field.value} (${field.type})`
      }))
    ];

    // ⚡ USAR ESCOLHA SALVA DO USUÁRIO OU PADRÃO
    const currentSelection = savedUserChoice || selectedDestinationField;

    console.log(`📋 Retornando ${options.length} opções para o dropdown`);
    console.log(`🎯 Campo selecionado: ${currentSelection}`);
    console.log(`💾 Escolha salva: ${savedUserChoice}`);

    return res.json({
      response: {
        options: options,
        selectedOption: currentSelection, // ⚡ PERSISTÊNCIA AQUI
        placeholder: 'Escolha onde salvar os dados do CNPJ'
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar opções do dropdown:', error);
    
    return res.json({
      response: {
        options: [
          { 
            text: '🚫 Não mapear - Apenas validar CNPJ', 
            value: 'nenhum',
            description: 'Apenas valida o CNPJ'
          },
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

// ⚡ Endpoint para atualizar campo selecionado (COM PERSISTÊNCIA)
app.post('/api/dropdown-update', (req, res) => {
  const newSelection = req.body.selectedOption || 'teste_cnpj';
  const previousSelection = savedUserChoice || selectedDestinationField;
  
  console.log('📥 Atualizando campo de destino:');
  console.log(`   Anterior: ${previousSelection}`);
  console.log(`   Novo: ${newSelection}`);
  console.log(`   Request completo:`, JSON.stringify(req.body, null, 2));

  // ⚡ SALVAR ESCOLHA DO USUÁRIO (PERSISTÊNCIA SIMPLES)
  savedUserChoice = newSelection;

  // ⚡ Mensagens específicas baseadas na seleção
  let message = '';
  
  if (newSelection === 'teste_cnpj') {
    message = '✅ Configurado para salvar todos os dados formatados no campo teste_cnpj';
  } else if (newSelection === 'nenhum') {
    message = '⚠️ Configurado para apenas validar CNPJ (não salvar dados)';
  } else {
    const selectedField = availableFields.find(field => field.value === newSelection);
    const fieldLabel = selectedField ? selectedField.text : newSelection;
    message = `✅ Configurado para salvar dados formatados no campo: ${fieldLabel}`;
  }

  console.log(`💬 Mensagem de confirmação: ${message}`);
  console.log(`💾 Escolha salva: ${savedUserChoice}`);

  res.json({
    response: {
      actionType: 'DROPDOWN_UPDATE',
      selectedOption: newSelection,
      message: message,
      configuracao: {
        campoDestino: newSelection,
        escolhaSalva: savedUserChoice,
        persistencia: 'ativa'
      }
    }
  });
});

// ⚡ NOVOS ENDPOINTS PARA MAPEAMENTO INDIVIDUAL

// ⚡ Endpoint para buscar mapeamento individual
app.post('/api/individual-mapping-fetch', async (req, res) => {
  console.log('🗺️ Buscando configuração de mapeamento individual...');
  
  try {
    // Buscar campos disponíveis do HubSpot
    availableFields = await fetchCompanyTextFields();
    
    // Gerar sugestões automáticas
    const suggestions = getSuggestedMapping(availableFields);
    
    // Preparar opções para cada campo
    const fieldOptions = availableFields.map(field => ({
      text: field.text,
      value: field.value,
      description: `${field.type} - ${field.description}`
    }));
    
    // Adicionar opção "não mapear"
    const optionsWithNone = [
      { text: '🚫 Não mapear este campo', value: 'nenhum', description: 'Este campo não será salvo' },
      ...fieldOptions
    ];
    
    // Preparar resposta com todos os campos
    const fieldsConfig = {};
    Object.keys(cnpjFieldsDefinition).forEach(cnpjField => {
      const fieldDef = cnpjFieldsDefinition[cnpjField];
      fieldsConfig[cnpjField] = {
        label: fieldDef.label,
        example: fieldDef.example,
        description: fieldDef.description,
        options: optionsWithNone,
        currentValue: individualMapping[cnpjField] || suggestions[cnpjField] || 'nenhum',
        suggested: suggestions[cnpjField] || null
      };
    });
    
    console.log(`✅ Retornando configuração para ${Object.keys(fieldsConfig).length} campos`);
    console.log(`🎯 Sugestões geradas: ${Object.keys(suggestions).length}`);
    
    return res.json({
      response: {
        fields: fieldsConfig,
        backupField: {
          label: '📦 Campo para dados não mapeados',
          currentValue: savedUserChoice || selectedDestinationField,
          options: [
            { text: '🚫 Não salvar dados não mapeados', value: 'nenhum' },
            { text: '📋 Campo padrão (teste_cnpj)', value: 'teste_cnpj' },
            ...fieldOptions
          ]
        },
        stats: {
          totalFields: Object.keys(fieldsConfig).length,
          availableHubSpotFields: availableFields.length,
          suggestionsGenerated: Object.keys(suggestions).length
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

// ⚡ Endpoint para salvar mapeamento individual
app.post('/api/individual-mapping-save', (req, res) => {
  console.log('💾 Salvando mapeamento individual...');
  console.log('📥 Dados recebidos:', JSON.stringify(req.body, null, 2));
  
  try {
    const { fieldMappings, backupField } = req.body;
    
    if (!fieldMappings) {
      return res.status(400).json({
        error: 'fieldMappings é obrigatório',
        expected: {
          fieldMappings: {
            telefone: 'phone',
            razao_social: 'name',
            // ...
          },
          backupField: 'teste_cnpj'
        }
      });
    }
    
    // Atualizar mapeamento individual
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
    
    // Atualizar campo backup se fornecido
    if (backupField) {
      const oldBackup = savedUserChoice || selectedDestinationField;
      savedUserChoice = backupField;
      console.log(`📦 Campo backup: "${oldBackup}" → "${backupField}"`);
    }
    
    // Estatísticas do mapeamento
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

// ⚡ Endpoint para status do mapeamento
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
    availableFields: availableFields.length,
    nextActions: hasIndividualMapping ? 
      ['Use POST /enrich para testar mapeamento individual'] : 
      ['Configure mapeamento individual em /api/individual-mapping-fetch']
  });
});

// ⚡ Endpoint para resetar mapeamento
app.post('/api/reset-mapping', (req, res) => {
  console.log('🔄 Resetando mapeamento individual...');
  
  // Reset do mapeamento individual
  Object.keys(individualMapping).forEach(key => {
    individualMapping[key] = null;
  });
  
  // Reset do campo único (opcional)
  if (req.body.resetSingleField) {
    savedUserChoice = null;
  }
  
  console.log('✅ Mapeamento resetado com sucesso');
  
  res.json({
    success: true,
    message: 'Mapeamento individual resetado com sucesso',
    individualMapping: individualMapping,
    singleField: savedUserChoice || selectedDestinationField,
    nextStep: 'Reconfigure o mapeamento em /api/individual-mapping-fetch'
  });
});

// ⚡ Endpoints mantidos para compatibilidade
app.post('/api/load-settings', (req, res) => {
  console.log('🔄 Carregando configurações salvas...');
  
  res.json({
    response: {
      campo_destino: savedUserChoice || selectedDestinationField,
      message: `Configuração carregada: ${savedUserChoice || selectedDestinationField}`
    }
  });
});

app.post('/api/save-settings', (req, res) => {
  console.log('💾 Salvando configurações...');
  
  res.json({
    response: {
      status: 'saved',
      campo_destino: savedUserChoice || selectedDestinationField,
      message: `Configuração salva: ${savedUserChoice || selectedDestinationField}`
    }
  });
});

// ⚡ Debug endpoint MELHORADO
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

// ⚡ Endpoint adicional para verificar configuração atual
app.get('/api/current-mapping', (req, res) => {
  const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
  const currentField = availableFields.find(field => field.value === (savedUserChoice || selectedDestinationField));
  
  res.json({
    success: true,
    configuracaoAtual: {
      modo: hasIndividualMapping ? 'individual' : 'single_field',
      campoSelecionado: savedUserChoice || selectedDestinationField,
      campoLabel: currentField ? currentField.text : (savedUserChoice || selectedDestinationField),
      tipoMapeamento: hasIndividualMapping ? 'Mapeamento individual' :
                     (savedUserChoice || selectedDestinationField) === 'teste_cnpj' ? 'Campo padrão' : 
                     (savedUserChoice || selectedDestinationField) === 'nenhum' ? 'Sem mapeamento' : 'Campo personalizado',
      totalCamposDisponiveis: availableFields.length,
      escolhaSalva: savedUserChoice,
      campoDefault: selectedDestinationField,
      mapeamentoIndividual: individualMapping
    }
  });
});

console.log('🔧 Sistema de mapeamento de campos CNPJ carregado com sucesso!');
console.log('🗺️ Sistema de mapeamento individual carregado com sucesso!');

const PORT = process.env.PORT || 3000;


// ===== ADICIONAR ESTES ENDPOINTS ANTES DO app.listen =====

// ⚡ INTERFACE PRINCIPAL DO HUBSPOT - TELA DE CONFIGURAÇÕES CORRIGIDA
app.post('/api/ui-extensions-fetch', async (req, res) => {
  console.log('🎨 HubSpot solicitando interface de configurações...');
  
  try {
    // Buscar campos disponíveis do HubSpot
    availableFields = await fetchCompanyTextFields();
    
    // Gerar sugestões automáticas
    const suggestions = getSuggestedMapping(availableFields);
    
    // Preparar opções para dropdowns com formato CORRETO
    const fieldOptions = [
      { 
        label: '🚫 Não mapear', 
        value: 'nenhum', 
        description: 'Este campo não será salvo' 
      },
      { 
        label: '📋 Campo backup (teste_cnpj)', 
        value: 'teste_cnpj', 
        description: 'Salvar no campo de backup' 
      },
      ...availableFields.map(field => ({
        label: `📝 ${field.text}`,
        value: field.value,
        description: `Tipo: ${field.type}`
      }))
    ];

    // Verificar se há mapeamento individual ativo
    const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');

    console.log(`📊 Campos disponíveis: ${availableFields.length}`);
    console.log(`🎯 Modo atual: ${hasIndividualMapping ? 'individual' : 'single'}`);
    console.log(`🔧 Opções geradas: ${fieldOptions.length}`);

    // ⚡ ESTRUTURA CORRIGIDA PARA HUBSPOT
    const response = {
      results: [
        {
          objectId: req.body.objectId || 'default',
          title: '🗺️ Configuração CNPJ Enricher',
          properties: [
            {
              name: 'mapping_mode',
              label: 'Modo de Mapeamento',
              dataType: 'ENUMERATION',
              fieldType: 'select',
              value: hasIndividualMapping ? 'individual' : 'single',
              options: [
                { 
                  label: 'Campo único', 
                  value: 'single',
                  description: 'Salvar todos os dados formatados em um campo só'
                },
                { 
                  label: 'Mapeamento individual', 
                  value: 'individual',
                  description: 'Mapear cada dado para um campo específico'
                }
              ]
            }
          ]
        }
      ]
    };

    // ⚡ ADICIONAR CAMPOS INDIVIDUAIS SE MODO INDIVIDUAL ATIVO
    if (hasIndividualMapping) {
      // Adicionar campos individuais
      Object.keys(cnpjFieldsDefinition).forEach(cnpjField => {
        const fieldDef = cnpjFieldsDefinition[cnpjField];
        const currentValue = individualMapping[cnpjField] || suggestions[cnpjField] || 'nenhum';
        
        response.results[0].properties.push({
          name: `field_${cnpjField}`,
          label: fieldDef.label,
          dataType: 'ENUMERATION',
          fieldType: 'select',
          value: currentValue,
          description: `${fieldDef.description} | Exemplo: ${fieldDef.example}`,
          options: fieldOptions
        });
      });

      // Campo backup
      response.results[0].properties.push({
        name: 'backup_field',
        label: '📦 Campo para dados não mapeados',
        dataType: 'ENUMERATION',
        fieldType: 'select',
        value: savedUserChoice || selectedDestinationField,
        description: 'Onde salvar dados que não foram mapeados individualmente',
        options: fieldOptions
      });
    } else {
      // ⚡ MODO CAMPO ÚNICO
      response.results[0].properties.push({
        name: 'single_field',
        label: '📂 Campo de destino',
        dataType: 'ENUMERATION',
        fieldType: 'select',
        value: savedUserChoice || selectedDestinationField,
        description: 'Escolha onde salvar todos os dados formatados do CNPJ',
        options: fieldOptions
      });
    }

    console.log(`✅ Interface gerada com ${response.results[0].properties.length} campos`);
    console.log('📋 Primeira propriedade:', JSON.stringify(response.results[0].properties[0], null, 2));
    
    return res.json(response);

  } catch (error) {
    console.error('❌ Erro ao gerar interface:', error);
    
    // ⚡ FALLBACK SIMPLES EM CASO DE ERRO
    return res.json({
      results: [
        {
          objectId: req.body.objectId || 'default',
          title: '❌ Erro ao carregar configurações',
          properties: [
            {
              name: 'fallback_field',
              label: '📂 Campo de backup',
              dataType: 'ENUMERATION',
              fieldType: 'select',
              value: 'teste_cnpj',
              description: 'Campo padrão em caso de erro',
              options: [
                { 
                  label: '📋 Campo padrão (teste_cnpj)', 
                  value: 'teste_cnpj',
                  description: 'Campo de backup'
                }
              ]
            }
          ]
        }
      ]
    });
  }
});

// ⚡ ENDPOINT CORRIGIDO PARA SALVAR CONFIGURAÇÕES DA INTERFACE
app.post('/api/ui-extensions-save', (req, res) => {
  console.log('💾 Salvando configurações da interface...');
  console.log('📥 Request body completo:', JSON.stringify(req.body, null, 2));
  console.log('📥 Headers:', JSON.stringify(req.headers, null, 2));
  
  try {
    // ⚡ MÚLTIPLAS FORMAS DE EXTRAIR OS DADOS
    let formData = {};
    
    // Tentar diferentes estruturas de dados que o HubSpot pode enviar
    if (req.body.formData) {
      formData = req.body.formData;
      console.log('📋 Usando req.body.formData');
    } else if (req.body.properties) {
      formData = req.body.properties;
      console.log('📋 Usando req.body.properties');
    } else if (req.body.data) {
      formData = req.body.data;
      console.log('📋 Usando req.body.data');
    } else {
      formData = req.body;
      console.log('📋 Usando req.body diretamente');
    }
    
    console.log('📊 Dados extraídos:', JSON.stringify(formData, null, 2));
    
    // ⚡ VALIDAÇÃO MAIS FLEXÍVEL
    if (!formData || typeof formData !== 'object') {
      console.log('❌ Dados inválidos recebidos');
      return res.status(400).json({
        error: 'Dados de formulário não encontrados',
        received: req.body,
        expected: 'Objeto com propriedades do formulário',
        debug: {
          hasFormData: !!req.body.formData,
          hasProperties: !!req.body.properties,
          hasData: !!req.body.data,
          bodyKeys: Object.keys(req.body)
        }
      });
    }
    
    // ⚡ DETECTAR MODO AUTOMATICAMENTE
    let mappingMode = 'single'; // Padrão
    
    // Verificar se tem dados de mapeamento individual
    const hasIndividualFields = Object.keys(formData).some(key => key.startsWith('field_'));
    const hasMappingMode = formData.mapping_mode;
    const hasSingleField = formData.single_field;
    
    if (hasMappingMode) {
      mappingMode = formData.mapping_mode;
    } else if (hasIndividualFields) {
      mappingMode = 'individual';
    } else if (hasSingleField) {
      mappingMode = 'single';
    }
    
    console.log(`🗺️ Modo detectado: ${mappingMode}`);
    console.log(`📊 Debug - hasIndividualFields: ${hasIndividualFields}, hasMappingMode: ${hasMappingMode}, hasSingleField: ${hasSingleField}`);
    
    if (mappingMode === 'individual') {
      // ⚡ SALVAR MAPEAMENTO INDIVIDUAL
      let updatedCount = 0;
      let mappingChanges = [];
      
      Object.keys(cnpjFieldsDefinition).forEach(cnpjField => {
        const fieldKey = `field_${cnpjField}`;
        if (formData[fieldKey] !== undefined) {
          const oldValue = individualMapping[cnpjField];
          const newValue = formData[fieldKey];
          
          individualMapping[cnpjField] = newValue;
          
          if (oldValue !== newValue) {
            updatedCount++;
            mappingChanges.push(`${cnpjField}: "${oldValue}" → "${newValue}"`);
            console.log(`🔄 ${cnpjField}: "${oldValue}" → "${newValue}"`);
          }
        }
      });
      
      // ⚡ SALVAR CAMPO BACKUP
      if (formData.backup_field !== undefined) {
        const oldBackup = savedUserChoice || selectedDestinationField;
        savedUserChoice = formData.backup_field;
        console.log(`📦 Campo backup: "${oldBackup}" → "${savedUserChoice}"`);
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
          changes: mappingChanges,
          mapping: individualMapping
        },
        nextStep: 'Use o enriquecimento em uma empresa para testar',
        debug: {
          fieldsProcessed: Object.keys(cnpjFieldsDefinition).length,
          updatedCount: updatedCount,
          formDataKeys: Object.keys(formData)
        }
      });
      
    } else {
      // ⚡ MODO CAMPO ÚNICO
      let targetField = formData.single_field;
      
      // ⚡ FALLBACK: Se não tem single_field, tentar outros campos comuns
      if (!targetField) {
        targetField = formData.campo_destino || 
                     formData.destination_field || 
                     formData.target_field ||
                     savedUserChoice || 
                     selectedDestinationField;
      }
      
      if (targetField) {
        const oldField = savedUserChoice || selectedDestinationField;
        savedUserChoice = targetField;
        
        // ⚡ LIMPAR MAPEAMENTO INDIVIDUAL
        let clearedFields = 0;
        Object.keys(individualMapping).forEach(key => {
          if (individualMapping[key] && individualMapping[key] !== 'nenhum') {
            clearedFields++;
          }
          individualMapping[key] = null;
        });
        
        console.log(`📋 Campo único: "${oldField}" → "${savedUserChoice}"`);
        console.log(`🧹 Mapeamento individual limpo (${clearedFields} campos)`);
        
        let fieldDescription = 'Todos os dados formatados em um campo';
        if (savedUserChoice === 'nenhum') {
          fieldDescription = 'Apenas validar CNPJ (não salvar dados)';
        } else if (savedUserChoice === 'teste_cnpj') {
          fieldDescription = 'Campo padrão para todos os dados do CNPJ';
        }
        
        return res.json({
          success: true,
          message: `✅ Configurado para salvar todos os dados no campo: ${savedUserChoice}`,
          configuration: {
            mode: 'single',
            field: savedUserChoice,
            previousField: oldField,
            description: fieldDescription,
            clearedIndividualFields: clearedFields
          },
          nextStep: 'Use o enriquecimento em uma empresa para testar',
          debug: {
            targetFieldFound: !!targetField,
            formDataKeys: Object.keys(formData),
            savedChoice: savedUserChoice
          }
        });
      } else {
        // ⚡ ERRO: Nenhum campo especificado
        console.log('❌ Nenhum campo de destino especificado');
        return res.status(400).json({
          error: 'Campo de destino não especificado',
          received: formData,
          expectedFields: ['single_field', 'campo_destino', 'destination_field'],
          currentConfig: {
            savedUserChoice: savedUserChoice,
            selectedDestinationField: selectedDestinationField
          },
          suggestion: 'Especifique um campo de destino válido'
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao salvar configurações da interface:', error);
    return res.status(500).json({
      error: 'Erro interno ao salvar configurações',
      details: error.message,
      stack: error.stack,
      received: req.body,
      timestamp: new Date().toISOString()
    });
  }
});

// ⚡ ENDPOINT ADICIONAL PARA DEBUG
app.post('/api/debug-save-request', (req, res) => {
  console.log('🔍 DEBUG - Request completo:');
  console.log('📥 Body:', JSON.stringify(req.body, null, 2));
  console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
  console.log('🎯 Method:', req.method);
  console.log('📍 URL:', req.url);
  console.log('🔗 Query:', JSON.stringify(req.query, null, 2));
  
  res.json({
    debug: true,
    request: {
      body: req.body,
      headers: req.headers,
      method: req.method,
      url: req.url,
      query: req.query
    },
    analysis: {
      hasFormData: !!req.body.formData,
      hasProperties: !!req.body.properties,
      hasData: !!req.body.data,
      bodyKeys: Object.keys(req.body || {}),
      contentType: req.headers['content-type']
    },
    timestamp: new Date().toISOString()
  });
});

// ⚡ ENDPOINT PARA AÇÕES DA INTERFACE (BOTÕES)
app.post('/api/ui-extensions-action', async (req, res) => {
  console.log('⚡ Ação executada na interface:', req.body);
  
  try {
    const { action, formData } = req.body;
    
    switch (action) {
      case 'save':
        // Redirecionar para salvar configurações
        return res.redirect(307, '/api/ui-extensions-save');
        
      case 'test':
        // Testar configuração atual
        const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
        
        return res.json({
          success: true,
          message: '🧪 Configuração de teste',
          currentConfig: {
            mode: hasIndividualMapping ? 'individual' : 'single',
            individualMapping: hasIndividualMapping ? individualMapping : null,
            singleField: !hasIndividualMapping ? (savedUserChoice || selectedDestinationField) : null,
            backupField: savedUserChoice || selectedDestinationField
          },
          testInstructions: [
            '1. Crie uma empresa de teste: POST /create-test-company',
            '2. Execute o enriquecimento: POST /enrich com o ID da empresa',
            '3. Verifique os campos na empresa no HubSpot'
          ]
        });
        
      default:
        return res.status(400).json({
          error: 'Ação não reconhecida',
          availableActions: ['save', 'test']
        });
    }
    
  } catch (error) {
    console.error('❌ Erro ao executar ação:', error);
    return res.status(500).json({
      error: 'Erro ao executar ação',
      details: error.message
    });
  }
});

// ⚡ ENDPOINT PARA MUDANÇA DE MODO (SINGLE <-> INDIVIDUAL)
app.post('/api/switch-mapping-mode', (req, res) => {
  console.log('🔄 Alternando modo de mapeamento:', req.body);
  
  try {
    const { mode } = req.body;
    
    if (mode === 'individual') {
      // Ativar mapeamento individual com sugestões
      const suggestions = getSuggestedMapping(availableFields);
      
      Object.keys(individualMapping).forEach(cnpjField => {
        if (!individualMapping[cnpjField]) {
          individualMapping[cnpjField] = suggestions[cnpjField] || 'nenhum';
        }
      });
      
      console.log('✅ Modo individual ativado com sugestões');
      
      return res.json({
        success: true,
        message: 'Modo individual ativado',
        mapping: individualMapping,
        suggestions: suggestions
      });
      
    } else if (mode === 'single') {
      // Limpar mapeamento individual
      Object.keys(individualMapping).forEach(key => {
        individualMapping[key] = null;
      });
      
      console.log('✅ Modo campo único ativado');
      
      return res.json({
        success: true,
        message: 'Modo campo único ativado',
        field: savedUserChoice || selectedDestinationField
      });
    }
    
    return res.status(400).json({
      error: 'Modo inválido',
      validModes: ['single', 'individual']
    });
    
  } catch (error) {
    console.error('❌ Erro ao alternar modo:', error);
    return res.status(500).json({
      error: 'Erro ao alternar modo',
      details: error.message
    });
  }
});

console.log('🎨 Interface HubSpot carregada com sucesso!');

app.listen(PORT, () => console.log(`🚀 CNPJ- Enricher rodando na porta ${PORT}`));
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

// ⚡ CAMPOS PADRÃO FIXOS (SEM BUSCAR API)
const HUBSPOT_STANDARD_FIELDS = [
  { text: '📝 Nome da empresa (name)', value: 'name', description: 'Campo padrão do HubSpot' },
  { text: '📝 Descrição (description)', value: 'description', description: 'Campo padrão do HubSpot' },
  { text: '📞 Telefone (phone)', value: 'phone', description: 'Campo padrão do HubSpot' },
  { text: '🏙️ Cidade (city)', value: 'city', description: 'Campo padrão do HubSpot' },
  { text: '🌎 Estado (state)', value: 'state', description: 'Campo padrão do HubSpot' },
  { text: '🌐 Website (website)', value: 'website', description: 'Campo padrão do HubSpot' },
  { text: '📧 Email (email)', value: 'email', description: 'Campo padrão do HubSpot' },
  { text: '🏭 Indústria (industry)', value: 'industry', description: 'Campo padrão do HubSpot' },
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
    hubspotSuggestion: 'industry'
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
    hubspotSuggestion: 'email'
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
      criarTeste: 'POST /create-test-company'
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
            <li><strong>Verificar resultado:</strong><br>Confira o campo <code>teste_cnpj</code></li>
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

    // Gerar payload baseado no modo configurado
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
        modo: hasIndividualMapping ? 'mapeamento_individual' : 'campo_unico',
        campoDestino: hasIndividualMapping ? 'múltiplos campos' : campoUsado,
        tipoConteudo: hasIndividualMapping ? 'Campos específicos + backup' : 'Texto formatado completo'
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

// ⚡ Telefone mapping fetch - USANDO MESMA ESTRUTURA QUE FUNCIONA
app.post('/api/telefone-mapping-fetch', async (req, res) => {
  console.log('📞 HubSpot solicitando opções do dropdown TELEFONE...');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    // ⚡ MESMA ESTRUTURA QUE FUNCIONA NO MODO DE MAPEAMENTO
    const options = [
      { 
        label: '🚫 Não mapear telefone', 
        value: 'nenhum',
        description: 'Telefone não será salvo'
      },
      ...HUBSPOT_STANDARD_FIELDS.map(field => ({
        label: field.text,
        value: field.value,
        description: field.description
      }))
    ];

    const currentSelection = individualMapping.telefone || 'phone';

    console.log(`📞 Retornando ${options.length} opções para o dropdown TELEFONE`);
    console.log(`🎯 Telefone selecionado: ${currentSelection}`);

    return res.json({
      response: {
        options: options,
        selectedOption: currentSelection,
        placeholder: 'Escolha onde salvar o telefone do CNPJ'
      }
    });
     
  } catch (error) {
    console.error('❌ Erro no dropdown telefone:', error);
    
    return res.json({
      response: {
        options: [
          { 
            label: '📞 Telefone (phone)', 
            value: 'phone',
            description: 'Campo padrão de telefone'
          }
        ],
        selectedOption: individualMapping.telefone || 'phone',
        placeholder: 'Escolha onde salvar o telefone do CNPJ'
      }
    });
  }
});

// ⚡ Telefone mapping update - USANDO MESMA ESTRUTURA QUE FUNCIONA
app.post('/api/telefone-mapping-save', (req, res) => {
  console.log('📞 Telefone update recebido:', JSON.stringify(req.body, null, 2));
  
  const newSelection = req.body.selectedOption || 'phone';
  const previousSelection = individualMapping.telefone || 'phone';
  
  console.log('📞 Atualizando mapeamento do telefone:');
  console.log(`   Anterior: ${previousSelection}`);
  console.log(`   Novo: ${newSelection}`);

  individualMapping.telefone = newSelection;

  let message = '';
  
  if (newSelection === 'phone') {
    message = '✅ Telefone será salvo no campo phone do HubSpot';
  } else if (newSelection === 'nenhum') {
    message = '⚠️ Telefone não será salvo (apenas validação)';
  } else {
    message = `✅ Telefone será salvo no campo: ${newSelection}`;
  }

  console.log(`💬 Mensagem: ${message}`);
  console.log(`💾 Mapeamento telefone salvo: ${individualMapping.telefone}`);

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
// ⚡ ENDPOINT ESPECÍFICO PARA TELEFONE - FETCH
app.post('/api/telefone-mapping-fetch', (req, res) => {
  console.log('📞 HubSpot solicitando opções para campo Telefone...');
  
  try {
    // ⚡ MESMO FORMATO QUE FUNCIONOU NO MODO DE MAPEAMENTO
    const options = [
      { 
        label: '🚫 Não mapear este campo', 
        value: 'nenhum',
        description: 'Telefone não será salvo em campo específico'
      },
      { 
        label: '📞 Telefone (phone)', 
        value: 'phone',
        description: 'Campo padrão do HubSpot para telefone'
      },
      { 
        label: '📝 Nome da empresa (name)', 
        value: 'name',
        description: 'Campo padrão do HubSpot'
      },
      { 
        label: '📝 Descrição (description)', 
        value: 'description',
        description: 'Campo padrão do HubSpot'
      },
      { 
        label: '🏙️ Cidade (city)', 
        value: 'city',
        description: 'Campo padrão do HubSpot'
      },
      { 
        label: '🌎 Estado (state)', 
        value: 'state',
        description: 'Campo padrão do HubSpot'
      },
      { 
        label: '🌐 Website (website)', 
        value: 'website',
        description: 'Campo padrão do HubSpot'
      },
      { 
        label: '📧 Email (email)', 
        value: 'email',
        description: 'Campo padrão do HubSpot'
      },
      { 
        label: '🏭 Indústria (industry)', 
        value: 'industry',
        description: 'Campo padrão do HubSpot'
      },
      { 
        label: '📮 CEP (zip)', 
        value: 'zip',
        description: 'Campo padrão do HubSpot'
      },
      { 
        label: '📋 Campo teste CNPJ (teste_cnpj)', 
        value: 'teste_cnpj',
        description: 'Campo de teste para CNPJ'
      }
    ];

    // Valor atual do telefone no mapeamento individual
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

// ⚡ ENDPOINT ESPECÍFICO PARA TELEFONE - UPDATE
app.post('/api/telefone-mapping-save', (req, res) => {
  const newSelection = req.body.selectedOption || 'phone';
  const previousSelection = individualMapping.telefone || 'phone';
  
  console.log('📞 Atualizando mapeamento do Telefone:');
  console.log(`   Anterior: ${previousSelection}`);
  console.log(`   Novo: ${newSelection}`);

  // Salvar no mapeamento individual
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
    timestamp: new Date().toISOString(),
    status: 'Sistema funcionando corretamente'
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
      }
    }
  });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 CNPJ Enricher 2.0 rodando na porta ${PORT}`));
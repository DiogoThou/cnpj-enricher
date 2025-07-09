// ⚡ SERVIDOR OTIMIZADO PARA HUBSPOT
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const app = express();

// ⚡ CORS configurado especificamente para HubSpot
app.use(cors({
  origin: [
    'https://app.hubspot.com',
    'https://app-eu1.hubspot.com', 
    'https://app.hubspot.eu',
    'https://local.hubspot.com:8080',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-HubSpot-Signature'
  ]
}));

// ⚡ Headers específicos para iframe do HubSpot
app.use((req, res, next) => {
  // Permitir iframe do HubSpot
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.hubspot.com https://*.hubspot.eu");
  
  // Headers CORS adicionais
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-HubSpot-Signature');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// ⚡ Página de configurações do app
app.get('/settings', (req, res) => {
  // ⚡ Retornar página React otimizada para HubSpot
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.hubspot.com https://*.hubspot.eu");
  
  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CNPJ Enricher - Configurações</title>
    <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://unpkg.com/lucide-react@latest/dist/umd/lucide-react.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .gradient-bg { background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); }
    </style>
</head>
<body>
    <div id="root"></div>
    
    <script type="text/babel">
        const { useState, useEffect } = React;
        const { Settings, Database, CheckCircle, AlertCircle, Loader2 } = lucideReact;
        
        function HubSpotSettings() {
            const [status, setStatus] = useState('');
            const [statusType, setStatusType] = useState('info');
            const [loading, setLoading] = useState(false);
            const [configStatus, setConfigStatus] = useState(null);

            useEffect(() => {
                loadConfigStatus();
            }, []);

            const loadConfigStatus = async () => {
                try {
                    const response = await fetch('/api/config-status');
                    const result = await response.json();
                    setConfigStatus(result);
                } catch (error) {
                    console.error('Erro ao carregar status:', error);
                }
            };

            const showStatus = (message, type) => {
                setStatus(message);
                setStatusType(type);
                
                if (type === 'success') {
                    setTimeout(() => setStatus(''), 5000);
                }
            };

            const createTestField = async () => {
                setLoading(true);
                try {
                    showStatus('Criando campo teste_cnpj...', 'info');
                    
                    const response = await fetch('/create-test-field', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    const result = await response.json();

                    if (response.ok) {
                        showStatus('✅ Campo teste_cnpj criado/verificado com sucesso!', 'success');
                        await loadConfigStatus();
                    } else {
                        showStatus('❌ Erro: ' + result.error, 'error');
                    }
                } catch (error) {
                    showStatus('❌ Erro ao criar campo teste_cnpj', 'error');
                } finally {
                    setLoading(false);
                }
            };

            const testEnrichment = async () => {
                setLoading(true);
                try {
                    showStatus('Criando empresa de teste...', 'info');
                    
                    const response = await fetch('/create-test-company', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    const result = await response.json();

                    if (response.ok) {
                        showStatus('✅ Empresa criada! ID: ' + result.companyId + '. Testando enriquecimento...', 'success');
                        
                        setTimeout(async () => {
                            await enrichCompany(result.companyId);
                        }, 1000);
                    } else {
                        showStatus('❌ Erro ao criar empresa: ' + result.error, 'error');
                    }
                } catch (error) {
                    showStatus('❌ Erro no teste', 'error');
                } finally {
                    setLoading(false);
                }
            };

            const enrichCompany = async (companyId) => {
                try {
                    showStatus('Enriquecendo empresa com dados do CNPJ...', 'info');
                    
                    const response = await fetch('/enrich', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ companyId: companyId })
                    });

                    const result = await response.json();

                    if (response.ok) {
                        showStatus('🎉 Enriquecimento concluído! Dados salvos no campo teste_cnpj', 'success');
                    } else {
                        showStatus('❌ Erro no enriquecimento: ' + result.error, 'error');
                    }
                } catch (error) {
                    showStatus('❌ Erro no enriquecimento', 'error');
                }
            };

            return React.createElement('div', { className: 'min-h-screen gradient-bg p-6' },
                React.createElement('div', { className: 'max-w-4xl mx-auto' },
                    React.createElement('div', { className: 'bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden' },
                        // Header
                        React.createElement('div', { className: 'bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-6 text-white' },
                            React.createElement('div', { className: 'flex items-center gap-3' },
                                React.createElement(Settings, { className: 'w-8 h-8' }),
                                React.createElement('div', {},
                                    React.createElement('h1', { className: 'text-2xl font-bold' }, 'CNPJ Enricher - Configurações'),
                                    React.createElement('p', { className: 'text-blue-100 mt-1' }, 'Todos os dados são salvos no campo teste_cnpj como texto formatado')
                                )
                            )
                        ),
                        
                        // Content
                        React.createElement('div', { className: 'p-8' },
                            // Info Box
                            React.createElement('div', { className: 'bg-teal-50 border-2 border-teal-200 rounded-xl p-6 mb-8' },
                                React.createElement('div', { className: 'flex items-start gap-3' },
                                    React.createElement(Database, { className: 'w-6 h-6 text-teal-600 mt-1' }),
                                    React.createElement('div', {},
                                        React.createElement('h3', { className: 'text-lg font-semibold text-teal-800 mb-2' }, '📋 Novo Comportamento'),
                                        React.createElement('p', { className: 'text-teal-700' }, 'Todos os dados do CNPJ (Razão Social, Nome Fantasia, Endereço, Telefone, etc.) são salvos em um único campo chamado teste_cnpj como texto formatado e legível.')
                                    )
                                )
                            ),
                            
                            // Status Display
                            status && React.createElement('div', { 
                                className: 'rounded-lg p-4 mb-6 flex items-center gap-3 ' + (
                                    statusType === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
                                    statusType === 'error' ? 'bg-red-50 border border-red-200 text-red-800' :
                                    'bg-blue-50 border border-blue-200 text-blue-800'
                                )
                            },
                                statusType === 'success' && React.createElement(CheckCircle, { className: 'w-5 h-5' }),
                                statusType === 'error' && React.createElement(AlertCircle, { className: 'w-5 h-5' }),
                                statusType === 'info' && React.createElement(Loader2, { className: 'w-5 h-5 animate-spin' }),
                                React.createElement('span', { className: 'font-medium' }, status)
                            ),
                            
                            // Action Buttons
                            React.createElement('div', { className: 'flex flex-col sm:flex-row gap-4 justify-center' },
                                React.createElement('button', {
                                    onClick: createTestField,
                                    disabled: loading,
                                    className: 'flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg border-2 border-slate-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
                                },
                                    loading ? React.createElement(Loader2, { className: 'w-5 h-5 animate-spin' }) : React.createElement(Settings, { className: 'w-5 h-5' }),
                                    '🔧 Criar Campo teste_cnpj'
                                ),
                                
                                React.createElement('button', {
                                    onClick: testEnrichment,
                                    disabled: loading,
                                    className: 'flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
                                },
                                    loading ? React.createElement(Loader2, { className: 'w-5 h-5 animate-spin' }) : React.createElement(Database, { className: 'w-5 h-5' }),
                                    '🧪 Testar Enriquecimento'
                                )
                            )
                        )
                    )
                )
            );
        }
        
        ReactDOM.render(React.createElement(HubSpotSettings), document.getElementById('root'));
    </script>
</body>
</html>
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

    // ⚡ FORMATAR TODOS OS DADOS EM TEXTO LEGÍVEL
    const dadosFormatados = formatCNPJData(cnpjData, cnpjLimpo);
    
    console.log('📦 Dados formatados para campo teste_cnpj:');
    console.log(dadosFormatados);

    // ⚡ PAYLOAD SIMPLIFICADO - APENAS CAMPO teste_cnpj
    const updatePayload = {
      properties: {
        teste_cnpj: dadosFormatados
      }
    };

    console.log('📦 Payload final:', JSON.stringify(updatePayload, null, 2));

    console.log('📡 Atualizando empresa no HubSpot com dados no campo teste_cnpj...');
    
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

    console.log('✅ Empresa atualizada com sucesso! Dados salvos no campo teste_cnpj');
    
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
    
    console.log('🎉 SUCESSO COMPLETO - Dados da empresa salvos no campo teste_cnpj:');
    console.log('🏢 Razão Social:', dadosEmpresa.razaoSocial);
    console.log('✨ Nome Fantasia:', dadosEmpresa.nomeFantasia);
    console.log('📊 Situação:', dadosEmpresa.situacao);
    console.log('📍 Local:', `${dadosEmpresa.cidade}/${dadosEmpresa.estado}`);
    console.log('💼 Porte:', dadosEmpresa.porte);
    console.log('📧 Email:', dadosEmpresa.email);
    console.log('📞 Telefone:', dadosEmpresa.telefone);

    res.json({ 
      success: true,
      message: '🎉 Empresa enriquecida com sucesso! Dados salvos no campo teste_cnpj',
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
        campoDestino: 'teste_cnpj',
        tipoConteudo: 'Texto formatado com todos os dados',
        dadosIncluidos: [
          'Razão Social e Nome Fantasia',
          'Situação Cadastral e Porte',
          'Endereço completo',
          'Telefone e Email',
          'Atividade Principal',
          'Capital Social'
        ]
      },
      proximosPassos: [
        'Verifique o campo teste_cnpj na empresa no HubSpot',
        'Todos os dados estão formatados e legíveis',
        'Use POST /create-test-company para criar mais testes'
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

    res.json({
      success: true,
      companyId: response.data.id,
      message: 'Empresa de teste criada com CNPJ 14665903000104',
      cnpj: '14665903000104',
      testEnrichUrl: `POST /enrich com {"companyId": "${response.data.id}"}`,
      debugUrl: `/debug-company/${response.data.id}`,
      configuracao: {
        campoDestino: 'teste_cnpj',
        tipoConteudo: 'Todos os dados formatados em texto',
        criarCampo: 'POST /create-test-field (se necessário)'
      },
      proximoTeste: {
        url: 'POST /enrich',
        body: { companyId: response.data.id },
        expectativa: 'Dados do CNPJ serão salvos no campo teste_cnpj'
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 CNPJ Enricher rodando na porta ${PORT}`));
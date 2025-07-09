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

// ⚡ Função melhorada para limpar CNPJ - aceita qualquer formato
function cleanCNPJ(cnpj) {
  console.log('🧹 Limpando CNPJ:', cnpj, 'Tipo:', typeof cnpj);
  
  if (!cnpj) {
    console.log('🧹 CNPJ vazio ou null');
    return '';
  }
  
  // Converter para string se necessário
  const cnpjString = String(cnpj).trim();
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

// Status do app
app.get('/account', (req, res) => {
  res.json({
    status: 'connected',
    app: 'CNPJ Enricher',
    version: '1.0',
    tokenStatus: HUBSPOT_ACCESS_TOKEN ? 'Configurado' : 'Não configurado' // ⚡ Adicionado
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
  // Retornar a página HTML de configurações
  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CNPJ Enricher - Configurações</title>
    <style>
        body {
            font-family: 'Lexend', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            min-height: 100vh;
            color: #33475b;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            padding: 32px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
            border: 1px solid rgba(255,255,255,0.2);
        }
        
        h1 {
            color: #33475b;
            text-align: center;
            margin-bottom: 8px;
            font-size: 2.2em;
            font-weight: 700;
        }
        
        .subtitle {
            text-align: center;
            color: #7c98b6;
            margin-bottom: 40px;
            font-size: 1.1em;
        }
        
        .mapping-section {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 24px;
            border-radius: 12px;
            margin-bottom: 32px;
        }
        
        .mapping-section h3 {
            margin-top: 0;
            font-size: 1.4em;
            margin-bottom: 16px;
        }
        
        .field-mapping {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
            align-items: center;
        }
        
        .cnpj-field {
            background: rgba(255,255,255,0.15);
            padding: 12px 16px;
            border-radius: 8px;
            font-weight: 600;
            backdrop-filter: blur(10px);
        }
        
        .hubspot-field select {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 8px;
            background: rgba(255,255,255,0.9);
            color: #33475b;
            font-size: 14px;
            font-weight: 500;
        }
        
        .actions {
            display: flex;
            gap: 16px;
            justify-content: center;
            margin-top: 32px;
        }
        
        button {
            padding: 14px 28px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.3s ease;
            min-width: 140px;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #4299e1, #3182ce);
            color: white;
        }
        
        .btn-secondary {
            background: #f7fafc;
            color: #4a5568;
            border: 2px solid #e2e8f0;
        }
        
        .status {
            padding: 16px;
            border-radius: 8px;
            margin: 16px 0;
            font-weight: 600;
            text-align: center;
        }
        
        .status.success {
            background: #c6f6d5;
            color: #2f855a;
            border: 2px solid #68d391;
        }
        
        .status.error {
            background: #fed7d7;
            color: #c53030;
            border: 2px solid #fc8181;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>⚙️ Configurações CNPJ Enricher</h1>
        <p class="subtitle">Configure como os dados do CNPJ serão mapeados nos campos do HubSpot</p>
        
        <div class="mapping-section">
            <h3>🎯 Mapeamento de Campos</h3>
            
            <div class="field-mapping">
                <div class="cnpj-field">🏢 Razão Social</div>
                <div class="hubspot-field">
                    <select id="razao_social">
                        <option value="">-- Não mapear --</option>
                        <option value="name">Nome da empresa</option>
                        <option value="description">Descrição</option>
                        <option value="about_us">Sobre nós</option>
                        <option value="razao_social">Razão Social (customizado)</option>
                    </select>
                </div>
            </div>
            
            <div class="field-mapping">
                <div class="cnpj-field">✨ Nome Fantasia</div>
                <div class="hubspot-field">
                    <select id="nome_fantasia">
                        <option value="">-- Não mapear --</option>
                        <option value="name">Nome da empresa</option>
                        <option value="description">Descrição</option>
                        <option value="nome_fantasia">Nome Fantasia (customizado)</option>
                    </select>
                </div>
            </div>
            
            <div class="field-mapping">
                <div class="cnpj-field">📞 Telefone</div>
                <div class="hubspot-field">
                    <select id="telefone">
                        <option value="">-- Não mapear --</option>
                        <option value="phone">Telefone</option>
                        <option value="mobilephone">Telefone celular</option>
                        <option value="telefone">Telefone (customizado)</option>
                    </select>
                </div>
            </div>
            
            <div class="field-mapping">
                <div class="cnpj-field">🏙️ Cidade</div>
                <div class="hubspot-field">
                    <select id="cidade">
                        <option value="">-- Não mapear --</option>
                        <option value="city">Cidade</option>
                        <option value="cidade">Cidade (customizado)</option>
                    </select>
                </div>
            </div>
            
            <div class="field-mapping">
                <div class="cnpj-field">🗺️ Estado</div>
                <div class="hubspot-field">
                    <select id="estado">
                        <option value="">-- Não mapear --</option>
                        <option value="state">Estado</option>
                        <option value="estado">Estado (customizado)</option>
                    </select>
                </div>
            </div>
            
            <div class="field-mapping">
                <div class="cnpj-field">📧 Email</div>
                <div class="hubspot-field">
                    <select id="email">
                        <option value="">-- Não mapear --</option>
                        <option value="domain">Domínio</option>
                        <option value="description">Descrição</option>
                        <option value="cnpj_email">Email CNPJ (customizado)</option>
                    </select>
                </div>
            </div>
        </div>
        
        <div class="actions">
            <button type="button" class="btn-secondary" onclick="loadDefaults()">
                🔄 Carregar Padrões
            </button>
            <button type="button" class="btn-primary" onclick="saveMapping()">
                💾 Salvar Configurações
            </button>
        </div>
        
        <div id="status"></div>
    </div>

    <script>
        const defaultMapping = {
            razao_social: 'name',
            nome_fantasia: 'description',
            telefone: 'phone',
            cidade: 'city',
            estado: 'state',
            email: 'cnpj_email'
        };

        function loadDefaults() {
            Object.keys(defaultMapping).forEach(field => {
                const select = document.getElementById(field);
                if (select) {
                    select.value = defaultMapping[field];
                }
            });
            showStatus('Configurações padrão carregadas!', 'success');
        }

        async function saveMapping() {
            const mapping = {};
            
            Object.keys(defaultMapping).forEach(field => {
                const select = document.getElementById(field);
                if (select && select.value) {
                    mapping[field] = select.value;
                }
            });

            try {
                showStatus('Salvando configurações...', 'info');
                
                const response = await fetch('/api/save-mapping', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ mapping })
                });

                const result = await response.json();

                if (response.ok) {
                    showStatus('✅ Configurações salvas com sucesso!', 'success');
                } else {
                    showStatus('❌ Erro: ' + result.error, 'error');
                }
            } catch (error) {
                showStatus('❌ Erro ao salvar configurações', 'error');
            }
        }

        function showStatus(message, type) {
            const statusDiv = document.getElementById('status');
            statusDiv.innerHTML = '<div class="status ' + type + '">' + message + '</div>';
            
            if (type === 'success') {
                setTimeout(() => {
                    statusDiv.innerHTML = '';
                }, 3000);
            }
        }

        async function loadSavedMapping() {
            try {
                const response = await fetch('/api/get-mapping');
                if (response.ok) {
                    const result = await response.json();
                    const mapping = result.mapping || defaultMapping;
                    
                    Object.keys(mapping).forEach(field => {
                        const select = document.getElementById(field);
                        if (select) {
                            select.value = mapping[field] || '';
                        }
                    });
                }
            } catch (error) {
                loadDefaults();
            }
        }

        document.addEventListener('DOMContentLoaded', function() {
            loadSavedMapping();
        });
    </script>
</body>
</html>
  `);
});

// ⚡ Status das configurações
app.get('/api/config-status', (req, res) => {
  try {
    const camposConfigurados = Object.keys(fieldMapping).filter(key => fieldMapping[key] && fieldMapping[key].trim() !== '');
    
    res.json({
      success: true,
      configuracao: {
        totalCamposMapeados: camposConfigurados.length,
        mapeamento: fieldMapping,
        camposConfigurados: camposConfigurados.map(campo => ({
          dadoCNPJ: campo,
          campoHubSpot: fieldMapping[campo]
        }))
      },
      urls: {
        configurar: '/settings',
        enriquecer: 'POST /enrich',
        criarEmpresaTeste: 'POST /create-test-company'
      },
      status: camposConfigurados.length > 0 ? 'Configurado' : 'Não configurado',
      proximoPasso: camposConfigurados.length === 0 ? 
        'Configure o mapeamento em /settings' : 
        'Pronto para enriquecer empresas'
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter status da configuração' });
  }
});

// ⚡ Resetar configurações para padrão
app.post('/api/reset-mapping', (req, res) => {
  try {
    fieldMapping = {
      razao_social: 'name',
      nome_fantasia: 'description', 
      situacao_cadastral: '',
      capital_social: '',
      porte: '',
      atividade_principal: 'industry',
      telefone: 'phone',
      email: '',
      endereco: 'address',
      cidade: 'city',
      estado: 'state',
      cep: 'zip'
    };
    
    console.log('🔄 Mapeamento resetado para padrão:', fieldMapping);
    
    res.json({ 
      success: true, 
      message: 'Mapeamento resetado para configurações padrão',
      mapping: fieldMapping 
    });
  } catch (error) {
    console.error('❌ Erro ao resetar mapeamento:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ⚡ API para salvar mapeamento
app.post('/api/save-mapping', (req, res) => {
  try {
    const { mapping } = req.body;
    
    if (!mapping || typeof mapping !== 'object') {
      return res.status(400).json({ error: 'Mapeamento inválido' });
    }
    
    // Salvar mapeamento (em produção usar banco de dados)
    fieldMapping = { ...fieldMapping, ...mapping };
    
    console.log('✅ Mapeamento salvo:', fieldMapping);
    
    res.json({ 
      success: true, 
      message: 'Mapeamento salvo com sucesso',
      mapping: fieldMapping 
    });
  } catch (error) {
    console.error('❌ Erro ao salvar mapeamento:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ⚡ API para recuperar mapeamento
app.get('/api/get-mapping', (req, res) => {
  try {
    res.json({ 
      success: true, 
      mapping: fieldMapping 
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

// Enrichment com CNPJ - Versão com debug melhorado
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
      console.log(`   ${key}: "${properties[key]}"`);
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
    const cnpj = cleanCNPJ(cnpjRaw);
    console.log('🧹 CNPJ limpo:', cnpj);
    console.log('🧹 Tamanho do CNPJ limpo:', cnpj.length);

    if (!cnpj || cnpj.length !== 14) {
      console.warn('⚠️ CNPJ inválido ou não encontrado');
      
      // Sugestões específicas baseadas no problema
      let sugestoes = [];
      if (!cnpjRaw) {
        sugestoes.push('Campo CNPJ não encontrado na empresa');
        sugestoes.push(`Use: POST /add-cnpj/${companyId} com {"cnpj": "14665903000104"}`);
      } else if (cnpj.length === 0) {
        sugestoes.push('Campo CNPJ existe mas está vazio');
      } else if (cnpj.length !== 14) {
        sugestoes.push(`CNPJ tem ${cnpj.length} dígitos, precisa ter 14`);
        sugestoes.push('Formatos aceitos: 14665903000104 ou 14.665.903/0001-04');
      }
      
      return res.status(400).json({ 
        error: 'CNPJ inválido ou não encontrado',
        cnpjRaw: cnpjRaw,
        cnpjLimpo: cnpj,
        cnpjTamanho: cnpj.length,
        campoExiste: 'cnpj' in properties,
        todasPropriedades: Object.keys(properties),
        camposPossiveisCNPJ: cnpjPossibleKeys,
        sugestoes: sugestoes,
        debug: `Valor original: "${cnpjRaw}" | Tipo: ${typeof cnpjRaw} | Limpo: "${cnpj}"`
      });
    }

    console.log('📡 Buscando dados do CNPJ na API externa...');
    
    // Buscar dados do CNPJ
    const cnpjDataResponse = await axios.get(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
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

    // ⚡ Usar mapeamento configurado pelo usuário
    const updatePayload = {
      properties: {}
    };

    // Mapear campos conforme configuração do usuário
    if (fieldMapping.razao_social) {
      updatePayload.properties[fieldMapping.razao_social] = extract('Razão Social', cnpjData.razao_social);
    }
    
    if (fieldMapping.nome_fantasia) {
      updatePayload.properties[fieldMapping.nome_fantasia] = extract('Nome Fantasia', cnpjData.estabelecimento?.nome_fantasia);
    }
    
    if (fieldMapping.situacao_cadastral) {
      updatePayload.properties[fieldMapping.situacao_cadastral] = extract('Situação Cadastral', cnpjData.estabelecimento?.situacao_cadastral);
    }
    
    if (fieldMapping.capital_social) {
      updatePayload.properties[fieldMapping.capital_social] = extract('Capital Social', cnpjData.capital_social);
    }
    
    if (fieldMapping.porte) {
      updatePayload.properties[fieldMapping.porte] = extract('Porte', cnpjData.porte?.descricao);
    }
    
    if (fieldMapping.atividade_principal) {
      updatePayload.properties[fieldMapping.atividade_principal] = extract('Atividade Principal', cnpjData.estabelecimento?.atividade_principal?.descricao);
    }
    
    if (fieldMapping.telefone) {
      const telefoneFormatado = cnpjData.estabelecimento?.telefone1 ? 
        `(${cnpjData.estabelecimento.ddd1}) ${cnpjData.estabelecimento.telefone1}` : '';
      updatePayload.properties[fieldMapping.telefone] = extract('Telefone', telefoneFormatado);
    }
    
    if (fieldMapping.email) {
      updatePayload.properties[fieldMapping.email] = extract('Email', cnpjData.estabelecimento?.email);
    }
    
    if (fieldMapping.endereco) {
      const enderecoCompleto = cnpjData.estabelecimento?.logradouro ? 
        `${cnpjData.estabelecimento.tipo_logradouro} ${cnpjData.estabelecimento.logradouro}, ${cnpjData.estabelecimento.numero}` : '';
      updatePayload.properties[fieldMapping.endereco] = extract('Endereço', enderecoCompleto);
    }
    
    if (fieldMapping.cidade) {
      updatePayload.properties[fieldMapping.cidade] = extract('Cidade', cnpjData.estabelecimento?.cidade?.nome);
    }
    
    if (fieldMapping.estado) {
      updatePayload.properties[fieldMapping.estado] = extract('Estado', cnpjData.estabelecimento?.estado?.sigla);
    }
    
    if (fieldMapping.cep) {
      updatePayload.properties[fieldMapping.cep] = extract('CEP', cnpjData.estabelecimento?.cep);
    }

    // Remover campos vazios
    Object.keys(updatePayload.properties).forEach(key => {
      if (!updatePayload.properties[key] || updatePayload.properties[key].trim() === '') {
        delete updatePayload.properties[key];
      }
    });

    console.log('📦 Payload usando mapeamento configurado:', JSON.stringify(updatePayload, null, 2));
    console.log('⚙️ Mapeamento atual:', fieldMapping);

    if (Object.keys(updatePayload.properties).length === 0) {
      return res.status(400).json({
        error: 'Nenhum campo configurado para mapeamento',
        message: 'Configure o mapeamento de campos em /settings',
        settingsUrl: '/settings',
        dadosDisponiveis: {
          razaoSocial: cnpjData.razao_social,
          nomeFantasia: cnpjData.estabelecimento?.nome_fantasia,
          cidade: cnpjData.estabelecimento?.cidade?.nome,
          estado: cnpjData.estabelecimento?.estado?.sigla
        }
      });
    }

    console.log('📦 Payload TESTE - Todos os dados em teste_cnpj:', JSON.stringify(updatePayload, null, 2));

    console.log('📡 Atualizando empresa no HubSpot (usando mapeamento configurado)...');
    
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

    console.log('✅ Empresa atualizada com sucesso usando mapeamento configurado!');
    
    // ⚡ Dados resumidos da empresa para o log e resposta
    const dadosEmpresa = {
      razaoSocial: cnpjData.razao_social,
      nomeFantasia: cnpjData.estabelecimento?.nome_fantasia,
      situacao: cnpjData.estabelecimento?.situacao_cadastral,
      porte: cnpjData.porte?.descricao,
      cidade: cnpjData.estabelecimento?.cidade?.nome,
      estado: cnpjData.estabelecimento?.estado?.sigla,
      atividade: cnpjData.estabelecimento?.atividade_principal?.descricao,
      email: cnpjData.estabelecimento?.email,
      telefone: cnpjData.estabelecimento?.telefone1
    };
    
    console.log('🎉 SUCESSO COMPLETO - Dados da empresa atualizados conforme configuração:');
    console.log('🏢 Razão Social:', dadosEmpresa.razaoSocial);
    console.log('✨ Nome Fantasia:', dadosEmpresa.nomeFantasia);
    console.log('📊 Situação:', dadosEmpresa.situacao);
    console.log('📍 Local:', `${dadosEmpresa.cidade}/${dadosEmpresa.estado}`);
    console.log('💼 Porte:', dadosEmpresa.porte);
    console.log('📧 Email:', dadosEmpresa.email);
    console.log('📞 Telefone:', dadosEmpresa.telefone);

    res.json({ 
      success: true,
      message: '🎉 Empresa enriquecida com sucesso usando mapeamento configurado!',
      cnpj: cnpj,
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
      mapeamento: {
        camposAtualizados: Object.keys(updatePayload.properties),
        totalCampos: Object.keys(updatePayload.properties).length,
        configuracaoUsada: fieldMapping,
        camposPorDado: Object.keys(updatePayload.properties).map(field => {
          // Encontrar qual dado do CNPJ foi mapeado para este campo
          const reverseMapping = Object.entries(fieldMapping).find(([key, value]) => value === field);
          return {
            campoHubSpot: field,
            dadoCNPJ: reverseMapping ? reverseMapping[0] : 'desconhecido',
            valor: updatePayload.properties[field]
          };
        })
      },
      configuracoes: {
        settingsUrl: '/settings',
        message: 'Configure o mapeamento de campos em /settings'
      }
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
      console.log('⚠️ Algumas propriedades configuradas não existem no HubSpot');
      
      const missingProps = error.response.data.errors?.map(err => err.context?.propertyName || 'unknown') || [];
      console.log('📋 Propriedades faltando:', missingProps);
      
      return res.status(400).json({ 
        error: 'Propriedades configuradas não existem no HubSpot',
        message: 'Alguns campos do mapeamento não foram criados no HubSpot',
        propriedadesFaltando: missingProps,
        solucoes: [
          '1. Acesse /settings e configure campos que existem',
          '2. Ou use: POST /create-cnpj-properties para criar campos customizados',
          '3. Dados foram obtidos com sucesso da Receita Federal'
        ],
        dadosObtidos: {
          cnpj: cnpj,
          razaoSocial: cnpjData.razao_social,
          nomeFantasia: cnpjData.estabelecimento?.nome_fantasia,
          situacao: cnpjData.estabelecimento?.situacao_cadastral,
          cidade: cnpjData.estabelecimento?.cidade?.nome,
          estado: cnpjData.estabelecimento?.estado?.sigla
        },
        mapeamentoAtual: fieldMapping,
        proximosPasses: [
          'Configure campos válidos em: /settings',
          'Ou crie propriedades customizadas: POST /create-cnpj-properties',
          'Depois execute: POST /enrich novamente'
        ]
      });
    }
    
    // ⚡ TRATAR RATE LIMIT (429) COMO SUCESSO PARCIAL
    if (error.response?.status === 429 && error.config?.url?.includes('cnpj.ws')) {
      console.log('⚠️ Rate limit atingido na API CNPJ - Consulta será feita depois');
      console.log('✅ CNPJ válido encontrado:', cnpj);
      console.log('🏢 Empresa:', properties.name || 'Sem nome');
      
      return res.status(200).json({ 
        success: true,
        message: '✅ CNPJ válido encontrado! Rate limit atingido (3 consultas/min)',
        cnpj: cnpj,
        empresaEncontrada: properties.name || 'Empresa sem nome',
        status: 'Aguardando liberação da API',
        detalhes: error.response?.data?.detalhes || 'Aguarde alguns minutos e tente novamente',
        proximaTentativa: 'Aguarde 1-2 minutos para nova consulta',
        dadosEncontrados: {
          cnpjValido: cnpj,
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

// ⚡ Endpoint para criar propriedades customizadas no HubSpot
app.post('/create-cnpj-properties', async (req, res) => {
  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Token não configurado' });
  }

  const properties = [
    { name: 'razao_social', label: 'Razão Social', type: 'string', description: 'Razão social da empresa' },
    { name: 'nome_fantasia', label: 'Nome Fantasia', type: 'string', description: 'Nome fantasia da empresa' },
    { name: 'situacao_cadastral', label: 'Situação Cadastral', type: 'string', description: 'Situação cadastral na Receita Federal' },
    { name: 'capital_social', label: 'Capital Social', type: 'string', description: 'Capital social da empresa' },
    { name: 'porte', label: 'Porte', type: 'string', description: 'Porte da empresa' },
    { name: 'atividade_principal', label: 'Atividade Principal', type: 'string', description: 'Atividade principal da empresa' },
    { name: 'cnpj_email', label: 'Email CNPJ', type: 'string', description: 'Email cadastrado na Receita Federal' },
    { name: 'bairro', label: 'Bairro', type: 'string', description: 'Bairro da empresa' }
  ];

  const results = [];

  try {
    console.log('🔧 Criando propriedades customizadas no HubSpot...');

    for (const prop of properties) {
      try {
        console.log(`📝 Criando propriedade: ${prop.name}`);
        
        const response = await axios.post(
          'https://api.hubapi.com/crm/v3/properties/companies',
          {
            name: prop.name,
            label: prop.label,
            type: prop.type,
            fieldType: 'text',
            description: prop.description,
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

        console.log(`✅ Propriedade ${prop.name} criada com sucesso`);
        results.push({ property: prop.name, status: 'created', id: response.data.name });
        
      } catch (error) {
        if (error.response?.status === 409) {
          console.log(`⚠️ Propriedade ${prop.name} já existe`);
          results.push({ property: prop.name, status: 'already_exists' });
        } else {
          console.error(`❌ Erro ao criar ${prop.name}:`, error.response?.data);
          results.push({ property: prop.name, status: 'error', details: error.response?.data });
        }
      }
    }

    const created = results.filter(r => r.status === 'created').length;
    const existing = results.filter(r => r.status === 'already_exists').length;
    const errors = results.filter(r => r.status === 'error').length;

    res.json({
      success: true,
      message: `Propriedades CNPJ configuradas: ${created} criadas, ${existing} já existiam, ${errors} erros`,
      results: results,
      summary: {
        created: created,
        already_exists: existing,
        errors: errors,
        total: properties.length
      },
      nextStep: 'Agora você pode usar todos os campos específicos do CNPJ no enriquecimento!'
    });

  } catch (error) {
    console.error('❌ Erro geral ao criar propriedades:', error);
    res.status(500).json({
      error: 'Erro ao criar propriedades customizadas',
      details: error.message,
      results: results
    });
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
        settingsUrl: '/settings',
        message: 'Configure o mapeamento de campos antes de enriquecer',
        mapeamentoAtual: fieldMapping
      },
      proximoTeste: {
        url: 'POST /enrich',
        body: { companyId: response.data.id },
        expectativa: 'Dados do CNPJ serão mapeados conforme configuração em /settings'
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
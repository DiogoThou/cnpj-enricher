const express = require('express');
const axios = require('axios');
const syncCNPJs = require('./syncCNPJs');
const enrichmentRoutes = require('./routes/enrichment');
const { errorHandler } = require('./middleware/errorHandler');
const { authMiddleware, setToken, getToken } = require('./middleware/auth');

const app = express();

// Middlewares
app.use(express.json());
app.use(authMiddleware);

// Variáveis de ambiente
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const HUBSPOT_REFRESH_TOKEN = process.env.HUBSPOT_REFRESH_TOKEN;
const REDIRECT_URI = process.env.REDIRECT_URI;

// Status do app
app.get('/account', (req, res) => {
  res.json({
    status: 'connected',
    app: 'CNPJ Enricher',
    version: '2.0',
    tokenStatus: getToken() ? 'Configurado' : 'Não configurado',
    features: [
      'Enriquecimento automático de empresas',
      'Cache inteligente de dados CNPJ',
      'Rate limiting automático (3 consultas/minuto)',
      'Tratamento robusto de erros',
      'Campo único teste_cnpj'
    ],
    endpoints: {
      enriquecer: 'POST /api/enrich',
      criarTeste: 'POST /api/create-test-company',
      criarCampo: 'POST /api/create-test-field',
      testarCNPJ: 'GET /api/test-cnpj/:cnpj',
      debug: 'GET /api/debug-company/:companyId',
      rateLimitStatus: 'GET /api/rate-limit-status'
    }
  });
});

// ⚡ OAuth Callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('❌ Código de autorização não fornecido.');

  console.log('🔍 Processando OAuth callback...');

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
    setToken(access_token);

    console.log('✅ Token OAuth gerado com sucesso');

    res.send(`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #28a745;">✅ Autenticação realizada com sucesso!</h2>
        <p><strong>Status:</strong> Conectado ao HubSpot</p>
        <p><strong>Token válido por:</strong> ${Math.floor(expires_in / 3600)} horas</p>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3>🚀 Próximos passos:</h3>
          <ol>
            <li><strong>Criar campo teste_cnpj:</strong><br>
            <code>POST /api/create-test-field</code></li>
            <li><strong>Criar empresa de teste:</strong><br>
            <code>POST /api/create-test-company</code></li>
            <li><strong>Enriquecer empresa:</strong><br>
            <code>POST /api/enrich</code></li>
          </ol>
        </div>
        
        <div style="margin-top: 20px;">
          <a href="/account" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verificar Status</a>
        </div>
      </div>
    `);
  } catch (error) {
    console.error('❌ Erro no OAuth:', error.response?.data);
    
    res.status(500).send(`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; border: 1px solid #dc3545; border-radius: 8px;">
        <h2 style="color: #dc3545;">❌ Erro na autenticação</h2>
        <p><strong>Status:</strong> ${error.response?.status}</p>
        <p><strong>Erro:</strong> ${JSON.stringify(error.response?.data)}</p>
        <p><strong>CLIENT_ID:</strong> ${CLIENT_ID}</p>
        <p><strong>REDIRECT_URI:</strong> ${REDIRECT_URI}</p>
      </div>
    `);
  }
});

// ⚡ Refresh token
app.get('/refresh', async (req, res) => {
  if (!HUBSPOT_REFRESH_TOKEN) {
    return res.status(400).json({
      error: 'Refresh token não configurado',
      code: 'MISSING_REFRESH_TOKEN'
    });
  }

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

    const { access_token, expires_in } = response.data;
    setToken(access_token);

    console.log('✅ Token renovado com sucesso');

    res.json({
      success: true,
      message: 'Token renovado com sucesso',
      expiresIn: expires_in
    });
  } catch (error) {
    console.error('❌ Erro ao renovar token:', error.response?.data);
    res.status(500).json({
      error: 'Erro ao renovar token',
      details: error.response?.data
    });
  }
});

// ⚡ Testar token
app.get('/test-token', async (req, res) => {
  const token = getToken();
  
  if (!token) {
    return res.json({
      success: false,
      message: 'Token não configurado',
      authUrl: `https://app.hubspot.com/oauth/authorize?client_id=${CLIENT_ID}&scope=crm.objects.companies.read%20crm.objects.companies.write&redirect_uri=${REDIRECT_URI}`
    });
  }

  try {
    const response = await axios.get('https://api.hubapi.com/crm/v3/objects/companies?limit=1', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    res.json({
      success: true,
      message: 'Token funcionando perfeitamente',
      tokenPreview: token.substring(0, 20) + '...',
      companiesFound: response.data.results.length
    });
  } catch (error) {
    res.json({
      success: false,
      message: 'Token inválido ou expirado',
      error: error.response?.data
    });
  }
});

// ⚡ Página de configurações corrigida para HubSpot
app.get('/settings', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CNPJ Enricher 2.0 - Configurações</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 25px 80px rgba(0,0,0,0.15);
        }
        
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        
        .header h1 {
            font-size: 2.5em;
            color: #2d3748;
            margin-bottom: 10px;
        }
        
        .header .version {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.9em;
            display: inline-block;
        }
        
        .rate-limit-info {
            background: linear-gradient(135deg, #ffeaa7, #fdcb6e);
            padding: 20px;
            border-radius: 15px;
            margin-bottom: 30px;
            border-left: 4px solid #e17055;
        }
        
        .rate-limit-info h3 {
            color: #2d3748;
            margin-bottom: 10px;
            font-size: 1.2em;
        }
        
        .rate-limit-info p {
            color: #636e72;
            line-height: 1.5;
            margin-bottom: 8px;
        }
        
        .feature-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        
        .feature-card {
            background: linear-gradient(135deg, #f7fafc, #edf2f7);
            padding: 25px;
            border-radius: 15px;
            border-left: 4px solid #667eea;
        }
        
        .feature-card h3 {
            color: #2d3748;
            margin-bottom: 10px;
            font-size: 1.2em;
        }
        
        .feature-card p {
            color: #4a5568;
            line-height: 1.5;
        }
        
        .actions {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 30px;
        }
        
        .btn {
            padding: 15px 25px;
            border: none;
            border-radius: 10px;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.3s ease;
            text-align: center;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
        }
        
        .btn-secondary {
            background: #f7fafc;
            color: #4a5568;
            border: 2px solid #e2e8f0;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(0,0,0,0.15);
        }
        
        .status {
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            font-weight: 600;
            text-align: center;
        }
        
        .status.success {
            background: linear-gradient(135deg, #48bb78, #38a169);
            color: white;
        }
        
        .status.error {
            background: linear-gradient(135deg, #f56565, #e53e3e);
            color: white;
        }
        
        .status.info {
            background: linear-gradient(135deg, #4299e1, #3182ce);
            color: white;
        }
        
        .status.warning {
            background: linear-gradient(135deg, #ed8936, #dd6b20);
            color: white;
        }
        
        .rate-limit-status {
            background: #f7fafc;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            border: 2px solid #e2e8f0;
        }
        
        .rate-limit-status h4 {
            color: #2d3748;
            margin-bottom: 10px;
        }
        
        .rate-limit-status p {
            color: #4a5568;
            margin-bottom: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚙️ CNPJ Enricher</h1>
            <span class="version">v2.0 - Com Rate Limit</span>
            <p style="margin-top: 15px; color: #4a5568;">Sistema inteligente de enriquecimento de empresas</p>
        </div>

        <div class="rate-limit-info">
            <h3>⚠️ Importante: Limite da API CNPJ</h3>
            <p><strong>Limite:</strong> 3 consultas por minuto</p>
            <p><strong>Delay:</strong> 20 segundos entre cada consulta</p>
            <p><strong>Cache:</strong> Dados ficam salvos por 1 hora</p>
            <p><strong>Comportamento:</strong> Se exceder o limite, você receberá uma mensagem para aguardar</p>
        </div>

        <div class="feature-grid">
            <div class="feature-card">
                <h3>🚀 Campo Único</h3>
                <p>Todos os dados são salvos no campo <strong>teste_cnpj</strong> como texto formatado e legível.</p>
            </div>
            
            <div class="feature-card">
                <h3>⚡ Cache Inteligente</h3>
                <p>Sistema de cache para evitar consultas desnecessárias à API da Receita Federal.</p>
            </div>
            
            <div class="feature-card">
                <h3>🛡️ Rate Limiting</h3>
                <p>Controle automático de velocidade para respeitar limites da API CNPJ (3 por minuto).</p>
            </div>
            
            <div class="feature-card">
                <h3>🔧 Tratamento de Erros</h3>
                <p>Sistema robusto de tratamento de erros com mensagens claras e soluções.</p>
            </div>
        </div>

        <div class="actions">
            <button class="btn btn-secondary" onclick="checkRateLimit()">
                📊 Status Rate Limit
            </button>
            <button class="btn btn-secondary" onclick="createField()">
                🔧 Criar Campo teste_cnpj
            </button>
            <button class="btn btn-secondary" onclick="createTestCompany()">
                🏢 Criar Empresa Teste
            </button>
            <button class="btn btn-primary" onclick="testEnrichment()">
                🧪 Testar Enriquecimento
            </button>
            <button class="btn btn-secondary" onclick="testToken()">
                🔑 Testar Token
            </button>
        </div>
        
        <div id="status"></div>
        <div id="rateLimitStatus"></div>
        
        <div style="margin-top: 40px; padding: 20px; background: #f7fafc; border-radius: 10px;">
            <h3 style="color: #2d3748; margin-bottom: 15px;">📋 Dados salvos no campo teste_cnpj:</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                <ul style="color: #4a5568; line-height: 1.8; list-style: none;">
                    <li>✅ Razão Social e Nome Fantasia</li>
                    <li>✅ Situação Cadastral e Porte</li>
                    <li>✅ Endereço completo formatado</li>
                    <li>✅ Telefone e Email de contato</li>
                </ul>
                <ul style="color: #4a5568; line-height: 1.8; list-style: none;">
                    <li>✅ Atividade Principal e CNAE</li>
                    <li>✅ Capital Social e Natureza Jurídica</li>
                    <li>✅ Lista completa de sócios</li>
                    <li>✅ Data de atualização dos dados</li>
                </ul>
            </div>
        </div>
    </div>

    <script>
        let currentCompanyId = null;

        async function checkRateLimit() {
            try {
                showStatus('Verificando status do rate limit...', 'info');
                
                const response = await fetch('/api/rate-limit-status');
                const result = await response.json();

                if (response.ok) {
                    const status = result.rateLimitStatus;
                    const cache = result.cacheStats;
                    
                    let statusHtml = '<div class="rate-limit-status">';
                    statusHtml += '<h4>📊 Status do Rate Limit</h4>';
                    statusHtml += '<p><strong>Pode fazer consulta:</strong> ' + (status.canMakeRequest ? '✅ Sim' : '❌ Não') + '</p>';
                    statusHtml += '<p><strong>Consultas no último minuto:</strong> ' + status.requestsInWindow + '/' + status.maxRequests + '</p>';
                    
                    if (!status.canMakeRequest) {
                        statusHtml += '<p><strong>Aguardar:</strong> ' + status.waitTimeFormatted + '</p>';
                    }
                    
                    statusHtml += '<p><strong>CNPJs em cache:</strong> ' + cache.cacheSize + '</p>';
                    statusHtml += '<p><strong>Última consulta:</strong> ' + cache.lastRequestTime + '</p>';
                    statusHtml += '</div>';
                    
                    document.getElementById('rateLimitStatus').innerHTML = statusHtml;
                    showStatus('✅ Status do rate limit atualizado', 'success');
                } else {
                    showStatus('❌ Erro ao verificar rate limit', 'error');
                }
            } catch (error) {
                showStatus('❌ Erro ao verificar rate limit', 'error');
            }
        }

        async function createField() {
            try {
                showStatus('Criando campo teste_cnpj...', 'info');
                
                const response = await fetch('/api/create-test-field', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();

                if (response.ok) {
                    showStatus('✅ ' + result.message, 'success');
                } else {
                    showStatus('❌ Erro: ' + result.error, 'error');
                }
            } catch (error) {
                showStatus('❌ Erro ao criar campo', 'error');
            }
        }

        async function createTestCompany() {
            try {
                showStatus('Criando empresa de teste...', 'info');
                
                const response = await fetch('/api/create-test-company', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();

                if (response.ok) {
                    currentCompanyId = result.companyId;
                    showStatus('✅ Empresa criada! ID: ' + result.companyId, 'success');
                } else {
                    showStatus('❌ Erro: ' + result.error, 'error');
                }
            } catch (error) {
                showStatus('❌ Erro ao criar empresa', 'error');
            }
        }

        async function testEnrichment() {
            if (!currentCompanyId) {
                showStatus('⚠️ Crie uma empresa de teste primeiro', 'warning');
                return;
            }

            try {
                showStatus('Enriquecendo empresa com dados do CNPJ...', 'info');
                
                const response = await fetch('/api/enrich', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyId: currentCompanyId })
                });

                const result = await response.json();

                if (response.ok) {
                    showStatus('🎉 ' + result.message, 'success');
                    if (result.rateLimitInfo) {
                        setTimeout(() => {
                            showStatus('📊 Consultas restantes: ' + result.rateLimitInfo.requestsRemaining + '/3', 'info');
                        }, 2000);
                    }
                } else if (response.status === 429) {
                    showStatus('⏳ Rate limit: ' + result.message, 'warning');
                } else {
                    showStatus('❌ Erro: ' + result.error, 'error');
                }
            } catch (error) {
                showStatus('❌ Erro no enriquecimento', 'error');
            }
        }

        async function testToken() {
            try {
                showStatus('Testando token do HubSpot...', 'info');
                
                const response = await fetch('/test-token');
                const result = await response.json();

                if (result.success) {
                    showStatus('✅ ' + result.message, 'success');
                } else {
                    showStatus('❌ ' + result.message, 'error');
                }
            } catch (error) {
                showStatus('❌ Erro ao testar token', 'error');
            }
        }

        function showStatus(message, type) {
            const statusDiv = document.getElementById('status');
            statusDiv.innerHTML = '<div class="status ' + type + '">' + message + '</div>';
            
            if (type === 'success') {
                setTimeout(() => {
                    statusDiv.innerHTML = '';
                }, 5000);
            }
        }

        // Carregar status do rate limit ao abrir a página
        document.addEventListener('DOMContentLoaded', function() {
            checkRateLimit();
        });
    </script>
</body>
</html>
  `);
});

// ⚡ Usar rotas de enriquecimento
app.use('/api', enrichmentRoutes);

// Sincronização (mantido para compatibilidade)
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

// ⚡ Middleware de tratamento de erros (deve ser o último)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 CNPJ Enricher 2.0 rodando na porta ${PORT}`);
  console.log(`📋 Endpoints disponíveis:`);
  console.log(`   GET  /account - Status do app`);
  console.log(`   GET  /settings - Página de configurações`);
  console.log(`   POST /api/enrich - Enriquecer empresa`);
  console.log(`   POST /api/create-test-company - Criar empresa teste`);
  console.log(`   POST /api/create-test-field - Criar campo teste_cnpj`);
  console.log(`   GET  /api/rate-limit-status - Status do rate limit`);
});
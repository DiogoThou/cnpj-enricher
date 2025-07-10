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

// ⚡ Armazenamento para configurações
let mappingMode = 'campo_unico';
let telefoneMapping = 'phone';

// ⚡ Função para limpar CNPJ
function cleanCNPJ(cnpjInput) {
  if (!cnpjInput) return '';
  const cnpjString = String(cnpjInput).trim();
  const cleaned = cnpjString.replace(/[^\d]/g, '');
  return cleaned;
}

// ⚡ Função para formatar dados do CNPJ
function formatCNPJData(cnpjData, cnpjNumber) {
  const estabelecimento = cnpjData.estabelecimento || {};
  const endereco = estabelecimento.logradouro ? 
    `${estabelecimento.tipo_logradouro || ''} ${estabelecimento.logradouro}, ${estabelecimento.numero || 'S/N'}` : 
    'Não informado';
  
  const telefone = estabelecimento.telefone1 ? 
    `(${estabelecimento.ddd1}) ${estabelecimento.telefone1}` : 
    'Não informado';

  return `
=== DADOS DA RECEITA FEDERAL ===
CNPJ: ${cnpjNumber}
Razão Social: ${cnpjData.razao_social || 'Não informado'}
Nome Fantasia: ${estabelecimento.nome_fantasia || 'Não informado'}
Situação Cadastral: ${estabelecimento.situacao_cadastral || 'Não informado'}
Porte: ${cnpjData.porte?.descricao || 'Não informado'}
Capital Social: R$ ${cnpjData.capital_social || 'Não informado'}

=== ENDEREÇO ===
Endereço: ${endereco}
Cidade: ${estabelecimento.cidade?.nome || 'Não informado'}
Estado: ${estabelecimento.estado?.sigla || 'Não informado'}
CEP: ${estabelecimento.cep || 'Não informado'}

=== CONTATO ===
Telefone: ${telefone}
Email: ${estabelecimento.email || 'Não informado'}

Atualizado em: ${new Date().toLocaleString('pt-BR')}
  `.trim();
}

// Status do app
app.get('/account', (req, res) => {
  res.json({
    status: 'connected',
    app: 'CNPJ Enricher v3',
    version: '3.0',
    tokenStatus: HUBSPOT_ACCESS_TOKEN ? 'Configurado' : 'Não configurado',
    configuracao: {
      modo: mappingMode,
      telefone: telefoneMapping
    }
  });
});

// ⚡ OAuth Callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('❌ Código não fornecido.');

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
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, expires_in } = response.data;
    HUBSPOT_ACCESS_TOKEN = access_token;

    res.send(`
      <h2>✅ Token gerado com sucesso!</h2>
      <p><strong>Expira em:</strong> ${expires_in} segundos</p>
      <p><a href="/account">Verificar Status</a></p>
    `);
  } catch (error) {
    res.status(500).send(`<h2>❌ Erro: ${error.message}</h2>`);
  }
});

// ⚡ DROPDOWN MODO - URLs NOVAS E SIMPLES
app.post('/api/modo-fetch', async (req, res) => {
  console.log('🗺️ Solicitando opções do MODO...');
  
  try {
    const options = [
      {
        label: 'Campo único',
        value: 'campo_unico',
        description: 'Todos os dados no campo teste_cnpj'
      },
      {
        label: 'Campos separados',
        value: 'campos_separados',
        description: 'Cada dado em seu campo'
      }
    ];

    res.json({ results: options });
  } catch (error) {
    console.error('❌ Erro modo-fetch:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/modo-save', async (req, res) => {
  console.log('🗺️ Salvando MODO...');
  console.log('📥 Body:', req.body);

  try {
    const { inputFields } = req.body;
    
    if (inputFields && inputFields.modo_mapeamento) {
      mappingMode = inputFields.modo_mapeamento;
      console.log('✅ Modo salvo:', mappingMode);
      
      res.json({
        success: true,
        message: `Modo "${mappingMode}" salvo!`
      });
    } else {
      res.status(400).json({ error: 'Campo não encontrado' });
    }
  } catch (error) {
    console.error('❌ Erro modo-save:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ⚡ DROPDOWN TELEFONE - URLs NOVAS E SIMPLES
app.post('/api/tel-fetch', async (req, res) => {
  console.log('📞 Solicitando opções do TELEFONE...');
  
  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Token não configurado' });
  }

  try {
    const response = await axios.get(
      'https://api.hubapi.com/crm/v3/properties/companies',
      { headers: { Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}` } }
    );

    const properties = response.data.results || [];
    
    // Filtrar campos de telefone
    const phoneFields = properties.filter(prop => 
      prop.type === 'string' || 
      prop.type === 'phonenumber' ||
      prop.name.toLowerCase().includes('phone') ||
      prop.name.toLowerCase().includes('tel')
    );

    const options = phoneFields.map(field => ({
      label: `${field.label} (${field.name})`,
      value: field.name,
      description: `Campo ${field.type}`
    }));

    console.log('📞 Retornando', options.length, 'opções telefone');
    res.json({ results: options });
  } catch (error) {
    console.error('❌ Erro tel-fetch:', error.response?.data);
    res.status(500).json({ error: 'Erro ao buscar campos' });
  }
});

app.post('/api/tel-save', async (req, res) => {
  console.log('📞 Salvando TELEFONE...');
  console.log('📥 Body:', req.body);

  try {
    const { inputFields } = req.body;
    
    if (inputFields && inputFields.telefone_field) {
      telefoneMapping = inputFields.telefone_field;
      console.log('✅ Telefone salvo:', telefoneMapping);
      
      res.json({
        success: true,
        message: `Campo "${telefoneMapping}" salvo para telefone!`
      });
    } else {
      res.status(400).json({ error: 'Campo telefone_field não encontrado' });
    }
  } catch (error) {
    console.error('❌ Erro tel-save:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ⚡ Página de configurações SIMPLIFICADA
app.get('/settings', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CNPJ Enricher v3 - Configurações</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .config-box {
            background: #e8f4fd;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
            border-left: 4px solid #007bff;
        }
        .actions {
            display: flex;
            gap: 15px;
            justify-content: center;
            flex-wrap: wrap;
        }
        button {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        .btn-primary {
            background: #007bff;
            color: white;
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        .btn-success {
            background: #28a745;
            color: white;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
        .status {
            padding: 15px;
            border-radius: 6px;
            margin: 15px 0;
            font-weight: 600;
            text-align: center;
        }
        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .status.info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        .version {
            background: #ff6b35;
            color: white;
            padding: 4px 12px;
            border-radius: 15px;
            font-size: 0.8em;
            margin-left: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>⚙️ CNPJ Enricher <span class="version">v3.0</span></h1>
        
        <div class="config-box">
            <h3>📋 Configuração Atual</h3>
            <p><strong>Modo:</strong> ${mappingMode === 'campo_unico' ? 'Campo único' : 'Campos separados'}</p>
            <p><strong>Telefone:</strong> ${telefoneMapping}</p>
            <p><strong>URLs:</strong> /api/tel-fetch e /api/tel-save</p>
        </div>
        
        <div class="actions">
            <button class="btn-secondary" onclick="createField()">
                🔧 Criar Campo
            </button>
            <button class="btn-success" onclick="testConfig()">
                🧪 Testar Config
            </button>
            <button class="btn-primary" onclick="testEnrich()">
                🚀 Testar Enriquecimento
            </button>
        </div>
        
        <div id="status"></div>
    </div>

    <script>
        async function createField() {
            showStatus('Criando campo teste_cnpj...', 'info');
            
            try {
                const response = await fetch('/create-test-field', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const result = await response.json();
                
                if (response.ok) {
                    showStatus('✅ ' + result.message, 'success');
                } else {
                    showStatus('❌ ' + result.error, 'error');
                }
            } catch (error) {
                showStatus('❌ Erro ao criar campo', 'error');
            }
        }

        async function testConfig() {
            showStatus('Testando configuração...', 'info');
            
            try {
                const response = await fetch('/api/config-status');
                const result = await response.json();
                
                if (response.ok) {
                    showStatus('✅ Config OK: ' + result.configuracao.modo + ' | Tel: ' + result.configuracao.telefone, 'success');
                } else {
                    showStatus('❌ Erro na configuração', 'error');
                }
            } catch (error) {
                showStatus('❌ Erro ao testar config', 'error');
            }
        }

        async function testEnrich() {
            showStatus('Criando empresa teste...', 'info');
            
            try {
                const createResponse = await fetch('/create-test-company', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const createResult = await createResponse.json();
                
                if (createResponse.ok) {
                    showStatus('✅ Empresa criada: ' + createResult.companyId, 'success');
                    
                    setTimeout(async () => {
                        showStatus('Enriquecendo empresa...', 'info');
                        
                        const enrichResponse = await fetch('/enrich', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ companyId: createResult.companyId })
                        });
                        const enrichResult = await enrichResponse.json();
                        
                        if (enrichResponse.ok) {
                            showStatus('🎉 Enriquecimento concluído!', 'success');
                        } else {
                            showStatus('❌ Erro no enriquecimento: ' + enrichResult.error, 'error');
                        }
                    }, 1500);
                } else {
                    showStatus('❌ Erro ao criar empresa: ' + createResult.error, 'error');
                }
            } catch (error) {
                showStatus('❌ Erro no teste', 'error');
            }
        }

        function showStatus(message, type) {
            document.getElementById('status').innerHTML = 
                '<div class="status ' + type + '">' + message + '</div>';
            
            if (type === 'success') {
                setTimeout(() => {
                    document.getElementById('status').innerHTML = '';
                }, 5000);
            }
        }
    </script>
</body>
</html>
  `);
});

// ⚡ Status das configurações
app.get('/api/config-status', (req, res) => {
  res.json({
    success: true,
    configuracao: {
      modo: mappingMode,
      telefone: telefoneMapping,
      version: '3.0'
    }
  });
});

// ⚡ Criar campo teste_cnpj
app.post('/create-test-field', async (req, res) => {
  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Token não configurado' });
  }

  try {
    const response = await axios.post(
      'https://api.hubapi.com/crm/v3/properties/companies',
      {
        name: 'teste_cnpj',
        label: 'Teste CNPJ v3',
        type: 'string',
        fieldType: 'textarea',
        description: 'Campo para dados do CNPJ v3',
        groupName: 'companyinformation'
      },
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      success: true,
      message: 'Campo teste_cnpj criado com sucesso!'
    });
  } catch (error) {
    if (error.response?.status === 409) {
      res.json({
        success: true,
        message: 'Campo teste_cnpj já existe'
      });
    } else {
      res.status(500).json({
        error: 'Erro ao criar campo',
        details: error.response?.data
      });
    }
  }
});

// ⚡ Criar empresa teste
app.post('/create-test-company', async (req, res) => {
  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Token não configurado' });
  }

  try {
    const response = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/companies',
      {
        properties: {
          name: 'Empresa Teste v3 - ' + Date.now(),
          cnpj: '14665903000104',
          domain: 'teste.com.br'
        }
      },
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      success: true,
      companyId: response.data.id,
      message: 'Empresa criada com sucesso'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Erro ao criar empresa',
      details: error.response?.data
    });
  }
});

// ⚡ ENRICHMENT PRINCIPAL
app.post('/enrich', async (req, res) => {
  const { companyId } = req.body;

  if (!companyId) {
    return res.status(400).json({ error: 'Company ID obrigatório' });
  }

  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Token não configurado' });
  }

  try {
    // Buscar empresa
    const hubspotCompany = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/companies/${companyId}?properties=cnpj,name`,
      {
        headers: { 
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const properties = hubspotCompany.data.properties;
    const cnpjRaw = properties.cnpj;
    
    if (!cnpjRaw) {
      return res.status(400).json({ error: 'CNPJ não encontrado na empresa' });
    }

    const cnpjLimpo = cleanCNPJ(cnpjRaw);
    
    if (cnpjLimpo.length !== 14) {
      return res.status(400).json({ error: 'CNPJ inválido' });
    }

    // Buscar dados do CNPJ
    const cnpjDataResponse = await axios.get(`https://publica.cnpj.ws/cnpj/${cnpjLimpo}`, {
      timeout: 10000,
      headers: { 'User-Agent': 'CNPJ-Enricher/3.0' }
    });

    const cnpjData = cnpjDataResponse.data;
    
    // Preparar dados
    const telefoneFormatado = cnpjData.estabelecimento?.telefone1 ? 
      `(${cnpjData.estabelecimento.ddd1}) ${cnpjData.estabelecimento.telefone1}` : '';

    let updatePayload = { properties: {} };

    if (mappingMode === 'campo_unico') {
      // Salvar tudo no teste_cnpj
      updatePayload.properties.teste_cnpj = formatCNPJData(cnpjData, cnpjLimpo);
    } else {
      // Salvar em campos separados
      updatePayload.properties = {
        name: cnpjData.razao_social || properties.name,
        description: cnpjData.estabelecimento?.nome_fantasia || '',
        city: cnpjData.estabelecimento?.cidade?.nome || '',
        state: cnpjData.estabelecimento?.estado?.sigla || ''
      };
    }

    // SEMPRE salvar telefone no campo selecionado
    if (telefoneFormatado && telefoneMapping) {
      updatePayload.properties[telefoneMapping] = telefoneFormatado;
    }

    // Atualizar empresa
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

    res.json({ 
      success: true,
      message: 'Empresa enriquecida com sucesso!',
      cnpj: cnpjLimpo,
      configuracao: {
        modo: mappingMode,
        telefoneField: telefoneMapping
      }
    });

  } catch (error) {
    console.error('❌ Erro no enriquecimento:', error.message);
    
    if (error.response?.status === 429 && error.config?.url?.includes('cnpj.ws')) {
      return res.status(200).json({ 
        success: true,
        message: 'CNPJ válido! Rate limit atingido - tente em alguns minutos'
      });
    }
    
    res.status(500).json({ 
      error: 'Erro ao enriquecer dados',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 CNPJ Enricher v3.0 na porta ${PORT}`));
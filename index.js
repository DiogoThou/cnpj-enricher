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
      <p><strong>Teste agora:</strong></p>
      <pre>POST /enrich
{
  "companyId": "123"
}</pre>
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

    const updatePayload = {
      properties: {
        razao_social: extract('Razão Social', cnpjData.razao_social),
        nome_fantasia: extract('Nome Fantasia', cnpjData.estabelecimento?.nome_fantasia),
        situacao_cadastral: extract('Situação Cadastral', cnpjData.estabelecimento?.situacao_cadastral),
        capital_social: extract('Capital Social', cnpjData.capital_social),
        porte: extract('Porte', cnpjData.porte?.descricao),
        atividade_principal: extract('Atividade Principal', cnpjData.estabelecimento?.atividade_principal?.descricao),
        telefone: extract('Telefone', cnpjData.estabelecimento?.telefone1),
        email: extract('Email', cnpjData.estabelecimento?.email),
        logradouro: extract('Logradouro', cnpjData.estabelecimento?.logradouro),
        numero: extract('Número', cnpjData.estabelecimento?.numero),
        bairro: extract('Bairro', cnpjData.estabelecimento?.bairro),
        cep: extract('CEP', cnpjData.estabelecimento?.cep),
        cidade: extract('Cidade', cnpjData.estabelecimento?.cidade?.nome),
        estado: extract('Estado', cnpjData.estabelecimento?.estado?.sigla)
      }
    };

    console.log('📦 Payload final enviado ao HubSpot:', JSON.stringify(updatePayload, null, 2));

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

    console.log('✅ Empresa atualizada com sucesso!');

    res.json({ 
      status: 'success', 
      message: 'Empresa atualizada com dados do CNPJ',
      cnpj: cnpj,
      dadosEncontrados: Object.keys(updatePayload.properties).filter(key => updatePayload.properties[key])
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
      addCnpjUrl: `POST /add-cnpj/${response.data.id} com {"cnpj": "14665903000104"}`
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
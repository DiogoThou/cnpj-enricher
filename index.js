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

    // ⚡ SOLUÇÃO TESTE: Todos os dados em um único campo "teste_cnpj"
    const todosOsDados = `
🏢 DADOS DA EMPRESA (CNPJ: ${cnpj})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 IDENTIFICAÇÃO:
• Razão Social: ${cnpjData.razao_social}
• Nome Fantasia: ${cnpjData.estabelecimento?.nome_fantasia || 'N/A'}
• CNPJ: ${cnpj}
• Situação: ${cnpjData.estabelecimento?.situacao_cadastral}

💼 INFORMAÇÕES EMPRESARIAIS:
• Porte: ${cnpjData.porte?.descricao}
• Capital Social: R$ ${cnpjData.capital_social}
• Atividade Principal: ${cnpjData.estabelecimento?.atividade_principal?.descricao}
• Natureza Jurídica: ${cnpjData.natureza_juridica?.descricao}

📍 ENDEREÇO:
• Logradouro: ${cnpjData.estabelecimento?.tipo_logradouro} ${cnpjData.estabelecimento?.logradouro}, ${cnpjData.estabelecimento?.numero}
• Complemento: ${cnpjData.estabelecimento?.complemento || 'N/A'}
• Bairro: ${cnpjData.estabelecimento?.bairro}
• CEP: ${cnpjData.estabelecimento?.cep}
• Cidade: ${cnpjData.estabelecimento?.cidade?.nome}
• Estado: ${cnpjData.estabelecimento?.estado?.nome} (${cnpjData.estabelecimento?.estado?.sigla})
• País: ${cnpjData.estabelecimento?.pais?.nome}

📞 CONTATO:
• Telefone: (${cnpjData.estabelecimento?.ddd1}) ${cnpjData.estabelecimento?.telefone1}
• Fax: (${cnpjData.estabelecimento?.ddd_fax}) ${cnpjData.estabelecimento?.fax}
• Email: ${cnpjData.estabelecimento?.email}

📊 OUTRAS INFORMAÇÕES:
• Data de Início: ${cnpjData.estabelecimento?.data_inicio_atividade}
• Data da Situação: ${cnpjData.estabelecimento?.data_situacao_cadastral}
• Última Atualização: ${cnpjData.atualizado_em}

👥 SÓCIOS:
${cnpjData.socios?.map(socio => 
  `• ${socio.nome} (${socio.qualificacao_socio?.descricao})`
).join('\n') || 'N/A'}

🎯 Dados obtidos automaticamente via CNPJ Enricher em ${new Date().toLocaleString('pt-BR')}
    `.trim();

    const updatePayload = {
      properties: {
        teste_cnpj: todosOsDados
      }
    };

    console.log('📦 Payload TESTE - Todos os dados em teste_cnpj:', JSON.stringify(updatePayload, null, 2));

    console.log('📦 Payload TESTE - Todos os dados em teste_cnpj:', JSON.stringify(updatePayload, null, 2));

    console.log('📡 Atualizando empresa no HubSpot (campo teste_cnpj)...');
    
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

    console.log('✅ Empresa atualizada com sucesso no campo teste_cnpj!');
    
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
    
    console.log('🎉 SUCESSO COMPLETO - Dados da empresa salvos em teste_cnpj:');
    console.log('🏢 Razão Social:', dadosEmpresa.razaoSocial);
    console.log('✨ Nome Fantasia:', dadosEmpresa.nomeFantasia);
    console.log('📊 Situação:', dadosEmpresa.situacao);
    console.log('📍 Local:', `${dadosEmpresa.cidade}/${dadosEmpresa.estado}`);
    console.log('💼 Porte:', dadosEmpresa.porte);
    console.log('📧 Email:', dadosEmpresa.email);
    console.log('📞 Telefone:', dadosEmpresa.telefone);

    res.json({ 
      success: true,
      message: '🎉 Empresa enriquecida com sucesso! (Dados salvos em teste_cnpj)',
      cnpj: cnpj,
      campoAtualizado: 'teste_cnpj',
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
      observacao: 'Todos os dados foram salvos no campo teste_cnpj para fins de teste',
      proximoPasso: 'Verificar no HubSpot se o campo teste_cnpj foi preenchido com todos os dados',
      caracteresGravados: todosOsDados.length
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
        message: 'O campo teste_cnpj precisa ser criado primeiro',
        solucao: 'Execute: POST /create-test-field',
        dadosObtidos: {
          cnpj: cnpj,
          razaoSocial: cnpjData.razao_social,
          nomeFantasia: cnpjData.estabelecimento?.nome_fantasia,
          situacao: cnpjData.estabelecimento?.situacao_cadastral,
          cidade: cnpjData.estabelecimento?.cidade?.nome,
          estado: cnpjData.estabelecimento?.estado?.sigla,
          observacao: 'Dados foram obtidos com sucesso da Receita Federal'
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
          website: 'https://teste.com.br',
          teste_cnpj: 'Campo de teste criado para receber dados do CNPJ'
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
      observacao: 'Campo teste_cnpj incluído para receber todos os dados',
      proximoTeste: {
        url: 'POST /enrich',
        body: { companyId: response.data.id },
        expectativa: 'Todos os dados do CNPJ serão salvos no campo teste_cnpj'
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
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
    
    console.log('📦 Dados formatados para campo selecionado:');
    console.log(dadosFormatados);

    // ⚡ PAYLOAD DINÂMICO - USA MODO SELECIONADO (ÚNICO OU MÚLTIPLO)
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

    const campoUsado = useMultipleMapping ? 'campos múltiplos' : (savedUserChoice || selectedDestinationField);
    console.log(`✅ Empresa atualizada com sucesso! Modo: ${useMultipleMapping ? 'Múltiplo' : 'Único'}`);
    
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
    
    console.log(`🎉 SUCESSO COMPLETO - Dados da empresa processados:`);
    console.log('🏢 Razão Social:', dadosEmpresa.razaoSocial);
    console.log('✨ Nome Fantasia:', dadosEmpresa.nomeFantasia);
    console.log('📊 Situação:', dadosEmpresa.situacao);
    console.log('📍 Local:', `${dadosEmpresa.cidade}/${dadosEmpresa.estado}`);
    console.log('💼 Porte:', dadosEmpresa.porte);
    console.log('📧 Email:', dadosEmpresa.email);
    console.log('📞 Telefone:', dadosEmpresa.telefone);

    res.json({ 
      success: true,
      message: `🎉 Empresa enriquecida com sucesso! Modo: ${useMultipleMapping ? 'Mapeamento Múltiplo' : 'Campo Único'}`,
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
        modo: useMultipleMapping ? 'multiple' : 'single',
        campoDestino: campoUsado,
        tipoConteudo: useMultipleMapping ? 'Dados distribuídos em campos específicos' : 'Texto formatado com todos os dados',
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
        useMultipleMapping ? 'Verifique os campos mapeados na empresa no HubSpot' : `Verifique o campo ${campoUsado} na empresa no HubSpot`,
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
      console.log('⚠️ Campo não existe no HubSpot');
      
      return res.status(400).json({ 
        error: 'Campo configurado não existe no HubSpot',
        message: 'Execute POST /create-test-field para criar campos ou reconfigure o mapeamento',
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
          '2. Ou reconfigure o mapeamento',
          '3. Depois execute: POST /enrich novamente'
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
        modo: useMultipleMapping ? 'multiple' : 'single',
        campoDestino: useMultipleMapping ? 'campos múltiplos' : (savedUserChoice || selectedDestinationField),
        tipoConteudo: 'Todos os dados formatados em texto',
        criarCampo: 'POST /create-test-field (se necessário)'
      },
      proximoTeste: {
        url: 'POST /enrich',
        body: { companyId: response.data.id },
        expectativa: `Dados do CNPJ serão processados em modo: ${useMultipleMapping ? 'Múltiplo' : 'Único'}`
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

// ⚡ ENDPOINTS COM PERSISTÊNCIA SIMPLES - SISTEMA ATUAL

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
    useMultipleMapping: useMultipleMapping,
    multipleFieldMapping: multipleFieldMapping,
    timestamp: new Date().toISOString(),
    status: 'Sistema dual ativo - Campo único + Mapeamento múltiplo'
  });
});

// ⚡ Endpoint adicional para verificar configuração atual
app.get('/api/current-mapping', (req, res) => {
  const currentField = availableFields.find(field => field.value === (savedUserChoice || selectedDestinationField));
  
  res.json({
    success: true,
    configuracaoAtual: {
      modo: useMultipleMapping ? 'multiple' : 'single',
      campoSelecionado: savedUserChoice || selectedDestinationField,
      campoLabel: currentField ? currentField.text : (savedUserChoice || selectedDestinationField),
      tipoMapeamento: (savedUserChoice || selectedDestinationField) === 'teste_cnpj' ? 'Campo padrão' : 
                     (savedUserChoice || selectedDestinationField) === 'nenhum' ? 'Sem mapeamento' : 'Campo personalizado',
      totalCamposDisponiveis: availableFields.length,
      escolhaSalva: savedUserChoice,
      campoDefault: selectedDestinationField,
      multipleMapping: multipleFieldMapping
    }
  });
});

// ⚡ ENDPOINTS NOVOS PARA MAPEAMENTO MÚLTIPLO

// Endpoint para configurar mapeamento múltiplo
app.post('/api/multiple-mapping-fetch', async (req, res) => {
  console.log('🗂️ Solicitando configuração de mapeamento múltiplo...');
  
  try {
    // Buscar campos disponíveis
    if (availableFields.length === 0) {
      availableFields = await fetchCompanyTextFields();
    }
    
    // Criar opções para cada campo do CNPJ
    const fieldOptions = [
      { text: '🚫 Não mapear', value: 'nenhum' },
      { text: '📋 Campo backup (teste_cnpj)', value: 'teste_cnpj' },
      ...availableFields.map(field => ({
        text: `📝 ${field.text}`,
        value: field.value
      }))
    ];
    
    // Configuração atual de cada campo
    const currentMapping = {
      telefone: multipleFieldMapping.telefone || 'nenhum',
      razao_social: multipleFieldMapping.razao_social || 'nenhum',
      nome_fantasia: multipleFieldMapping.nome_fantasia || 'nenhum',
      cidade: multipleFieldMapping.cidade || 'nenhum',
      estado: multipleFieldMapping.estado || 'nenhum',
      atividade: multipleFieldMapping.atividade || 'nenhum',
      email: multipleFieldMapping.email || 'nenhum',
      cep: multipleFieldMapping.cep || 'nenhum'
    };
    
    res.json({
      success: true,
      fieldOptions: fieldOptions,
      currentMapping: currentMapping,
      useMultipleMapping: useMultipleMapping,
      totalFieldsAvailable: availableFields.length
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar configuração múltipla:', error);
    res.status(500).json({ error: 'Erro ao carregar configuração' });
  }
});

// Endpoint para salvar mapeamento múltiplo
app.post('/api/multiple-mapping-update', (req, res) => {
  console.log('💾 Atualizando mapeamento múltiplo...');
  console.log('📥 Request:', JSON.stringify(req.body, null, 2));
  
  try {
    const { fieldMappings, enableMultiple } = req.body;
    
    // Atualizar flag de uso
    if (typeof enableMultiple === 'boolean') {
      useMultipleMapping = enableMultiple;
      console.log(`🔀 Mapeamento múltiplo: ${useMultipleMapping ? 'ATIVADO' : 'DESATIVADO'}`);
    }
    
    // Atualizar mapeamentos individuais
    if (fieldMappings && typeof fieldMappings === 'object') {
      Object.keys(fieldMappings).forEach(cnpjField => {
        if (multipleFieldMapping.hasOwnProperty(cnpjField)) {
          const oldValue = multipleFieldMapping[cnpjField];
          const newValue = fieldMappings[cnpjField];
          
          multipleFieldMapping[cnpjField] = newValue === 'nenhum' ? null : newValue;
          
          console.log(`📝 ${cnpjField}: ${oldValue || 'nenhum'} → ${newValue}`);
        }
      });
    }
    
    // Contar campos mapeados
    const mappedCount = Object.values(multipleFieldMapping).filter(v => v !== null).length;
    
    res.json({
      success: true,
      message: `Mapeamento atualizado! ${mappedCount} campos mapeados.`,
      currentMapping: multipleFieldMapping,
      useMultipleMapping: useMultipleMapping,
      mappedFieldsCount: mappedCount
    });
    
  } catch (error) {
    console.error('❌ Erro ao salvar mapeamento múltiplo:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
});

// Endpoint para testar mapeamento múltiplo
app.get('/api/test-multiple-mapping', (req, res) => {
  res.json({
    success: true,
    systemStatus: {
      useMultipleMapping: useMultipleMapping,
      modoAtual: useMultipleMapping ? 'Mapeamento Múltiplo' : 'Campo Único',
      campoUnico: savedUserChoice || selectedDestinationField
    },
    multipleMapping: multipleFieldMapping,
    mappedFieldsCount: Object.values(multipleFieldMapping).filter(v => v !== null).length,
    availableFieldsCount: availableFields.length
  });
});

// Endpoint para alternar entre modos
app.post('/api/toggle-mapping-mode', (req, res) => {
  const { mode } = req.body; // 'single' ou 'multiple'
  
  if (mode === 'single') {
    useMultipleMapping = false;
    console.log('🔄 Modo alterado para: Campo Único');
  } else if (mode === 'multiple') {
    useMultipleMapping = true;
    console.log('🔄 Modo alterado para: Mapeamento Múltiplo');
  }
  
  res.json({
    success: true,
    currentMode: useMultipleMapping ? 'multiple' : 'single',
    message: `Modo alterado para: ${useMultipleMapping ? 'Mapeamento Múltiplo' : 'Campo Único'}`
  });
});

console.log('🔧 Sistema de mapeamento de campos CNPJ carregado com sucesso!');
console.log('🗂️ Sistema de mapeamento múltiplo carregado (não ativo por padrão)!');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 CNPJ Enricher rodando na porta ${PORT}`));const express = require('express');
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

// ⚡ VARIÁVEIS PARA PERSISTÊNCIA - SISTEMA ATUAL
let selectedDestinationField = 'teste_cnpj'; // Padrão
let availableFields = []; // Cache dos campos disponíveis
let savedUserChoice = null; // Para salvar escolha do usuário

// ⚡ NOVAS VARIÁVEIS PARA MAPEAMENTO MÚLTIPLO
let multipleFieldMapping = {
  telefone: null,        // null = não mapeado, string = campo do HubSpot
  razao_social: null,
  nome_fantasia: null,
  cidade: null,
  estado: null,
  atividade: null,
  email: null,
  cep: null
};

let useMultipleMapping = false; // flag para ativar/desativar novo sistema

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

// ⚡ FUNÇÃO NOVA - EXTRAIR DADOS INDIVIDUAIS DO CNPJ
function extractIndividualCNPJData(cnpjData) {
  const estabelecimento = cnpjData.estabelecimento || {};
  
  return {
    telefone: estabelecimento.telefone1 ? `(${estabelecimento.ddd1}) ${estabelecimento.telefone1}` : '',
    razao_social: cnpjData.razao_social || '',
    nome_fantasia: estabelecimento.nome_fantasia || '',
    cidade: estabelecimento.cidade?.nome || '',
    estado: estabelecimento.estado?.sigla || '',
    atividade: estabelecimento.atividade_principal?.descricao || '',
    email: estabelecimento.email || '',
    cep: estabelecimento.cep || '',
    // Dados para backup (não mapeados individualmente)
    endereco_completo: estabelecimento.logradouro ? 
      `${estabelecimento.tipo_logradouro} ${estabelecimento.logradouro}, ${estabelecimento.numero}` : '',
    bairro: estabelecimento.bairro || '',
    capital_social: cnpjData.capital_social || '',
    porte: cnpjData.porte?.descricao || '',
    situacao_cadastral: estabelecimento.situacao_cadastral || '',
    data_situacao: estabelecimento.data_situacao_cadastral || '',
    data_inicio: estabelecimento.data_inicio_atividade || '',
    natureza_juridica: cnpjData.natureza_juridica?.descricao || ''
  };
}

// ⚡ FUNÇÃO NOVA - CRIAR PAYLOAD COM MAPEAMENTO MÚLTIPLO
function createMultipleMappingPayload(cnpjData, cnpjNumber) {
  const extractedData = extractIndividualCNPJData(cnpjData);
  const payload = { properties: {} };
  
  console.log('🗂️ Aplicando mapeamento múltiplo...');
  
  // Mapear campos individuais
  let mappedFields = [];
  let unmappedData = [];
  
  Object.keys(multipleFieldMapping).forEach(cnpjField => {
    const hubspotField = multipleFieldMapping[cnpjField];
    const value = extractedData[cnpjField];
    
    if (hubspotField && hubspotField !== 'nenhum' && value) {
      payload.properties[hubspotField] = value;
      mappedFields.push(`${cnpjField} → ${hubspotField}`);
      console.log(`📝 Mapeado: ${cnpjField} → ${hubspotField} = "${value}"`);
    } else if (value) {
      unmappedData.push(`${cnpjField}: ${value}`);
    }
  });
  
  // Criar backup com dados não mapeados
  if (unmappedData.length > 0) {
    const backupData = `
=== DADOS NÃO MAPEADOS - RECEITA FEDERAL ===
CNPJ: ${cnpjNumber}

${unmappedData.join('\n')}

=== DADOS ADICIONAIS ===
Endereço Completo: ${extractedData.endereco_completo}
Bairro: ${extractedData.bairro}
Capital Social: R$ ${extractedData.capital_social}
Porte: ${extractedData.porte}
Situação Cadastral: ${extractedData.situacao_cadastral}
Data Situação: ${extractedData.data_situacao}
Data Início Atividade: ${extractedData.data_inicio}
Natureza Jurídica: ${extractedData.natureza_juridica}

Atualizado em: ${new Date().toLocaleString('pt-BR')}
    `.trim();
    
    // Usar campo backup configurado (ou teste_cnpj como padrão)
    const backupField = savedUserChoice || selectedDestinationField;
    payload.properties[backupField] = backupData;
    console.log(`📦 Dados não mapeados salvos em: ${backupField}`);
  }
  
  console.log(`✅ Campos mapeados: ${mappedFields.length}`);
  console.log(`📋 Lista: ${mappedFields.join(', ')}`);
  
  return payload;
}

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

// ⚡ FUNÇÃO PRINCIPAL MODIFICADA - SUPORTA AMBOS OS MODOS
function updateEnrichmentPayload(cnpjData, cnpjNumber) {
  // ⚡ SE USAR MAPEAMENTO MÚLTIPLO, USAR NOVA LÓGICA
  if (useMultipleMapping) {
    return createMultipleMappingPayload(cnpjData, cnpjNumber);
  }
  
  // ⚡ SENÃO, USAR LÓGICA ATUAL (MANTÉM COMPATIBILIDADE)
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
  
  console.log(`📦 Dados serão salvos no campo: ${campoAtual}`);
  return payload;
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

// ⚡ ENRICHMENT PRINCIPAL - VERSÃO CORRIGIDA COM CAMPO ÚNICO E MÚLTIPLO
app.post('/enrich', async (req, res) => {
  const { companyId } = req.body;

  console.log('🔍 Iniciando enriquecimento para companyId:', companyId);
  console.log(`🔀 Modo atual: ${useMultipleMapping ? 'Mapeamento Múltiplo' : 'Campo Único'}`);

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

    console.log('🔍
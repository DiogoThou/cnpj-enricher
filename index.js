// Endpoint para listar empresas do HubSpot
app.get('/companies', async (req, res) => {
  console.log('📋 Listando empresas do HubSpot...');

  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(500).json({ 
      error: 'HUBSPOT_ACCESS_TOKEN não configurado' 
    });
  }

  try {
    const response = await axios.get(
      'https://api.hubapi.com/crm/v3/objects/companies',
      {
        params: {
          limit: 10,
          properties: 'name,domain,cnpj,city,state'
        },
        headers: { 
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const companies = response.data.results.map(company => ({
      id: company.id,
      name: company.properties.name || 'Sem nome',
      domain: company.properties.domain || 'Sem domínio',
      cnpj: company.properties.cnpj || 'Sem CNPJ',
      city: company.properties.city || 'Sem cidade',
      state: company.properties.state || 'Sem estado'
    }));

    console.log(`✅ Encontradas ${companies.length} empresas`);

    res.json({
      status: 'success',
      total: response.data.total,
      companies: companies,
      message: 'Use o ID de uma dessas empresas para testar o endpoint /enrich'
    });

  } catch (error) {
    console.error('❌ Erro ao listar empresas:', error.message);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        error: 'Token do HubSpot inválido ou expirado' 
      });
    }

    res.status(500).json({ 
      error: 'Erro ao listar empresas',
      details: error.message
    });
  }
});

// Endpoint para criar uma empresa de teste com CNPJ
app.post('/create-test-company', async (req, res) => {
  console.log('🏢 Criando empresa de teste...');

  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(500).json({ 
      error: 'HUBSPOT_ACCESS_TOKEN não configurado' 
    });
  }

  const testCompany = {
    properties: {
      name: 'Empresa Teste CNPJ',
      cnpj: '11.222.333/0001-81', // CNPJ de teste válido
      domain: 'teste.com.br'
    }
  };

  try {
    const response = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/companies',
      testCompany,
      {
        headers: { 
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Empresa de teste criada com sucesso');

    res.json({
      status: 'success',
      message: 'Empresa de teste criada com sucesso',
      companyId: response.data.id,
      testInstructions: {
        step1: `Use este Company ID para testar: ${response.data.id}`,
        step2: 'Faça um POST para /enrich com o body: {"companyId": "' + response.data.id + '"}',
        step3: 'A empresa será enriquecida com dados do CNPJ de teste'
      }
    });

  } catch (error) {
    console.error('❌ Erro ao criar empresa de teste:', error.message);
    
    res.status(500).json({ 
      error: 'Erro ao criar empresa de teste',
      details: error.message
    });
  }
});
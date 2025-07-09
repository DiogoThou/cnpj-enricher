// ⚡ Rotas de enriquecimento organizadas
const express = require('express');
const router = express.Router();
const HubSpotService = require('../services/hubspotService');
const CNPJApiService = require('../services/cnpjApiService');
const { validateCNPJ, formatCNPJData, extractCompanyData } = require('../utils/cnpjFormatter');
const { asyncHandler } = require('../middleware/errorHandler');

const cnpjApi = new CNPJApiService();

// ⚡ Endpoint principal de enriquecimento
router.post('/enrich', asyncHandler(async (req, res) => {
  const { companyId } = req.body;

  if (!companyId) {
    return res.status(400).json({ 
      error: 'Company ID é obrigatório',
      code: 'MISSING_COMPANY_ID'
    });
  }

  if (!req.hubspotToken) {
    return res.status(401).json({
      error: 'Token do HubSpot não configurado',
      code: 'MISSING_TOKEN'
    });
  }

  console.log('🔍 Iniciando enriquecimento para companyId:', companyId);

  const hubspot = new HubSpotService(req.hubspotToken);
  
  // Buscar empresa no HubSpot
  const company = await hubspot.getCompany(companyId);
  console.log('✅ Empresa encontrada no HubSpot');

  // Encontrar CNPJ na empresa
  const cnpjRaw = hubspot.findCNPJInProperties(company.properties);
  
  if (!cnpjRaw) {
    return res.status(400).json({
      error: 'CNPJ não encontrado na empresa',
      code: 'CNPJ_NOT_FOUND_IN_COMPANY',
      companyId: companyId,
      availableProperties: Object.keys(company.properties),
      solution: `Use POST /add-cnpj/${companyId} para adicionar CNPJ`
    });
  }

  // Validar CNPJ
  const validation = validateCNPJ(cnpjRaw);
  if (!validation.valid) {
    return res.status(400).json({
      error: validation.error,
      code: 'INVALID_CNPJ',
      cnpjProvided: cnpjRaw
    });
  }

  const cnpj = validation.cnpj;
  console.log('✅ CNPJ válido encontrado:', cnpj);

  // Verificar status do rate limit antes de fazer a consulta
  const rateLimitStatus = cnpjApi.getRateLimitStatus();
  
  if (!rateLimitStatus.canMakeRequest) {
    return res.status(429).json({
      error: 'Rate limit de consultas CNPJ',
      code: 'RATE_LIMIT_WAIT',
      message: `Aguarde ${rateLimitStatus.waitTimeFormatted} para nova consulta`,
      waitTime: rateLimitStatus.waitTime,
      requestsInWindow: rateLimitStatus.requestsInWindow,
      maxRequests: rateLimitStatus.maxRequests,
      retryAfter: Math.ceil(rateLimitStatus.waitTime / 1000),
      cnpjFound: cnpj,
      companyId: companyId,
      solution: 'Aguarde o tempo indicado e tente novamente'
    });
  }

  // Buscar dados na API CNPJ
  const cnpjData = await cnpjApi.getCNPJData(cnpj);
  
  // Formatar dados para o campo teste_cnpj
  const formattedData = formatCNPJData(cnpjData, cnpj);
  
  // Atualizar empresa no HubSpot
  await hubspot.updateCompany(companyId, {
    teste_cnpj: formattedData
  });

  console.log('✅ Empresa enriquecida com sucesso!');

  // Extrair dados para resposta
  const companyData = extractCompanyData(cnpjData);

  res.json({
    success: true,
    message: '🎉 Empresa enriquecida com sucesso!',
    cnpj: cnpj,
    companyId: companyId,
    empresa: companyData,
    fieldUpdated: 'teste_cnpj',
    rateLimitInfo: {
      requestsRemaining: cnpjApi.maxRequestsPerMinute - cnpjApi.requestHistory.length,
      nextWindowReset: new Date(Date.now() + rateLimitStatus.windowTimeRemaining).toLocaleString('pt-BR')
    },
    timestamp: new Date().toISOString()
  });
}));

// ⚡ Criar empresa de teste
router.post('/create-test-company', asyncHandler(async (req, res) => {
  if (!req.hubspotToken) {
    return res.status(401).json({
      error: 'Token não configurado',
      code: 'MISSING_TOKEN'
    });
  }

  const hubspot = new HubSpotService(req.hubspotToken);
  
  const company = await hubspot.createCompany({
    name: `Empresa Teste CNPJ - ${new Date().getTime()}`,
    cnpj: '14665903000104',
    domain: 'teste.com.br',
    phone: '11999999999',
    website: 'https://teste.com.br'
  });

  console.log('✅ Empresa de teste criada:', company.id);

  res.json({
    success: true,
    companyId: company.id,
    message: 'Empresa de teste criada com sucesso',
    cnpj: '14665903000104',
    nextStep: {
      action: 'POST /api/enrich',
      payload: { companyId: company.id }
    }
  });
}));

// ⚡ Criar campo teste_cnpj
router.post('/create-test-field', asyncHandler(async (req, res) => {
  if (!req.hubspotToken) {
    return res.status(401).json({
      error: 'Token não configurado',
      code: 'MISSING_TOKEN'
    });
  }

  const hubspot = new HubSpotService(req.hubspotToken);
  
  const fieldData = {
    name: 'teste_cnpj',
    label: 'Dados CNPJ',
    type: 'string',
    fieldType: 'textarea',
    description: 'Dados completos do CNPJ da Receita Federal',
    groupName: 'companyinformation',
    hasUniqueValue: false,
    hidden: false,
    displayOrder: -1
  };

  const result = await hubspot.createProperty(fieldData);

  res.json({
    success: true,
    message: result.status === 'already_exists' ? 
      'Campo teste_cnpj já existe' : 
      'Campo teste_cnpj criado com sucesso',
    fieldName: 'teste_cnpj',
    status: result.status || 'created'
  });
}));

// ⚡ Testar API CNPJ com rate limit
router.get('/test-cnpj/:cnpj', asyncHandler(async (req, res) => {
  const { cnpj } = req.params;
  
  const validation = validateCNPJ(cnpj);
  if (!validation.valid) {
    return res.status(400).json({
      error: validation.error,
      code: 'INVALID_CNPJ'
    });
  }

  // Verificar rate limit antes de testar
  const rateLimitStatus = cnpjApi.getRateLimitStatus();
  
  const result = await cnpjApi.testAPI(validation.cnpj);
  
  if (result.success) {
    res.json({
      success: true,
      cnpj: validation.cnpj,
      empresa: result.empresa,
      message: 'API CNPJ funcionando normalmente',
      rateLimitInfo: {
        requestsRemaining: cnpjApi.maxRequestsPerMinute - cnpjApi.requestHistory.length,
        canMakeRequest: rateLimitStatus.canMakeRequest,
        nextAvailable: rateLimitStatus.waitTimeFormatted
      }
    });
  } else {
    const statusCode = result.error.includes('Rate limit') ? 429 : 500;
    res.status(statusCode).json({
      success: false,
      error: result.error,
      cnpj: validation.cnpj,
      message: result.message,
      waitTime: result.waitTime,
      rateLimitInfo: result.requestsInWindow ? {
        requestsInWindow: result.requestsInWindow,
        maxRequests: result.maxRequests
      } : undefined
    });
  }
}));

// ⚡ Status do rate limit
router.get('/rate-limit-status', (req, res) => {
  const status = cnpjApi.getRateLimitStatus();
  const cacheStats = cnpjApi.getCacheStats();
  
  res.json({
    success: true,
    rateLimitStatus: status,
    cacheStats: cacheStats,
    apiLimits: {
      maxRequestsPerMinute: 3,
      delayBetweenRequests: '20 segundos',
      cacheExpiration: '1 hora'
    }
  });
});

// ⚡ Adicionar CNPJ a empresa
router.post('/add-cnpj/:companyId', asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { cnpj } = req.body;

  if (!cnpj) {
    return res.status(400).json({
      error: 'CNPJ é obrigatório',
      code: 'MISSING_CNPJ',
      example: { cnpj: '14665903000104' }
    });
  }

  const validation = validateCNPJ(cnpj);
  if (!validation.valid) {
    return res.status(400).json({
      error: validation.error,
      code: 'INVALID_CNPJ'
    });
  }

  if (!req.hubspotToken) {
    return res.status(401).json({
      error: 'Token não configurado',
      code: 'MISSING_TOKEN'
    });
  }

  const hubspot = new HubSpotService(req.hubspotToken);
  
  await hubspot.updateCompany(companyId, {
    cnpj: validation.cnpj
  });

  res.json({
    success: true,
    companyId: companyId,
    cnpjAdded: validation.cnpj,
    message: 'CNPJ adicionado com sucesso',
    nextStep: {
      action: 'POST /api/enrich',
      payload: { companyId: companyId }
    }
  });
}));

// ⚡ Debug empresa
router.get('/debug-company/:companyId', asyncHandler(async (req, res) => {
  const { companyId } = req.params;

  if (!req.hubspotToken) {
    return res.status(401).json({
      error: 'Token não configurado',
      code: 'MISSING_TOKEN'
    });
  }

  const hubspot = new HubSpotService(req.hubspotToken);
  const company = await hubspot.getCompany(companyId);
  
  const cnpjRaw = hubspot.findCNPJInProperties(company.properties);
  
  res.json({
    success: true,
    companyId: companyId,
    allProperties: company.properties,
    cnpjFound: cnpjRaw,
    cnpjValid: cnpjRaw ? validateCNPJ(cnpjRaw).valid : false,
    totalFields: Object.keys(company.properties).length,
    rateLimitStatus: cnpjApi.getRateLimitStatus()
  });
}));

module.exports = router;
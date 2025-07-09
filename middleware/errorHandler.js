// ⚡ Middleware para tratamento de erros
function errorHandler(err, req, res, next) {
  console.error('❌ Erro capturado pelo middleware:', err);

  // Erro de token inválido
  if (err.response?.status === 401) {
    return res.status(401).json({
      error: 'Token do HubSpot inválido ou expirado',
      code: 'INVALID_TOKEN',
      message: 'Execute OAuth novamente',
      authUrl: `https://app.hubspot.com/oauth/authorize?client_id=${process.env.CLIENT_ID}&scope=crm.objects.companies.read%20crm.objects.companies.write&redirect_uri=${process.env.REDIRECT_URI}`
    });
  }

  // Erro de empresa não encontrada
  if (err.response?.status === 404 && err.config?.url?.includes('hubapi.com')) {
    return res.status(404).json({
      error: 'Empresa não encontrada no HubSpot',
      code: 'COMPANY_NOT_FOUND',
      companyId: req.body.companyId || req.params.companyId
    });
  }

  // Erro de propriedades que não existem
  if (err.response?.status === 400 && err.response?.data?.message?.includes('does not exist')) {
    const missingProps = err.response.data.errors?.map(error => error.context?.propertyName) || [];
    
    return res.status(400).json({
      error: 'Propriedades não existem no HubSpot',
      code: 'PROPERTIES_NOT_FOUND',
      missingProperties: missingProps,
      solution: 'Execute POST /create-test-field para criar o campo teste_cnpj'
    });
  }

  // Rate limit excedido (controle interno)
  if (err.message === 'RATE_LIMIT_EXCEEDED') {
    const waitMinutes = Math.ceil(err.waitTime / 60000);
    const waitSeconds = Math.ceil((err.waitTime % 60000) / 1000);
    
    return res.status(429).json({
      error: 'Limite de consultas CNPJ excedido',
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Limite de ${err.maxRequests} consultas por minuto atingido`,
      waitTime: err.waitTime,
      waitTimeFormatted: `${waitMinutes} minuto(s) e ${waitSeconds} segundo(s)`,
      requestsInWindow: err.requestsInWindow,
      maxRequests: err.maxRequests,
      retryAfter: Math.ceil(err.waitTime / 1000),
      solution: 'Aguarde o tempo indicado antes de fazer nova consulta'
    });
  }

  // Rate limit da API CNPJ
  if (err.message === 'RATE_LIMIT_API') {
    return res.status(429).json({
      error: 'Rate limit atingido na API CNPJ',
      code: 'RATE_LIMIT_API',
      message: 'API CNPJ retornou rate limit (429)',
      waitTime: err.waitTime || 60000,
      waitTimeFormatted: '1 minuto',
      retryAfter: 60,
      solution: 'Aguarde 1 minuto e tente novamente'
    });
  }

  // CNPJ não encontrado
  if (err.message === 'CNPJ_NOT_FOUND') {
    return res.status(404).json({
      error: 'CNPJ não encontrado na Receita Federal',
      code: 'CNPJ_NOT_FOUND',
      message: 'Verifique se o CNPJ está correto'
    });
  }

  // Timeout
  if (err.code === 'ECONNABORTED') {
    return res.status(408).json({
      error: 'Timeout na requisição',
      code: 'TIMEOUT',
      message: 'Tente novamente em alguns minutos'
    });
  }

  // Erro genérico
  res.status(500).json({
    error: 'Erro interno do servidor',
    code: 'INTERNAL_ERROR',
    message: err.message,
    timestamp: new Date().toISOString()
  });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { errorHandler, asyncHandler };
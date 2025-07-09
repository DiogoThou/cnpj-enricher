// ⚡ Serviço para API CNPJ com cache, retry e controle rigoroso de rate limit
const axios = require('axios');

class CNPJApiService {
  constructor() {
    this.baseURL = 'https://publica.cnpj.ws/cnpj';
    this.cache = new Map();
    this.rateLimitDelay = 20000; // 20 segundos entre requests (3 por minuto)
    this.lastRequest = 0;
    this.requestCount = 0;
    this.requestWindow = 60000; // 1 minuto
    this.maxRequestsPerMinute = 3;
    this.requestHistory = [];
  }

  // Verificar se pode fazer nova requisição
  canMakeRequest() {
    const now = Date.now();
    
    // Limpar histórico antigo (mais de 1 minuto)
    this.requestHistory = this.requestHistory.filter(timestamp => 
      now - timestamp < this.requestWindow
    );
    
    // Verificar se já atingiu o limite de 3 por minuto
    if (this.requestHistory.length >= this.maxRequestsPerMinute) {
      const oldestRequest = Math.min(...this.requestHistory);
      const timeToWait = this.requestWindow - (now - oldestRequest);
      return { canRequest: false, waitTime: timeToWait };
    }
    
    // Verificar delay mínimo entre requests (20 segundos)
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      return { canRequest: false, waitTime: waitTime };
    }
    
    return { canRequest: true, waitTime: 0 };
  }

  async getCNPJData(cnpj) {
    // Verificar cache primeiro
    if (this.cache.has(cnpj)) {
      console.log('📦 Dados do CNPJ obtidos do cache');
      return this.cache.get(cnpj);
    }

    // Verificar se pode fazer requisição
    const requestCheck = this.canMakeRequest();
    
    if (!requestCheck.canRequest) {
      const waitMinutes = Math.ceil(requestCheck.waitTime / 60000);
      const waitSeconds = Math.ceil(requestCheck.waitTime / 1000);
      
      console.log(`⏳ Rate limit: ${this.requestHistory.length}/3 requests no último minuto`);
      console.log(`⏳ Aguarde ${waitMinutes} minuto(s) e ${waitSeconds % 60} segundo(s) para nova consulta`);
      
      const error = new Error('RATE_LIMIT_EXCEEDED');
      error.waitTime = requestCheck.waitTime;
      error.requestsInWindow = this.requestHistory.length;
      error.maxRequests = this.maxRequestsPerMinute;
      throw error;
    }

    try {
      console.log('📡 Buscando dados do CNPJ na API externa...');
      console.log(`📊 Requests no último minuto: ${this.requestHistory.length}/${this.maxRequestsPerMinute}`);
      
      const response = await axios.get(`${this.baseURL}/${cnpj}`, {
        timeout: 15000,
        headers: {
          'User-Agent': 'CNPJ-Enricher/2.0',
          'Accept': 'application/json'
        }
      });

      // Registrar requisição bem-sucedida
      const now = Date.now();
      this.lastRequest = now;
      this.requestHistory.push(now);
      
      console.log('✅ Dados do CNPJ obtidos com sucesso');
      console.log(`📊 Requests realizados: ${this.requestHistory.length}/${this.maxRequestsPerMinute} no último minuto`);
      
      // Salvar no cache por 1 hora
      this.cache.set(cnpj, response.data);
      setTimeout(() => this.cache.delete(cnpj), 3600000);
      
      return response.data;
      
    } catch (error) {
      // Registrar tentativa mesmo em caso de erro para controle de rate limit
      const now = Date.now();
      this.lastRequest = now;
      this.requestHistory.push(now);
      
      if (error.response?.status === 429) {
        console.log('⚠️ Rate limit atingido na API CNPJ (429)');
        const rateLimitError = new Error('RATE_LIMIT_API');
        rateLimitError.waitTime = 60000; // 1 minuto
        throw rateLimitError;
      }
      
      if (error.response?.status === 404) {
        console.log('⚠️ CNPJ não encontrado na Receita Federal');
        throw new Error('CNPJ_NOT_FOUND');
      }
      
      console.error('❌ Erro na API CNPJ:', error.response?.data);
      throw error;
    }
  }

  async testAPI(cnpj) {
    try {
      const data = await this.getCNPJData(cnpj);
      return {
        success: true,
        empresa: {
          razaoSocial: data.razao_social,
          nomeFantasia: data.estabelecimento?.nome_fantasia,
          situacao: data.estabelecimento?.situacao_cadastral
        }
      };
    } catch (error) {
      if (error.message === 'RATE_LIMIT_EXCEEDED') {
        return {
          success: false,
          error: 'Rate limit excedido',
          waitTime: error.waitTime,
          requestsInWindow: error.requestsInWindow,
          maxRequests: error.maxRequests,
          message: `Limite de ${error.maxRequests} consultas por minuto atingido. Aguarde ${Math.ceil(error.waitTime / 60000)} minuto(s).`
        };
      }
      
      if (error.message === 'RATE_LIMIT_API') {
        return {
          success: false,
          error: 'Rate limit da API',
          waitTime: error.waitTime,
          message: 'API retornou rate limit. Aguarde 1 minuto.'
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  clearCache() {
    this.cache.clear();
    this.requestHistory = [];
    console.log('🗑️ Cache da API CNPJ e histórico de requests limpos');
  }

  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      cachedCNPJs: Array.from(this.cache.keys()),
      requestsInLastMinute: this.requestHistory.length,
      maxRequestsPerMinute: this.maxRequestsPerMinute,
      lastRequestTime: new Date(this.lastRequest).toLocaleString('pt-BR'),
      nextRequestAvailable: new Date(this.lastRequest + this.rateLimitDelay).toLocaleString('pt-BR')
    };
  }

  getRateLimitStatus() {
    const now = Date.now();
    const requestCheck = this.canMakeRequest();
    
    return {
      canMakeRequest: requestCheck.canRequest,
      waitTime: requestCheck.waitTime,
      waitTimeFormatted: requestCheck.waitTime > 0 ? 
        `${Math.ceil(requestCheck.waitTime / 60000)} minuto(s) e ${Math.ceil((requestCheck.waitTime % 60000) / 1000)} segundo(s)` : 
        'Disponível agora',
      requestsInWindow: this.requestHistory.length,
      maxRequests: this.maxRequestsPerMinute,
      windowTimeRemaining: this.requestHistory.length > 0 ? 
        Math.max(0, this.requestWindow - (now - Math.min(...this.requestHistory))) : 0
    };
  }
}

module.exports = CNPJApiService;
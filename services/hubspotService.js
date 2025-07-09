// ⚡ Serviço para interações com HubSpot
const axios = require('axios');

class HubSpotService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseURL = 'https://api.hubapi.com';
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  async getCompany(companyId, properties = []) {
    const defaultProperties = ['cnpj', 'name', 'domain', 'website', 'phone', 'city', 'state', 'country'];
    const allProperties = [...defaultProperties, ...properties].join(',');
    
    try {
      const response = await axios.get(
        `${this.baseURL}/crm/v3/objects/companies/${companyId}?properties=${allProperties}`,
        { headers: this.getHeaders() }
      );
      
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao buscar empresa:', error.response?.data);
      throw error;
    }
  }

  async updateCompany(companyId, properties) {
    try {
      const response = await axios.patch(
        `${this.baseURL}/crm/v3/objects/companies/${companyId}`,
        { properties },
        { headers: this.getHeaders() }
      );
      
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao atualizar empresa:', error.response?.data);
      throw error;
    }
  }

  async createCompany(properties) {
    try {
      const response = await axios.post(
        `${this.baseURL}/crm/v3/objects/companies`,
        { properties },
        { headers: this.getHeaders() }
      );
      
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao criar empresa:', error.response?.data);
      throw error;
    }
  }

  async createProperty(propertyData) {
    try {
      const response = await axios.post(
        `${this.baseURL}/crm/v3/properties/companies`,
        propertyData,
        { headers: this.getHeaders() }
      );
      
      return response.data;
    } catch (error) {
      if (error.response?.status === 409) {
        console.log(`⚠️ Propriedade ${propertyData.name} já existe`);
        return { name: propertyData.name, status: 'already_exists' };
      }
      throw error;
    }
  }

  async testConnection() {
    try {
      const response = await axios.get(
        `${this.baseURL}/crm/v3/objects/companies?limit=1`,
        { headers: this.getHeaders() }
      );
      
      return {
        success: true,
        companiesFound: response.data.results.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data
      };
    }
  }

  findCNPJInProperties(properties) {
    // Procurar CNPJ em vários campos possíveis
    const cnpjFields = [
      'cnpj', 'CNPJ', 'registration_number', 'company_cnpj',
      'document_number', 'tax_id', 'federal_id'
    ];
    
    for (const field of cnpjFields) {
      if (properties[field]) {
        return properties[field];
      }
    }
    
    // Procurar em todos os campos por padrão de 14 dígitos
    for (const [key, value] of Object.entries(properties)) {
      if (value && typeof value === 'string') {
        const cleaned = value.replace(/[^\d]/g, '');
        if (cleaned.length === 14) {
          console.log(`🎯 CNPJ encontrado no campo "${key}": ${value} -> ${cleaned}`);
          return value;
        }
      }
    }
    
    return null;
  }
}

module.exports = HubSpotService;
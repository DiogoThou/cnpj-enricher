// ⚡ Utilitário para formatação de dados CNPJ
function cleanCNPJ(cnpjInput) {
  console.log('🧹 Limpando CNPJ:', cnpjInput, 'Tipo:', typeof cnpjInput);
  
  if (!cnpjInput) {
    console.log('🧹 CNPJ vazio ou null');
    return '';
  }
  
  const cnpjString = String(cnpjInput).trim();
  const cleaned = cnpjString.replace(/[^\d]/g, '');
  
  console.log('🧹 CNPJ após limpeza:', cleaned, 'Tamanho:', cleaned.length);
  
  if (cleaned.length !== 14 && cnpjString.length > 0) {
    console.log('⚠️ Formatos aceitos:');
    console.log('   14665903000104 (sem pontuação)');
    console.log('   14.665.903/0001-04 (com pontuação)');
  }
  
  return cleaned;
}

function validateCNPJ(cnpj) {
  const cleaned = cleanCNPJ(cnpj);
  
  if (cleaned.length !== 14) {
    return { valid: false, error: 'CNPJ deve ter 14 dígitos' };
  }
  
  // Validação básica de dígitos verificadores
  if (/^(\d)\1{13}$/.test(cleaned)) {
    return { valid: false, error: 'CNPJ não pode ter todos os dígitos iguais' };
  }
  
  return { valid: true, cnpj: cleaned };
}

function formatCNPJDisplay(cnpj) {
  const cleaned = cleanCNPJ(cnpj);
  if (cleaned.length !== 14) return cnpj;
  
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatCNPJData(cnpjData, cnpjNumber) {
  const estabelecimento = cnpjData.estabelecimento || {};
  
  const endereco = estabelecimento.logradouro ? 
    `${estabelecimento.tipo_logradouro || ''} ${estabelecimento.logradouro}, ${estabelecimento.numero || 'S/N'}${estabelecimento.complemento ? ', ' + estabelecimento.complemento : ''}` : 
    'Não informado';
  
  const telefone = estabelecimento.telefone1 ? 
    `(${estabelecimento.ddd1}) ${estabelecimento.telefone1}` : 
    'Não informado';

  const dataAtualizacao = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const formattedData = `
=== DADOS DA RECEITA FEDERAL ===
CNPJ: ${formatCNPJDisplay(cnpjNumber)}
Razão Social: ${cnpjData.razao_social || 'Não informado'}
Nome Fantasia: ${estabelecimento.nome_fantasia || 'Não informado'}
Situação Cadastral: ${estabelecimento.situacao_cadastral || 'Não informado'}
Data Situação: ${estabelecimento.data_situacao_cadastral || 'Não informado'}
Porte: ${cnpjData.porte?.descricao || 'Não informado'}
Capital Social: R$ ${cnpjData.capital_social || 'Não informado'}

=== ATIVIDADE ===
Atividade Principal: ${estabelecimento.atividade_principal?.descricao || 'Não informado'}
Código CNAE: ${estabelecimento.atividade_principal?.id || 'Não informado'}

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

=== SÓCIOS ===
${cnpjData.socios?.length > 0 ? 
  cnpjData.socios.map(socio => 
    `• ${socio.nome} - ${socio.qualificacao_socio?.descricao || 'Não informado'}`
  ).join('\n') : 
  'Não informado'
}

Última atualização: ${dataAtualizacao}
Fonte: Receita Federal do Brasil
  `.trim();

  return formattedData;
}

function extractCompanyData(cnpjData) {
  const estabelecimento = cnpjData.estabelecimento || {};
  
  return {
    razaoSocial: cnpjData.razao_social || '',
    nomeFantasia: estabelecimento.nome_fantasia || '',
    situacao: estabelecimento.situacao_cadastral || '',
    porte: cnpjData.porte?.descricao || '',
    cidade: estabelecimento.cidade?.nome || '',
    estado: estabelecimento.estado?.sigla || '',
    atividade: estabelecimento.atividade_principal?.descricao || '',
    email: estabelecimento.email || '',
    telefone: estabelecimento.telefone1 ? 
      `(${estabelecimento.ddd1}) ${estabelecimento.telefone1}` : '',
    endereco: estabelecimento.logradouro ? 
      `${estabelecimento.tipo_logradouro} ${estabelecimento.logradouro}, ${estabelecimento.numero}` : '',
    cep: estabelecimento.cep || '',
    capitalSocial: cnpjData.capital_social || '',
    dataInicioAtividade: estabelecimento.data_inicio_atividade || '',
    naturezaJuridica: cnpjData.natureza_juridica?.descricao || ''
  };
}

module.exports = {
  cleanCNPJ,
  validateCNPJ,
  formatCNPJDisplay,
  formatCNPJData,
  extractCompanyData
};
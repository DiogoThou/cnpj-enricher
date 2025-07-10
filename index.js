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

// ⚡ VARIÁVEIS PARA PERSISTÊNCIA
let selectedDestinationField = 'teste_cnpj';
let savedUserChoice = null;

// ⚡ SISTEMA DE MAPEAMENTO INDIVIDUAL
let individualMapping = {
  telefone: 'phone',
  razao_social: 'name',
  nome_fantasia: 'description',
  cidade: 'city',
  estado: 'state',
  atividade: 'industry',
  cep: 'zip',
  email: 'email',
  endereco: null,
  situacao: null,
  porte: null,
  capital_social: null
};

// ⚡ CAMPOS PADRÃO FIXOS (SEM BUSCAR API)
const HUBSPOT_STANDARD_FIELDS = [
  { text: '📝 Nome da empresa (name)', value: 'name', description: 'Campo padrão do HubSpot' },
  { text: '📝 Descrição (description)', value: 'description', description: 'Campo padrão do HubSpot' },
  { text: '📞 Telefone (phone)', value: 'phone', description: 'Campo padrão do HubSpot' },
  { text: '🏙️ Cidade (city)', value: 'city', description: 'Campo padrão do HubSpot' },
  { text: '🌎 Estado (state)', value: 'state', description: 'Campo padrão do HubSpot' },
  { text: '🌐 Website (website)', value: 'website', description: 'Campo padrão do HubSpot' },
  { text: '📧 Email (email)', value: 'email', description: 'Campo padrão do HubSpot' },
  { text: '🏭 Indústria (industry)', value: 'industry', description: 'Campo padrão do HubSpot' },
  { text: '📮 CEP (zip)', value: 'zip', description: 'Campo padrão do HubSpot' },
  { text: '📋 Campo teste CNPJ (teste_cnpj)', value: 'teste_cnpj', description: 'Campo de teste para CNPJ' }
];

// ⚡ Definição dos campos do CNPJ com exemplos
const cnpjFieldsDefinition = {
  telefone: {
    label: '📞 Telefone',
    example: '(11) 99999-9999',
    description: 'Telefone principal cadastrado na RF'
  },
  razao_social: {
    label: '🏢 Razão Social',
    example: 'EMPRESA TESTE LTDA',
    description: 'Nome oficial da empresa na RF'
  },
  nome_fantasia: {
    label: '✨ Nome Fantasia',
    example: 'Empresa Teste',
    description: 'Nome fantasia/comercial'
  },
  cidade: {
    label: '🏙️ Cidade',
    example: 'São Paulo',
    description: 'Cidade da sede da empresa'
  },
  estado: {
    label: '🌎 Estado',
    example: 'SP',
    description: 'Estado (UF) da sede'
  },
  atividade: {
    label: '🏭 Atividade Principal',
    example: 'Desenvolvimento de software',
    description: 'CNAE principal da empresa'
  },
  cep: {
    label: '📮 CEP',
    example: '01234-567',
    description: 'CEP da sede da empresa'
  },
  email: {
    label: '📧 Email',
    example: 'contato@empresa.com',
    description: 'Email cadastrado na Receita Federal'
  },
  endereco: {
    label: '🏠 Endereço Completo',
    example: 'Rua Teste, 123',
    description: 'Endereço completo da sede'
  },
  situacao: {
    label: '📊 Situação Cadastral',
    example: 'Ativa',
    description: 'Status na Receita Federal'
  },
  porte: {
    label: '📏 Porte da Empresa',
    example: 'Microempresa',
    description: 'Classificação do porte'
  },
  capital_social: {
    label: '💰 Capital Social',
    example: 'R$ 100.000,00',
    description: 'Capital social registrado'
  }
};

// ⚡ Função para gerar payload baseado no mapeamento individual
function generateIndividualMappingPayload(cnpjData, cnpjNumber) {
  const payload = { properties: {} };
  const unmappedData = [];
  
  // Extrair dados do CNPJ
  const extractedData = {
    telefone: cnpjData.estabelecimento?.telefone1 ? 
      `(${cnpjData.estabelecimento.ddd1}) ${cnpjData.estabelecimento.telefone1}` : '',
    razao_social: cnpjData.razao_social || '',
    nome_fantasia: cnpjData.estabelecimento?.nome_fantasia || '',
    cidade: cnpjData.estabelecimento?.cidade?.nome || '',
    estado: cnpjData.estabelecimento?.estado?.sigla || '',
    atividade: cnpjData.estabelecimento?.atividade_principal?.descricao || '',
    cep: cnpjData.estabelecimento?.cep || '',
    email: cnpjData.estabelecimento?.email || '',
    endereco: cnpjData.estabelecimento?.logradouro ? 
      `${cnpjData.estabelecimento.tipo_logradouro || ''} ${cnpjData.estabelecimento.logradouro}, ${cnpjData.estabelecimento.numero || 'S/N'}` : '',
    situacao: cnpjData.estabelecimento?.situacao_cadastral || '',
    porte: cnpjData.porte?.descricao || '',
    capital_social: cnpjData.capital_social ? `R$ ${cnpjData.capital_social}` : ''
  };
  
  console.log('🧩 Dados extraídos do CNPJ:', extractedData);
  console.log('🗺️ Mapeamento individual atual:', individualMapping);
  
  // Mapear campos individuais
  let mappedFieldsCount = 0;
  Object.keys(extractedData).forEach(cnpjField => {
    const hubspotField = individualMapping[cnpjField];
    const value = extractedData[cnpjField];
    
    if (hubspotField && hubspotField !== 'nenhum' && value) {
      payload.properties[hubspotField] = value;
      mappedFieldsCount++;
      console.log(`✅ Mapeado: ${cnpjField} → ${hubspotField} = "${value}"`);
    } else if (value) {
      unmappedData.push(`${cnpjFieldsDefinition[cnpjField]?.label}: ${value}`);
      console.log(`📦 Não mapeado: ${cnpjField} = "${value}"`);
    }
  });
  
  // Se há dados não mapeados, salvar no campo backup
  if (unmappedData.length > 0) {
    const backupField = savedUserChoice || selectedDestinationField;
    if (backupField && backupField !== 'nenhum') {
      const backupData = `
=== DADOS CNPJ NÃO MAPEADOS ===
CNPJ: ${cnpjNumber}
${unmappedData.join('\n')}

Atualizado em: ${new Date().toLocaleString('pt-BR')}
`.trim();
      
      payload.properties[backupField] = backupData;
      console.log(`📦 Dados não mapeados salvos em: ${backupField}`);
    }
  }
  
  console.log(`📊 Resumo: ${mappedFieldsCount} campos mapeados, ${unmappedData.length} não mapeados`);
  
  return payload;
}

// ⚡ Função melhorada para limpar CNPJ
function cleanCNPJ(cnpjInput) {
  console.log('🧹 Limpando CNPJ:', cnpjInput, 'Tipo:', typeof cnpjInput);
  
  if (!cnpjInput) {
    console.log('🧹 CNPJ vazio ou null');
    return '';
  }
  
  const cnpjString = String(cnpjInput).trim();
  const cleaned = cnpjString.replace(/[^\d]/g, '');
  
  console.log('🧹 CNPJ após limpeza:', cleaned, 'Tamanho:', cleaned.length);
  
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

// ⚡ FUNÇÃO para usar mapeamento individual ou campo único
function updateEnrichmentPayload(cnpjData, cnpjNumber) {
  const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
  
  if (hasIndividualMapping) {
    console.log('🗺️ Usando mapeamento individual de campos');
    return generateIndividualMappingPayload(cnpjData, cnpjNumber);
  } else {
    console.log('📋 Usando modo de campo único');
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
    
    console.log(`📦 Dados serão salvos no campo único: ${campoAtual}`);
    return payload;
  }
}

// Status do app
app.get('/account', (req, res) => {
  res.json({
    status: 'connected',
    app: 'CNPJ Enricher',
    version: '2.0',
    tokenStatus: HUBSPOT_ACCESS_TOKEN ? 'Configurado' : 'Não configurado',
    endpoints: {
      configurar: 'GET /settings',
      enriquecer: 'POST /enrich',
      criarTeste: 'POST /create-test-company'
    }
  });
});

// ⚡ Servir página de configuração de mapeamento
app.get('/mapping-table', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configuração de Mapeamento - Tabela Simples</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        
        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
        }
        
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 10px;
            font-size: 2.5em;
        }
        
        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 40px;
            font-size: 1.2em;
        }
        
        .mode-selector {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 15px;
            margin-bottom: 30px;
            border-left: 5px solid #667eea;
        }
        
        .mode-buttons {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 15px;
        }
        
        .mode-btn {
            padding: 12px 24px;
            border: 2px solid #ddd;
            border-radius: 8px;
            background: white;
            cursor: pointer;
            transition: all 0.3s ease;
            font-weight: 600;
        }
        
        .mode-btn.active {
            border-color: #667eea;
            background: #667eea;
            color: white;
        }
        
        .mapping-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-radius: 10px;
            overflow: hidden;
        }
        
        .mapping-table th {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 15px;
            text-align: left;
            font-weight: 600;
        }
        
        .mapping-table td {
            padding: 15px;
            border-bottom: 1px solid #eee;
            vertical-align: middle;
        }
        
        .mapping-table tr:hover {
            background: #f8f9fa;
        }
        
        .field-info {
            display: flex;
            flex-direction: column;
        }
        
        .field-name {
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
        }
        
        .field-example {
            font-size: 0.9em;
            color: #666;
            font-style: italic;
        }
        
        .field-select {
            padding: 10px;
            border: 2px solid #ddd;
            border-radius: 6px;
            background: white;
            width: 100%;
            font-size: 14px;
            transition: border-color 0.3s ease;
        }
        
        .field-select:focus {
            border-color: #667eea;
            outline: none;
        }
        
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .status-mapped {
            background: #28a745;
        }
        
        .status-unmapped {
            background: #dc3545;
        }
        
        .backup-section {
            background: #e8f4fd;
            padding: 20px;
            border-radius: 15px;
            margin-bottom: 30px;
            border-left: 5px solid #17a2b8;
        }
        
        .actions {
            display: flex;
            gap: 15px;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.3s ease;
            min-width: 120px;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea, #764ba2);
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
        
        .btn-warning {
            background: #ffc107;
            color: #333;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        
        .status {
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
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
        
        .summary {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            border-left: 5px solid #28a745;
        }
        
        .single-field-section {
            display: none;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 15px;
            margin-bottom: 30px;
            border-left: 5px solid #ffc107;
        }
        
        @media (max-width: 768px) {
            .mapping-table {
                font-size: 14px;
            }
            
            .mapping-table th,
            .mapping-table td {
                padding: 10px;
            }
            
            .actions {
                flex-direction: column;
                align-items: center;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📋 Configuração de Mapeamento</h1>
        <p class="subtitle">Configure como os dados do CNPJ serão salvos no HubSpot</p>
        
        <!-- Seletor de Modo -->
        <div class="mode-selector">
            <h3>🗺️ Escolha o modo de mapeamento:</h3>
            <div class="mode-buttons">
                <div class="mode-btn" data-mode="single" onclick="selectMode('single')">
                    📄 Campo Único
                </div>
                <div class="mode-btn active" data-mode="individual" onclick="selectMode('individual')">
                    🗂️ Mapeamento Individual
                </div>
            </div>
        </div>
        
        <!-- Campo Único -->
        <div id="single-field-section" class="single-field-section">
            <h4>📄 Modo Campo Único</h4>
            <p>Todos os dados serão salvos formatados em um único campo:</p>
            <select class="field-select" id="single-field" style="max-width: 300px;">
                <option value="teste_cnpj" selected>📋 teste_cnpj (recomendado)</option>
                <option value="description">📝 Description</option>
                <option value="name">🏢 Company Name</option>
            </select>
        </div>
        
        <!-- Tabela de Mapeamento Individual -->
        <div id="individual-mapping-section">
            <table class="mapping-table">
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>Campo CNPJ</th>
                        <th>Exemplo</th>
                        <th>Campo HubSpot</th>
                    </tr>
                </thead>
                <tbody id="mapping-table-body">
                    <!-- Será preenchido dinamicamente -->
                </tbody>
            </table>
            
            <!-- Campo Backup -->
            <div class="backup-section">
                <h4>📦 Campo para dados não mapeados</h4>
                <p>Dados que não foram mapeados individualmente serão salvos neste campo:</p>
                <select class="field-select" id="backup-field" style="max-width: 300px;">
                    <option value="teste_cnpj" selected>📋 teste_cnpj</option>
                    <option value="description">📝 Description</option>
                    <option value="name">🏢 Company Name</option>
                </select>
            </div>
        </div>
        
        <!-- Resumo -->
        <div class="summary" id="summary">
            <h4>📊 Resumo da Configuração</h4>
            <div id="summary-content">Carregando...</div>
        </div>
        
        <!-- Ações -->
        <div class="actions">
            <button class="btn btn-secondary" onclick="resetMapping()">
                🔄 Resetar
            </button>
            <button class="btn btn-warning" onclick="loadCurrentMapping()">
                📥 Carregar Atual
            </button>
            <button class="btn btn-success" onclick="testMapping()">
                🧪 Testar
            </button>
            <button class="btn btn-primary" onclick="saveMapping()">
                💾 Salvar
            </button>
        </div>
        
        <div id="status"></div>
    </div>

    <script>
        let currentMode = 'individual';
        
        const cnpjFields = {
            telefone: { label: '📞 Telefone', example: '(11) 99999-9999' },
            razao_social: { label: '🏢 Razão Social', example: 'EMPRESA TESTE LTDA' },
            nome_fantasia: { label: '✨ Nome Fantasia', example: 'Empresa Teste' },
            cidade: { label: '🏙️ Cidade', example: 'São Paulo' },
            estado: { label: '🌎 Estado', example: 'SP' },
            atividade: { label: '🏭 Atividade Principal', example: 'Desenvolvimento de software' },
            cep: { label: '📮 CEP', example: '01234-567' },
            email: { label: '📧 Email', example: 'contato@empresa.com' },
            endereco: { label: '🏠 Endereço', example: 'Rua Teste, 123' },
            situacao: { label: '📊 Situação Cadastral', example: 'Ativa' },
            porte: { label: '📏 Porte', example: 'Microempresa' },
            capital_social: { label: '💰 Capital Social', example: 'R$ 100.000,00' }
        };
        
        const hubspotOptions = [
            { value: '', text: '🚫 Não mapear' },
            { value: 'name', text: '🏢 Company Name' },
            { value: 'description', text: '📝 Description' },
            { value: 'phone', text: '📞 Phone' },
            { value: 'city', text: '🏙️ City' },
            { value: 'state', text: '🌎 State' },
            { value: 'email', text: '📧 Email' },
            { value: 'industry', text: '🏭 Industry' },
            { value: 'zip', text: '📮 ZIP Code' },
            { value: 'website', text: '🌐 Website' },
            { value: 'teste_cnpj', text: '📋 teste_cnpj' }
        ];
        
        function selectMode(mode) {
            currentMode = mode;
            
            // Atualizar botões
            document.querySelectorAll('.mode-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelector(\`[data-mode="\${mode}"]\`).classList.add('active');
            
            // Mostrar/esconder seções
            document.getElementById('individual-mapping-section').style.display = mode === 'individual' ? 'block' : 'none';
            document.getElementById('single-field-section').style.display = mode === 'single' ? 'block' : 'none';
            
            updateSummary();
        }
        
        function buildMappingTable() {
            const tbody = document.getElementById('mapping-table-body');
            tbody.innerHTML = '';
            
            Object.keys(cnpjFields).forEach(fieldKey => {
                const field = cnpjFields[fieldKey];
                const row = document.createElement('tr');
                
                row.innerHTML = \`
                    <td>
                        <span class="status-indicator status-unmapped" id="status-\${fieldKey}"></span>
                    </td>
                    <td>
                        <div class="field-info">
                            <div class="field-name">\${field.label}</div>
                            <div class="field-example">\${field.example}</div>
                        </div>
                    </td>
                    <td>\${field.example}</td>
                    <td>
                        <select class="field-select" data-field="\${fieldKey}" onchange="updateFieldMapping('\${fieldKey}', this.value)">
                            \${hubspotOptions.map(opt => 
                                \`<option value="\${opt.value}">\${opt.text}</option>\`
                            ).join('')}
                        </select>
                    </td>
                \`;
                
                tbody.appendChild(row);
            });
        }
        
        function updateFieldMapping(cnpjField, hubspotField) {
            const statusIndicator = document.getElementById(\`status-\${cnpjField}\`);
            
            if (hubspotField && hubspotField !== '') {
                statusIndicator.className = 'status-indicator status-mapped';
            } else {
                statusIndicator.className = 'status-indicator status-unmapped';
            }
            
            updateSummary();
        }
        
        function updateSummary() {
            const summaryContent = document.getElementById('summary-content');
            
            if (currentMode === 'individual') {
                let mappedCount = 0;
                let unmappedCount = 0;
                let mappedFields = [];
                let unmappedFields = [];
                
                document.querySelectorAll('[data-field]').forEach(select => {
                    const fieldKey = select.dataset.field;
                    const fieldLabel = cnpjFields[fieldKey].label;
                    const hubspotField = select.value;
                    
                    if (hubspotField && hubspotField !== '') {
                        mappedCount++;
                        const hubspotLabel = hubspotOptions.find(opt => opt.value === hubspotField)?.text || hubspotField;
                        mappedFields.push(\`\${fieldLabel} → \${hubspotLabel}\`);
                    } else {
                        unmappedCount++;
                        unmappedFields.push(fieldLabel);
                    }
                });
                
                const backupField = document.getElementById('backup-field').value;
                const backupLabel = hubspotOptions.find(opt => opt.value === backupField)?.text || backupField;
                
                summaryContent.innerHTML = \`
                    <strong>📊 Mapeamento Individual:</strong><br>
                    ✅ <strong>\${mappedCount} campos mapeados</strong><br>
                    \${mappedFields.length > 0 ? mappedFields.map(f => \`   • \${f}\`).join('<br>') : ''}
                    \${mappedFields.length > 0 && unmappedFields.length > 0 ? '<br><br>' : ''}
                    \${unmappedCount > 0 ? \`❌ <strong>\${unmappedCount} campos não mapeados</strong> (vão para \${backupLabel})<br>\` : ''}
                    \${unmappedFields.length > 0 ? unmappedFields.map(f => \`   • \${f}\`).join('<br>') : ''}
                \`;
            } else {
                const singleField = document.getElementById('single-field').value;
                const singleLabel = hubspotOptions.find(opt => opt.value === singleField)?.text || singleField;
                
                summaryContent.innerHTML = \`
                    <strong>📄 Campo Único:</strong><br>
                    Todos os dados serão salvos formatados no campo: <strong>\${singleLabel}</strong>
                \`;
            }
        }
        
        async function loadCurrentMapping() {
            try {
                showStatus('📥 Carregando configuração atual...', 'info');
                
                const response = await fetch('/api/debug-settings');
                const data = await response.json();
                
                if (data.individualMapping) {
                    Object.keys(data.individualMapping).forEach(cnpjField => {
                        const select = document.querySelector(\`[data-field="\${cnpjField}"]\`);
                        if (select && data.individualMapping[cnpjField]) {
                            select.value = data.individualMapping[cnpjField];
                            updateFieldMapping(cnpjField, data.individualMapping[cnpjField]);
                        }
                    });
                }
                
                if (data.currentField) {
                    document.getElementById('backup-field').value = data.currentField;
                    document.getElementById('single-field').value = data.currentField;
                }
                
                updateSummary();
                showStatus('✅ Configuração atual carregada', 'success');
                
            } catch (error) {
                showStatus('❌ Erro ao carregar configuração', 'error');
            }
        }
        
        function resetMapping() {
            document.querySelectorAll('[data-field]').forEach(select => {
                select.value = '';
                updateFieldMapping(select.dataset.field, '');
            });
            updateSummary();
            showStatus('🔄 Mapeamento resetado', 'info');
        }
        
        async function saveMapping() {
            try {
                showStatus('💾 Salvando configuração...', 'info');
                
                if (currentMode === 'individual') {
                    const mappingData = {};
                    
                    document.querySelectorAll('[data-field]').forEach(select => {
                        const cnpjField = select.dataset.field;
                        mappingData[cnpjField] = select.value || null;
                    });
                    
                    const backupField = document.getElementById('backup-field').value;
                    
                    const response = await fetch('/api/individual-mapping-save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            fieldMappings: mappingData,
                            backupField: backupField
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (response.ok) {
                        showStatus('✅ Mapeamento individual salvo com sucesso!', 'success');
                    } else {
                        showStatus('❌ Erro ao salvar: ' + result.error, 'error');
                    }
                    
                } else {
                    const singleField = document.getElementById('single-field').value;
                    
                    const response = await fetch('/api/dropdown-update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            selectedOption: singleField
                        })
                    });
                    
                    if (response.ok) {
                        showStatus('✅ Campo único configurado com sucesso!', 'success');
                    } else {
                        showStatus('❌ Erro ao salvar campo único', 'error');
                    }
                }
                
            } catch (error) {
                showStatus('❌ Erro ao salvar: ' + error.message, 'error');
            }
        }
        
        async function testMapping() {
            try {
                showStatus('🧪 Testando mapeamento...', 'info');
                
                // Primeiro salvar
                await saveMapping();
                
                // Aguardar um pouco
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Criar empresa teste
                const createResponse = await fetch('/create-test-company', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const createResult = await createResponse.json();
                
                if (createResponse.ok) {
                    showStatus(\`✅ Empresa teste criada: \${createResult.companyId}\`, 'success');
                    
                    // Aguardar e enriquecer
                    setTimeout(async () => {
                        const enrichResponse = await fetch('/enrich', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ companyId: createResult.companyId })
                        });
                        const enrichResult = await enrichResponse.json();
                        
                        if (enrichResponse.ok) {
                            showStatus('🎉 Teste concluído! Verifique a empresa no HubSpot', 'success');
                        } else {
                            showStatus('❌ Erro no enriquecimento: ' + enrichResult.error, 'error');
                        }
                    }, 1500);
                } else {
                    showStatus('❌ Erro ao criar empresa teste: ' + createResult.error, 'error');
                }
                
            } catch (error) {
                showStatus('❌ Erro no teste: ' + error.message, 'error');
            }
        }
        
        function showStatus(message, type) {
            const statusDiv = document.getElementById('status');
            statusDiv.innerHTML = \`<div class="status \${type}">\${message}</div>\`;
            
            if (type === 'success') {
                setTimeout(() => {
                    statusDiv.innerHTML = '';
                }, 5000);
            }
        }
        
        // Event listeners
        document.getElementById('backup-field').addEventListener('change', updateSummary);
        document.getElementById('single-field').addEventListener('change', updateSummary);
        
        // Inicializar
        buildMappingTable();
        loadCurrentMapping();
        updateSummary();
    </script>
</body>
</html>
  `);
});

// ⚡ OAuth Callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('❌ Código de autorização não fornecido.');

  console.log('🔍 Processando OAuth callback...');

  try {
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      console.error('❌ Variáveis de ambiente não configuradas');
      return res.status(500).send(`
        <h2>❌ Erro de Configuração</h2>
        <p><strong>CLIENT_ID:</strong> ${CLIENT_ID ? 'Configurado' : 'NÃO CONFIGURADO'}</p>
        <p><strong>CLIENT_SECRET:</strong> ${CLIENT_SECRET ? 'Configurado' : 'NÃO CONFIGURADO'}</p>
        <p><strong>REDIRECT_URI:</strong> ${REDIRECT_URI ? 'Configurado' : 'NÃO CONFIGURADO'}</p>
      `);
    }

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
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'CNPJ-Enricher/2.0'
        },
        timeout: 10000
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    HUBSPOT_ACCESS_TOKEN = access_token;

    console.log('✅ Access Token gerado:', access_token);
    console.log('⏰ Expira em (segundos):', expires_in);

    const successHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OAuth Sucesso</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f8f9fa; }
        .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .success { color: #28a745; border-left: 4px solid #28a745; padding-left: 15px; margin-bottom: 20px; }
        .info { background: #e9ecef; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="success">
            <h2>✅ Token OAuth gerado com sucesso!</h2>
        </div>
        
        <div class="info">
            <p><strong>Access Token:</strong> ${access_token.substring(0, 20)}...</p>
            <p><strong>Expira em:</strong> ${Math.floor(expires_in / 3600)} horas</p>
            <p><strong>Status:</strong> Conectado ao HubSpot ✅</p>
        </div>
        
        <h3>🚀 Próximos passos:</h3>
        <ol>
            <li><strong>Configurar mapeamento:</strong><br><a href="/mapping-table" target="_blank">Abrir Configuração</a></li>
            <li><strong>Criar empresa teste:</strong><br><code>POST /create-test-company</code></li>
            <li><strong>Enriquecer empresa:</strong><br><code>POST /enrich</code></li>
        </ol>
        
        <div style="margin-top: 30px;">
            <a href="/account" class="btn">📊 Verificar Status</a>
            <a href="/mapping-table" class="btn">🗺️ Configurar Mapeamento</a>
        </div>
        
        <script>
            if (window.opener) {
                setTimeout(() => window.close(), 3000);
            }
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'oauth_success',
                    token: '${access_token.substring(0, 20)}...',
                    expiresIn: ${expires_in}
                }, '*');
            }
        </script>
    </div>
</body>
</html>`;

    res.send(successHtml);
    
  } catch (error) {
    console.error('❌ Erro no OAuth:', error.response?.data);
    
    const errorHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Erro OAuth</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f8f9fa; }
        .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .error { color: #dc3545; border-left: 4px solid #dc3545; padding-left: 15px; margin-bottom: 20px; }
        .debug { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; font-family: monospace; font-size: 12px; }
        .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="error">
            <h2>❌ Erro ao gerar token OAuth</h2>
        </div>
        
        <p><strong>Status:</strong> ${error.response?.status || 'Desconhecido'}</p>
        <p><strong>Mensagem:</strong> ${error.message}</p>
        
        <div class="debug">
            <h4>🔍 Debug:</h4>
            <p><strong>CLIENT_ID:</strong> ${CLIENT_ID || 'Não configurado'}</p>
            <p><strong>REDIRECT_URI:</strong> ${REDIRECT_URI || 'Não configurado'}</p>
            <p><strong>CLIENT_SECRET:</strong> ${CLIENT_SECRET ? 'Configurado' : 'Não configurado'}</p>
            <pre>${JSON.stringify(error.response?.data, null, 2)}</pre>
        </div>
        
        <div style="margin-top: 30px;">
            <a href="/account" class="btn">📊 Status</a>
        </div>
    </div>
</body>
</html>`;

    res.status(500).send(errorHtml);
  }
});

// ⚡ Refresh token
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
    HUBSPOT_ACCESS_TOKEN = access_token;

    console.log('✅ Novo Access Token:', access_token);
    console.log('⏰ Expira em (segundos):', expires_in);

    res.send('✅ Novo access_token gerado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao fazer refresh do token:', error.response?.data || error.message);
    res.status(500).send('❌ Erro ao gerar novo token.');
  }
});

// ⚡ Testar token
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

// ⚡ Página de configurações atualizada
app.get('/settings', (req, res) => {
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://app.hubspot.com https://app-eu1.hubspot.com;");
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CNPJ Enricher - Configurações</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
        }
        
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 10px;
            font-size: 2.5em;
        }
        
        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 40px;
            font-size: 1.2em;
        }
        
        .quick-actions {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        
        .action-card {
            background: #f8f9fa;
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s ease;
            border: 2px solid transparent;
        }
        
        .action-card:hover {
            border-color: #667eea;
            transform: translateY(-5px);
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }
        
        .action-icon {
            font-size: 3em;
            margin-bottom: 15px;
        }
        
        .action-title {
            font-size: 1.3em;
            font-weight: 600;
            margin-bottom: 10px;
            color: #333;
        }
        
        .action-desc {
            color: #666;
            font-size: 0.95em;
        }
        
        .btn {
            padding: 15px 30px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.3s ease;
            margin: 10px;
            min-width: 150px;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea, #764ba2);
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
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        
        .status {
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
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
        
        .current-config {
            background: #e8f4fd;
            padding: 25px;
            border-radius: 15px;
            margin-bottom: 30px;
            border-left: 5px solid #17a2b8;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>⚙️ CNPJ Enricher</h1>
        <p class="subtitle">Configure como os dados do CNPJ serão salvos no HubSpot</p>
        
        <div class="current-config">
            <h3>📋 Configuração Atual</h3>
            <div id="current-status">Carregando...</div>
        </div>
        
        <div class="quick-actions">
            <div class="action-card" onclick="openMappingConfig()">
                <div class="action-icon">🗺️</div>
                <div class="action-title">Configurar Mapeamento</div>
                <div class="action-desc">Configure como cada campo do CNPJ será mapeado</div>
            </div>
            
            <div class="action-card" onclick="createField()">
                <div class="action-icon">🔧</div>
                <div class="action-title">Criar Campo teste_cnpj</div>
                <div class="action-desc">Criar o campo personalizado no HubSpot</div>
            </div>
            
            <div class="action-card" onclick="testSystem()">
                <div class="action-icon">🧪</div>
                <div class="action-title">Testar Sistema</div>
                <div class="action-desc">Criar empresa teste e enriquecer com CNPJ</div>
            </div>
        </div>
        
        <div style="text-align: center;">
            <button class="btn btn-secondary" onclick="loadCurrentConfig()">
                🔄 Recarregar Status
            </button>
            <button class="btn btn-success" onclick="quickTest()">
                ⚡ Teste Rápido
            </button>
        </div>
        
        <div id="status"></div>
    </div>

    <script>
        async function loadCurrentConfig() {
            try {
                const response = await fetch('/api/debug-settings');
                const data = await response.json();
                
                const hasIndividual = Object.values(data.individualMapping || {}).some(field => field && field !== 'nenhum');
                const mappedCount = Object.values(data.individualMapping || {}).filter(field => field && field !== 'nenhum').length;
                
                let configText = '';
                if (hasIndividual) {
                    configText = \`🗺️ <strong>Mapeamento Individual</strong><br>
                                 📊 \${mappedCount} campos mapeados<br>
                                 📦 Campo backup: \${data.currentField}\`;
                } else {
                    configText = \`📄 <strong>Campo Único</strong><br>
                                 📂 Destino: \${data.currentField}<br>
                                 📋 Todos os dados formatados juntos\`;
                }
                
                document.getElementById('current-status').innerHTML = configText;
                
            } catch (error) {
                document.getElementById('current-status').innerHTML = '❌ Erro ao carregar configuração';
            }
        }
        
        function openMappingConfig() {
            window.open('/mapping-table', '_blank', 'width=1200,height=800');
        }
        
        async function createField() {
            try {
                showStatus('🔧 Criando campo teste_cnpj...', 'info');
                
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
        
        async function testSystem() {
            try {
                showStatus('🧪 Iniciando teste completo...', 'info');
                
                // Criar empresa
                const createResponse = await fetch('/create-test-company', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const createResult = await createResponse.json();
                
                if (createResponse.ok) {
                    showStatus('✅ Empresa criada: ' + createResult.companyId, 'success');
                    
                    // Aguardar e enriquecer
                    setTimeout(async () => {
                        showStatus('🔍 Enriquecendo empresa...', 'info');
                        
                        const enrichResponse = await fetch('/enrich', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ companyId: createResult.companyId })
                        });
                        const enrichResult = await enrichResponse.json();
                        
                        if (enrichResponse.ok) {
                            showStatus('🎉 Teste concluído! Verifique a empresa no HubSpot', 'success');
                        } else {
                            showStatus('❌ Erro no enriquecimento: ' + enrichResult.error, 'error');
                        }
                    }, 1500);
                } else {
                    showStatus('❌ Erro ao criar empresa: ' + createResult.error, 'error');
                }
                
            } catch (error) {
                showStatus('❌ Erro no teste: ' + error.message, 'error');
            }
        }
        
        async function quickTest() {
            try {
                showStatus('⚡ Teste rápido...', 'info');
                
                const response = await fetch('/test-token');
                const result = await response.json();
                
                if (result.status === 'success') {
                    showStatus('✅ Sistema funcionando! Token válido', 'success');
                } else {
                    showStatus('❌ Problema com token: ' + result.message, 'error');
                }
                
            } catch (error) {
                showStatus('❌ Erro no teste rápido', 'error');
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
        
        // Carregar configuração ao iniciar
        loadCurrentConfig();
    </script>
</body>
</html>
  `);
});

// ⚡ ENRICHMENT PRINCIPAL
app.post('/enrich', async (req, res) => {
  const { companyId } = req.body;

  console.log('🔍 Iniciando enriquecimento para companyId:', companyId);

  if (!companyId) {
    console.error('❌ Company ID não fornecido');
    return res.status(400).json({ error: 'Company ID is required' });
  }

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
    const properties = hubspotCompany.data.properties;
    
    console.log('🔍 Propriedades da empresa:');
    Object.keys(properties).forEach(key => {
      console.log(`${key}: "${properties[key]}"`);
    });
    
    // Buscar CNPJ
    let cnpjRaw = properties.cnpj || 
                  properties.CNPJ ||
                  properties.registration_number ||
                  properties.company_cnpj ||
                  properties.document_number ||
                  properties.tax_id ||
                  properties.federal_id;

    // Se não encontrou, procurar em qualquer campo com 14 dígitos
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

    const cnpjLimpo = cleanCNPJ(cnpjRaw);
    console.log('🧹 CNPJ limpo:', cnpjLimpo);

    if (!cnpjLimpo || cnpjLimpo.length !== 14) {
      console.warn('⚠️ CNPJ inválido ou não encontrado');
      
      let sugestoes = [];
      if (!cnpjRaw) {
        sugestoes.push('Campo CNPJ não encontrado na empresa');
        sugestoes.push(`Use: POST /add-cnpj/${companyId} com {"cnpj": "14665903000104"}`);
      } else if (cnpjLimpo.length !== 14) {
        sugestoes.push(`CNPJ tem ${cnpjLimpo.length} dígitos, precisa ter 14`);
        sugestoes.push('Formatos aceitos: 14665903000104 ou 14.665.903/0001-04');
      }
      
      return res.status(400).json({ 
        error: 'CNPJ inválido ou não encontrado',
        cnpjRaw: cnpjRaw,
        cnpjLimpo: cnpjLimpo,
        cnpjTamanho: cnpjLimpo.length,
        sugestoes: sugestoes
      });
    }

    console.log('📡 Buscando dados do CNPJ na API externa...');
    
    const cnpjDataResponse = await axios.get(`https://publica.cnpj.ws/cnpj/${cnpjLimpo}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'CNPJ-Enricher/2.0'
      }
    });

    console.log('✅ Dados do CNPJ obtidos com sucesso');
    const cnpjData = cnpjDataResponse.data;

    // Gerar payload baseado no modo configurado
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

    const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
    const campoUsado = hasIndividualMapping ? 'mapeamento individual' : (savedUserChoice || selectedDestinationField);
    
    console.log(`✅ Empresa atualizada com sucesso! Modo usado: ${campoUsado}`);
    
    const dadosEmpresa = {
      razaoSocial: cnpjData.razao_social || '',
      nomeFantasia: cnpjData.estabelecimento?.nome_fantasia || '',
      situacao: cnpjData.estabelecimento?.situacao_cadastral || '',
      porte: cnpjData.porte?.descricao || '',
      cidade: cnpjData.estabelecimento?.cidade?.nome || '',
      estado: cnpjData.estabelecimento?.estado?.sigla || '',
      atividade: cnpjData.estabelecimento?.atividade_principal?.descricao || '',
      email: cnpjData.estabelecimento?.email || '',
      telefone: cnpjData.estabelecimento?.telefone1 ? 
        `(${cnpjData.estabelecimento.ddd1}) ${cnpjData.estabelecimento.telefone1}` : ''
    };
    
    console.log('🎉 SUCESSO COMPLETO:');
    console.log('🏢 Razão Social:', dadosEmpresa.razaoSocial);
    console.log('✨ Nome Fantasia:', dadosEmpresa.nomeFantasia);
    console.log('📊 Situação:', dadosEmpresa.situacao);
    console.log('📍 Local:', `${dadosEmpresa.cidade}/${dadosEmpresa.estado}`);
    console.log('📞 Telefone:', dadosEmpresa.telefone);

    res.json({ 
      success: true,
      message: `🎉 Empresa enriquecida com sucesso! Modo: ${campoUsado}`,
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
        modo: hasIndividualMapping ? 'mapeamento_individual' : 'campo_unico',
        campoDestino: hasIndividualMapping ? 'múltiplos campos' : campoUsado,
        tipoConteudo: hasIndividualMapping ? 'Campos específicos + backup' : 'Texto formatado completo'
      }
    });

  } catch (error) {
    console.error('❌ Erro detalhado no enriquecimento:');
    console.error('📋 Mensagem:', error.message);
    console.error('📊 Status:', error.response?.status);
    console.error('📄 Response data:', error.response?.data);
    
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
    
    if (error.response?.status === 400 && error.response?.data?.message?.includes('does not exist')) {
      console.log('⚠️ Campo teste_cnpj não existe no HubSpot');
      
      return res.status(400).json({ 
        error: 'Campo teste_cnpj não existe no HubSpot',
        message: 'Execute POST /create-test-field para criar o campo',
        solucao: 'POST /create-test-field'
      });
    }
    
    if (error.response?.status === 429 && error.config?.url?.includes('cnpj.ws')) {
      console.log('⚠️ Rate limit atingido na API CNPJ');
      
      return res.status(200).json({ 
        success: true,
        message: '✅ CNPJ válido encontrado! Rate limit atingido (3 consultas/min)',
        cnpj: cnpjLimpo,
        empresaEncontrada: properties.name || 'Empresa sem nome',
        status: 'Aguardando liberação da API',
        proximaTentativa: 'Aguarde 1-2 minutos para nova consulta'
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
      details: error.message
    });
  }
});

// ⚡ Criar campo teste_cnpj
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
      fieldType: 'textarea'
    });
    
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('⚠️ Campo teste_cnpj já existe');
      res.json({
        success: true,
        message: 'Campo teste_cnpj já existe no HubSpot',
        status: 'already_exists'
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

// ⚡ Adicionar CNPJ a empresa
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
      message: 'CNPJ adicionado à empresa com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao adicionar CNPJ:', error.response?.data);
    res.status(500).json({
      error: 'Erro ao adicionar CNPJ',
      details: error.response?.data
    });
  }
});

// ⚡ Criar empresa de teste
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
          cnpj: '14665903000104',
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

    const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
    const modo = hasIndividualMapping ? 'mapeamento individual' : 'campo único';

    res.json({
      success: true,
      companyId: response.data.id,
      message: 'Empresa de teste criada com CNPJ 14665903000104',
      cnpj: '14665903000104',
      configuracao: {
        modoAtivo: modo,
        campoDestino: hasIndividualMapping ? 'múltiplos campos' : (savedUserChoice || selectedDestinationField)
      },
      proximoTeste: {
        url: 'POST /enrich',
        body: { companyId: response.data.id }
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

// ⚡ ENDPOINTS PARA HUBSPOT APP - CORRIGIDOS

app.post('/api/accounts-fetch', (req, res) => {
  console.log('🔁 Recebido chamada de /api/accounts-fetch do HubSpot');

  return res.json({
    response: {
      accounts: [
        {
          accountId: 'default-account',
          accountName: 'Enriquecedor CNPJ - CRM Hub',
          accountLogoUrl: 'https://crmhub.com.br/wp-content/uploads/2025/02/logo-laranja-1.png'
        }
      ]
    }
  });
});

// ⚡ Dropdown fetch - VERSÃO CORRIGIDA SEM BUSCAR API
app.post('/api/dropdown-fetch', async (req, res) => {
  console.log('🔍 HubSpot solicitando opções do dropdown...');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    // ⚡ FORMATO CORRETO PARA DROPDOWNS DO HUBSPOT
    const options = [
      { 
        text: '🚫 Não mapear - Apenas validar CNPJ', 
        value: 'nenhum',
        description: 'Apenas valida o CNPJ sem salvar dados adicionais'
      },
      ...HUBSPOT_STANDARD_FIELDS.map(field => ({
        text: field.text,
        value: field.value,
        description: field.description
      }))
    ];

    const currentSelection = savedUserChoice || selectedDestinationField;

    console.log(`📋 Retornando ${options.length} opções para o dropdown`);
    console.log(`🎯 Campo selecionado: ${currentSelection}`);

    return res.json({
      response: {
        options: options,
        selectedOption: currentSelection,
        placeholder: 'Escolha onde salvar os dados do CNPJ'
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no dropdown:', error);
    
    return res.json({
      response: {
        options: [
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

// ⚡ Dropdown update
app.post('/api/dropdown-update', (req, res) => {
  console.log('📥 Dropdown update recebido:', JSON.stringify(req.body, null, 2));
  
  const newSelection = req.body.selectedOption || 'teste_cnpj';
  const previousSelection = savedUserChoice || selectedDestinationField;
  
  console.log('📥 Atualizando campo de destino:');
  console.log(`   Anterior: ${previousSelection}`);
  console.log(`   Novo: ${newSelection}`);

  savedUserChoice = newSelection;

  let message = '';
  
  if (newSelection === 'teste_cnpj') {
    message = '✅ Configurado para salvar todos os dados formatados no campo teste_cnpj';
  } else if (newSelection === 'nenhum') {
    message = '⚠️ Configurado para apenas validar CNPJ (não salvar dados)';
  } else {
    message = `✅ Configurado para salvar dados formatados no campo: ${newSelection}`;
  }

  console.log(`💬 Mensagem: ${message}`);
  console.log(`💾 Escolha salva: ${savedUserChoice}`);

  res.json({
    response: {
      actionType: 'DROPDOWN_UPDATE',
      selectedOption: newSelection,
      message: message,
      configuracao: {
        campoDestino: newSelection,
        escolhaSalva: savedUserChoice
      }
    }
  });
});

// ⚡ Individual mapping save
app.post('/api/individual-mapping-save', (req, res) => {
  console.log('💾 Salvando mapeamento individual...');
  console.log('📥 Dados recebidos:', JSON.stringify(req.body, null, 2));
  
  try {
    const { fieldMappings, backupField } = req.body;
    
    if (!fieldMappings) {
      return res.status(400).json({
        error: 'fieldMappings é obrigatório'
      });
    }
    
    let updatedCount = 0;
    Object.keys(fieldMappings).forEach(cnpjField => {
      if (cnpjField in individualMapping) {
        const oldValue = individualMapping[cnpjField];
        const newValue = fieldMappings[cnpjField];
        
        individualMapping[cnpjField] = newValue;
        
        if (oldValue !== newValue) {
          updatedCount++;
          console.log(`🔄 ${cnpjField}: "${oldValue}" → "${newValue}"`);
        }
      }
    });
    
    if (backupField) {
      const oldBackup = savedUserChoice || selectedDestinationField;
      savedUserChoice = backupField;
      console.log(`📦 Campo backup: "${oldBackup}" → "${backupField}"`);
    }
    
    const mappedFields = Object.values(individualMapping).filter(field => field && field !== 'nenhum').length;
    const unmappedFields = Object.values(individualMapping).filter(field => !field || field === 'nenhum').length;
    
    console.log(`✅ Mapeamento salvo: ${updatedCount} campos atualizados`);
    console.log(`📊 Status: ${mappedFields} mapeados, ${unmappedFields} não mapeados`);
    
    return res.json({
      success: true,
      message: `Mapeamento individual salvo com sucesso!`,
      stats: {
        fieldsUpdated: updatedCount,
        totalMapped: mappedFields,
        totalUnmapped: unmappedFields,
        backupField: savedUserChoice || selectedDestinationField
      },
      mapping: individualMapping
    });
    
  } catch (error) {
    console.error('❌ Erro ao salvar mapeamento individual:', error);
    return res.status(500).json({
      error: 'Erro ao salvar mapeamento individual',
      details: error.message
    });
  }
});

// ⚡ ENDPOINTS ADICIONAIS PARA COMPATIBILIDADE
app.post('/api/save-mapping', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Sistema configurado para usar campo único teste_cnpj',
    modo: 'campo_unico'
  });
});

app.get('/api/get-mapping', (req, res) => {
  res.json({ 
    success: true, 
    mapping: { modo: 'campo_unico', campo: 'teste_cnpj' }
  });
});

app.get('/api/config-status', (req, res) => {
  res.json({
    success: true,
    configuracao: {
      modo: 'Campo único teste_cnpj',
      descricao: 'Todos os dados são salvos no campo teste_cnpj como texto formatado',
      campoDestino: 'teste_cnpj'
    },
    status: 'Configurado para campo único'
  });
});

app.get('/api/debug-settings', (req, res) => {
  res.json({
    selectedDestinationField: selectedDestinationField,
    savedUserChoice: savedUserChoice,
    currentField: savedUserChoice || selectedDestinationField,
    individualMapping: individualMapping,
    hasIndividualMapping: Object.values(individualMapping).some(field => field && field !== 'nenhum'),
    timestamp: new Date().toISOString(),
    status: 'Sistema funcionando corretamente'
  });
});

app.get('/api/mapping-status', (req, res) => {
  const hasIndividualMapping = Object.values(individualMapping).some(field => field && field !== 'nenhum');
  const mappedFields = Object.values(individualMapping).filter(field => field && field !== 'nenhum').length;
  
  res.json({
    success: true,
    mappingMode: hasIndividualMapping ? 'individual' : 'single_field',
    configuration: {
      individualMapping: {
        active: hasIndividualMapping,
        mappedFields: mappedFields,
        details: individualMapping
      },
      singleField: {
        active: !hasIndividualMapping,
        field: savedUserChoice || selectedDestinationField
      }
    }
  });
});

// Sincronização
app.get('/api/sync-cnpj', async (req, res) => {
  try {
    await syncCNPJs();
    res.json({ status: 'success', message: 'Sync concluído com sucesso' });
  } catch (error) {
    console.error('❌ Erro no sync:', error.message);
    res.status(500).json({ error: 'Erro na sincronização' });
  }
});

app.post('/api/sync-cnpj', async (req, res) => {
  try {
    await syncCNPJs();
    res.json({ status: 'success', message: 'Sync concluído com sucesso' });
  } catch (error) {
    console.error('❌ Erro no sync:', error.message);
    res.status(500).json({ error: 'Erro na sincronização' });
  }
});

console.log('🔧 Sistema de mapeamento de campos CNPJ carregado!');
console.log('🗺️ Sistema de mapeamento individual carregado!');
console.log('📋 Interface de tabela simples carregada!');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 CNPJ Enricher 2.0 rodando na porta ${PORT}`));
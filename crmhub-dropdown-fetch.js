module.exports = (req, res) => {
  console.log('🔽 CRMHub Dropdown Fetch chamado');
  
  try {
    const options = [
      {
        text: '✅ Sim - Criar campos CRMHub',
        value: 'sim',
        description: 'Criar 10 campos personalizados para dados do CNPJ'
      },
      {
        text: '❌ Não - Usar campo description',
        value: 'nao',
        description: 'Salvar todos os dados no campo description padrão'
      }
    ];

    console.log('📋 Retornando opções: Sim/Não');

    return res.json({
      response: {
        options: options,
        selectedOption: 'sim',
        placeholder: 'Criar campos CRMHub?'
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no dropdown:', error);
    
    return res.json({
      response: {
        options: [
          { 
            text: '✅ Sim - Criar campos', 
            value: 'sim',
            description: 'Criar campos CRMHub'
          }
        ],
        selectedOption: 'sim',
        placeholder: 'Criar campos CRMHub?'
      }
    });
  }
};
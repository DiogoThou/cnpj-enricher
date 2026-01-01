import React, { useState } from 'react';
import { 
  Button, 
  Text, 
  Flex, 
  hubspot, 
  Alert, 
  Box 
} from '@hubspot/ui-extensions';

// Extensão do HubSpot
hubspot.extend(() => (
  <Extension />
));

const Extension = () => {
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState({ type: '', msg: '' });

  const configurarViaVercel = async () => {
    setLoading(true);
    setRes({ type: '', msg: '' });

    try {
      // 1. URL da tua API na Vercel
      // O "?t=" força a Vercel a processar o clique como uma nova requisição, ignorando o cache do deploy
      const url = `https://crmhub-enriquecimento-cnpj.vercel.app/api/setup/create-fields?t=${Date.now()}`;
      
      console.log("🚀 Iniciando requisição para:", url);

      // 2. Chamada Fetch configurada para atravessar o bloqueio de navegador
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors', // Necessário para chamadas externas ao domínio do HubSpot
        headers: {
          'Accept': 'application/json',
        }
      });

      // 3. Verifica se o servidor respondeu (mesmo que com erro)
      if (!response.ok) {
        throw new Error(`Erro no servidor: ${response.status}`);
      }

      const data = await response.json();

      if (data.ok) {
        setRes({ 
          type: 'success', 
          msg: `✅ Configuração concluída! Campos verificados no portal ${data.portalId}.` 
        });
      } else {
        setRes({ 
          type: 'error', 
          msg: '❌ Erro na Vercel: ' + (data.error || 'Falha ao processar') 
        });
      }
    } catch (err) {
      console.error("❌ Falha crítica na chamada:", err);
      setRes({ 
        type: 'error', 
        msg: '❌ O botão não conseguiu comunicar com a Vercel. Verifique se o domínio está nas PermittedUrls do app-hsmeta.json.' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex direction="column" gap="sm">
      <Box padding="sm">
        <Text variant="microcopy" weight="bold">
          PAINEL DE CONFIGURAÇÃO CNPJ
        </Text>
      </Box>

      {res.msg && (
        <Box marginBottom="sm">
          <Alert title={res.type === 'success' ? 'Sucesso' : 'Erro de Conexão'} variant={res.type}>
            {res.msg}
          </Alert>
        </Box>
      )}

      <Button 
        variant="primary" 
        onClick={configurarViaVercel} 
        disabled={loading}
      >
        {loading ? 'A comunicar com Vercel...' : 'Instalar / Verificar Campos'}
      </Button>

      <Text variant="microcopy">
        Nota: Clique no botão acima para garantir que os campos personalizados foram criados no seu CRM.
      </Text>
    </Flex>
  );
};
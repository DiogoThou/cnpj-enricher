import React, { useEffect, useState } from 'react';
import {
  Button,
  Text,
  Flex,
  hubspot,
  Link,
  Box,
  Alert,
  LoadingSpinner,
  Tag,
  StatusIndicator
} from '@hubspot/ui-extensions';

// Habilitamos context para pegar o ID da empresa e actions para buscar dados
hubspot.extend(({ actions, context }) => (
  <Extension actions={actions} context={context} />
));

const Extension = ({ actions, context }) => {
  const [loading, setLoading] = useState(true);
  const [allFieldsReady, setAllFieldsReady] = useState(false);
  const [statusEnriquecimento, setStatusEnriquecimento] = useState('pendente');
  
  const vercelUrl = 'https://crmhub-enriquecimento-cnpj.vercel.app/api/setup/create-fields';

  useEffect(() => {
    async function verificarIntegridade() {
      try {
        // 1. Lista de campos obrigatórios
        const camposObrigatorios = ['status_enriquecimento', 'teste_cnpj', 'cnpj_numero'];
        
        // 2. Verifica se cada um existe no portal
        const checagens = await Promise.all(
          camposObrigatorios.map(field => actions.fetch(`/crm/v3/properties/companies/${field}`))
        );

        const todosExistem = checagens.every(res => res.ok);

        if (todosExistem) {
          setAllFieldsReady(true);
          
          // 3. Se os campos existem, busca o status atual desta empresa específica
          const companyId = context.crm.enrolledObjectId;
          const companyRes = await actions.fetch(
            `/crm/v3/objects/companies/${companyId}?properties=status_enriquecimento`
          );
          
          if (companyRes.ok) {
            const data = await companyRes.json();
            const valorStatus = data.properties?.status_enriquecimento || 'pendente';
            setStatusEnriquecimento(valorStatus);
          }
        } else {
          setAllFieldsReady(false);
        }
      } catch (err) {
        setAllFieldsReady(false);
      } finally {
        setLoading(false);
      }
    }

    verificarIntegridade();
  }, [actions, context]);

  if (loading) return <LoadingSpinner label="Checando integridade dos dados..." />;

  return (
    <Flex direction="column" gap="sm">
      <Text variant="microcopy" weight="bold">CRM HUB - ENRIQUECIMENTO</Text>

      {!allFieldsReady ? (
        // EXIBE APENAS SE FALTAR ALGUM CAMPO
        <Alert title="Configuração Incompleta" variant="warning">
          <Text>Detectamos que a estrutura de campos está incompleta neste portal.</Text>
          <Link href={vercelUrl} target="_blank">
            <Button variant="primary" size="sm" margin={{ top: 'sm' }}>
              🚀 REINSTALAR CAMPOS
            </Button>
          </Link>
        </Alert>
      ) : (
        // EXIBE SE TUDO ESTIVER OK (MOSTRA O STATUS)
        <Box padding="sm" backgroundColor="footer" borderRadius="sm" border={{style: 'solid', width: '1px', color: 'medium'}}>
          <Flex align="center" justify="between">
            <Text weight="bold">Status do Enriquecimento:</Text>
            <Tag variant={statusEnriquecimento === 'enriquecido' ? 'success' : 'info'}>
              {statusEnriquecimento.toUpperCase()}
            </Tag>
          </Flex>
          
          <Box margin={{ top: 'sm' }}>
            <Flex align="center" gap="xs">
              <StatusIndicator status="success" />
              <Text size="small">Estrutura de dados conectada e validada.</Text>
            </Flex>
          </Box>

          <Box margin={{ top: 'md' }}>
            <Button 
              onClick={() => {/* Aqui entrará sua função de enriquecer futuramente */}} 
              variant="secondary" 
              size="sm"
              width="match-parent"
            >
              🔍 Enriquecer Agora
            </Button>
          </Box>
        </Box>
      )}
    </Flex>
  );
};
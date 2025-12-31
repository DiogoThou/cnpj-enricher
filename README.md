# 🚀 CRM Hub - Enriquecimento de CNPJ

App HubSpot para enriquecimento automático de dados de empresas brasileiras através do CNPJ.

## 📋 Funcionalidades

### MVP Técnico (Fase 1)
- ✅ Instalação via OAuth 2.0
- ✅ Criação automática de campos no HubSpot
- ✅ Interface web para gerenciamento
- ✅ Teste manual via botão

### Campos Criados
1. **status_enriquecimento** - Select com opções: pendente, enriquecer, enriquecido, erro
2. **teste_cnpj** - Textarea para relatório do CNPJ
3. **cnpj_numero** - Campo de texto para o número do CNPJ

## 🛠️ Stack Tecnológica

- **Hospedagem:** Vercel
- **Runtime:** Node.js 18+
- **Linguagem:** JavaScript (CommonJS)
- **API:** HubSpot CRM v3
- **Auth:** OAuth 2.0

## 📦 Estrutura do Projeto

```
/
├── api/
│   ├── oauth/
│   │   └── callback.js      # Callback OAuth
│   └── setup/
│       └── create-fields.js  # Criação de campos
├── index.html                # Interface web
├── package.json              # Dependências
├── vercel.json              # Configuração Vercel
└── README.md                # Este arquivo
```

## 🚀 Instalação

### 1. Clonar o Repositório

```bash
git clone https://github.com/seu-usuario/crmhub-enriquecimento-cnpj.git
cd crmhub-enriquecimento-cnpj
```

### 2. Instalar Dependências

```bash
npm install
```

### 3. Configurar App no HubSpot

1. Acesse [developers.hubspot.com](https://developers.hubspot.com)
2. Crie um novo app
3. Em "Auth" configure:
   - **Redirect URL:** `https://seu-app.vercel.app/api/oauth/callback`
   - **Scopes necessários:**
     - `crm.objects.companies.write`
     - `crm.schemas.companies.write`

### 4. Deploy no Vercel

#### Via CLI:
```bash
npm install -g vercel
vercel
```

#### Via GitHub:
1. Faça push do código para o GitHub
2. Conecte o repositório no [Vercel Dashboard](https://vercel.com/dashboard)
3. Configure as variáveis de ambiente

### 5. Configurar Variáveis de Ambiente

No painel do Vercel, adicione:

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `HUBSPOT_CLIENT_ID` | Client ID do app | `12345678-1234-1234-1234-123456789012` |
| `HUBSPOT_CLIENT_SECRET` | Client Secret do app | `abcdef12-3456-7890-abcd-ef1234567890` |
| `HUBSPOT_REDIRECT_URI` | URL de callback | `https://seu-app.vercel.app/api/oauth/callback` |

## 📖 Como Usar

### 1. Instalação Inicial

1. Acesse `https://seu-app.vercel.app`
2. Clique em "🔐 Instalar no HubSpot"
3. Autorize o app na sua conta HubSpot
4. Você será redirecionado de volta com sucesso

### 2. Criar Campos

1. Após autorizar, clique em "➕ Criar Campos"
2. Os campos serão criados automaticamente no objeto Empresas
3. Verifique o log para confirmar a criação

### 3. Teste (Dry Run)

- Use o botão "🧪 Teste" para verificar sem criar campos
- Útil para validar a conexão e configuração

## 🔍 Endpoints da API

### GET /api/oauth/callback
Processa o callback OAuth do HubSpot.

**Query params:**
- `code` - Código de autorização
- `error` - Erro (se houver)

### GET/POST /api/setup/create-fields
Cria os campos no HubSpot.

**Query params:**
- `dryRun=1` - Modo teste, não cria campos

**Resposta:**
```json
{
  "ok": true,
  "portalId": "123456",
  "summary": {
    "total": 3,
    "created": 3,
    "already_exists": 0,
    "errors": 0
  }
}
```

## 🐛 Troubleshooting

### Erro: "Cannot GET /api/oauth/callback"
- Verifique se o `vercel.json` está configurado corretamente
- Confirme que o arquivo está em `/api/oauth/callback.js`

### Erro: "Missing env vars"
- Configure as variáveis no painel do Vercel
- Faça redeploy após adicionar variáveis

### Erro: "Token expirado"
- Refaça o fluxo OAuth clicando em "Instalar no HubSpot"
- Tokens em memória são perdidos em redeploy

### Erro ao criar campos
- Verifique se os scopes estão corretos
- Confirme que o token tem permissão para criar propriedades

## 📝 Notas Importantes

1. **Tokens em Memória:** Por enquanto, os tokens são armazenados em memória e serão perdidos em redeploys
2. **Campos Únicos:** Se os campos já existirem, o app reportará como "already_exists"
3. **Rate Limits:** Respeite os limites da API do HubSpot

## 🔄 Próximas Fases

### Fase 2 - Enriquecimento
- [ ] Integração com API de CNPJ
- [ ] Webhook para mudanças no campo status_enriquecimento
- [ ] Processamento assíncrono

### Fase 3 - Produção
- [ ] Persistência de tokens (Redis/DB)
- [ ] Refresh token automático
- [ ] Logs estruturados
- [ ] Monitoramento

## 📄 Licença

MIT

## 🤝 Suporte

Para dúvidas ou problemas, abra uma issue no GitHub.

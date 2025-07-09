
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;
const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;

app.use(express.json());

// Middleware para headers CORS e iframe do HubSpot
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://app.hubspot.com https://app-eu1.hubspot.com https://app.hubspotqa.com"
  );
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Página de configurações simplificada compatível com HubSpot
app.get('/settings', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>CNPJ Enricher - Configurações</title>
      <style>
        body {
          font-family: sans-serif;
          padding: 2rem;
          background: #f7fafc;
          color: #2d3748;
        }
        .card {
          max-width: 600px;
          margin: auto;
          background: white;
          border-radius: 12px;
          padding: 2rem;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
          text-align: center;
          color: #2b6cb0;
        }
        .status {
          margin-top: 1rem;
          font-weight: bold;
        }
        button {
          margin: 1rem 0.5rem 0 0;
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 8px;
          background: #2b6cb0;
          color: white;
          cursor: pointer;
        }
        button.secondary {
          background: #e2e8f0;
          color: #2d3748;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>⚙️ Configurações do CNPJ Enricher</h1>
        <p>Todos os dados são salvos no campo <strong>teste_cnpj</strong> como texto formatado.</p>
        <button onclick="createTestField()">🔧 Criar Campo</button>
        <button class="secondary" onclick="testEnrichment()">🧪 Testar Enriquecimento</button>
        <div class="status" id="status"></div>
      </div>
      <script>
        async function createTestField() {
          document.getElementById('status').textContent = 'Criando campo...';
          const res = await fetch('/create-test-field', { method: 'POST' });
          const data = await res.json();
          document.getElementById('status').textContent = data.success ? 'Campo criado com sucesso' : 'Erro: ' + data.error;
        }
        async function testEnrichment() {
          document.getElementById('status').textContent = 'Testando enriquecimento...';
          const res = await fetch('/create-test-company', { method: 'POST' });
          const data = await res.json();
          if (data.companyId) {
            const enrich = await fetch('/enrich', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ companyId: data.companyId })
            });
            const r = await enrich.json();
            document.getElementById('status').textContent = r.success ? 'Enriquecimento finalizado!' : 'Erro: ' + r.error;
          } else {
            document.getElementById('status').textContent = 'Erro ao criar empresa de teste';
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Resto da lógica do seu index.js permanece inalterada aqui...

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

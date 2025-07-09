export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ message: 'Sync CNPJ API is online' });
  }

  if (req.method === 'POST') {
    // lógica da integração aqui
    return res.status(200).json({ message: 'POST recebido e processado' });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}

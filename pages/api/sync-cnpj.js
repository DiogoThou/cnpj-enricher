// pages/api/sync-cnpj.js

export default function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ message: 'GET recebido com sucesso!' });
  }

  res.setHeader('Allow', ['GET']);
  return res.status(405).end(`Método ${req.method} não permitido`);
}

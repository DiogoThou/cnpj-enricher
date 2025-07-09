// pages/api/sync-cnpj.js

export default function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ message: 'GET funcionando!' });
  }

  res.status(405).json({ message: 'Método não permitido' });
}

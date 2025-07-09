export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      message: 'Endpoint /api/sync-cnpj funcionando via GET!',
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

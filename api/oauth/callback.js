export default async function handler(req, res) {
  const { code, error, error_description } = req.query;

  // Se o usuário recusou ou deu algum erro no consent
  if (error) {
    return res.status(400).send(`OAuth error: ${error} - ${error_description || ""}`);
  }

  // Só para confirmar que o callback está funcionando
  if (!code) {
    return res.status(400).send("Missing ?code in querystring");
  }

  // Por enquanto: apenas mostrar o code (no próximo passo trocamos por access_token)
  return res.status(200).send(`Callback OK! Code recebido: ${code}`);
}

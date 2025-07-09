export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido' });
  }

  try {
    // Aqui você pode colocar a lógica real da atualização do CNPJ
    console.log("🔁 Botão de atualização de CNPJ clicado via HubSpot");

    return res.status(200).json({
      status: 'success',
      message: 'Dados do CNPJ atualizados com sucesso.',
    });
  } catch (error) {
    console.error('Erro ao atualizar dados do CNPJ:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao atualizar dados do CNPJ.',
    });
  }
}

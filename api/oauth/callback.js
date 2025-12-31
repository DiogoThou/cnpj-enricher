import { exchangeCodeForToken } from "../../lib/hubspot.js";
import { setTokens } from "../../lib/store.js";

export default async function handler(req, res) {
  try {
    const { code, error, error_description } = req.query;

    if (error) {
      return res.status(400).send(`OAuth error: ${error}. ${error_description || ""}`);
    }

    if (!code) {
      return res.status(400).send("Missing ?code in querystring");
    }

    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(500).json({
        ok: false,
        error: "Missing env vars",
        required: ["HUBSPOT_CLIENT_ID", "HUBSPOT_CLIENT_SECRET", "HUBSPOT_REDIRECT_URI"]
      });
    }

    const tokenData = await exchangeCodeForToken({
      clientId,
      clientSecret,
      redirectUri,
      code
    });

    // tokenData inclui: access_token, refresh_token, expires_in, token_type
    setTokens({
      portalId: tokenData.hub_id,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in
    });

    // Redireciona para a home (botão Criar campos)
    return res.status(302).setHeader("Location", "/").end();
  } catch (e) {
    const msg = e?.response?.data || e?.message || "Unknown error";
    return res.status(500).json({ ok: false, error: msg });
  }
}

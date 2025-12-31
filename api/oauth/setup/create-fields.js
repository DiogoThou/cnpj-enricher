import { getTokens } from "../../lib/store.js";
import { createCompanyProperties } from "../../lib/hubspot.js";
import { COMPANY_FIELDS } from "../../lib/fields.js";

export default async function handler(req, res) {
  try {
    const dryRun = req.query?.dryRun === "1";

    const { accessToken, portalId, expiresAt } = getTokens();

    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        message: "Sem token. Faça a instalação OAuth primeiro.",
        hint: "Abra o link de instalação do HubSpot e conclua o consentimento."
      });
    }

    const now = Date.now();
    const expired = expiresAt && now > expiresAt;

    if (expired) {
      return res.status(401).json({
        ok: false,
        message: "Token expirado (para testes estamos usando store em memória). Reinstale para gerar token de novo."
      });
    }

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        portalId,
        mode: "dryRun",
        fieldsToCreate: COMPANY_FIELDS.map(f => f.name)
      });
    }

    const result = await createCompanyProperties({
      accessToken,
      properties: COMPANY_FIELDS
    });

    return res.status(200).json({
      ok: true,
      portalId,
      created: result
    });
  } catch (e) {
    const msg = e?.response?.data || e?.message || "Unknown error";
    return res.status(500).json({ ok: false, error: msg });
  }
}

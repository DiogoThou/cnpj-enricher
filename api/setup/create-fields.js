exports.main = async (context = {}, sendResponse) => {
  const logs = [];
  const log = (label, data) => {
    const line = { label, data };
    logs.push(line);
    console.log(`[createFields] ${label}`, data ?? "");
  };

  try {
    const accessToken = context?.accessToken;
    const portalId = context?.portalId;

    log("start", { portalId, hasAccessToken: !!accessToken });

    if (!accessToken) {
      return sendResponse({
        statusCode: 401,
        body: {
          ok: false,
          error: "NO_ACCESS_TOKEN",
          message:
            "Não veio accessToken. Reinstale o app e garanta que OAuth está ok.",
          logs
        }
      });
    }

    const propertyPayload = {
      name: "cnpj_teste",
      label: "CNPJ (Teste)",
      type: "string",
      fieldType: "text",
      groupName: "companyinformation",
      description: "Campo de teste criado pelo app CRMHub",
      hidden: false
    };

    log("payload", propertyPayload);

    const url =
      "https://api.hubapi.com/crm/v3/properties/companies";

    log("request", { method: "POST", url });

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(propertyPayload)
    });

    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}

    log("response", { status: resp.status, body: json ?? text });

    // Se já existe, HubSpot retorna erro. Vamos tratar como OK.
    const alreadyExists =
      resp.status === 409 ||
      (json?.message && String(json.message).toLowerCase().includes("already exists"));

    if (resp.ok || alreadyExists) {
      return sendResponse({
        statusCode: 200,
        body: {
          ok: true,
          created: resp.ok,
          alreadyExists,
          propertyName: "cnpj_teste",
          logs
        }
      });
    }

    return sendResponse({
      statusCode: resp.status,
      body: {
        ok: false,
        error: "HUBSPOT_API_ERROR",
        status: resp.status,
        response: json ?? text,
        logs
      }
    });
  } catch (err) {
    return sendResponse({
      statusCode: 500,
      body: {
        ok: false,
        error: "UNEXPECTED_ERROR",
        message: err?.message || String(err),
        stack: err?.stack,
        logs
      }
    });
  }
};

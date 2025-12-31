import axios from "axios";

export async function exchangeCodeForToken({ clientId, clientSecret, redirectUri, code }) {
  const url = "https://api.hubapi.com/oauth/v1/token";

  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("redirect_uri", redirectUri);
  params.append("code", code);

  const res = await axios.post(url, params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  return res.data;
}

export async function createCompanyProperties({ accessToken, properties }) {
  const url = "https://api.hubapi.com/crm/v3/properties/companies/batch/create";

  const res = await axios.post(
    url,
    { inputs: properties },
    { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
  );

  return res.data;
}

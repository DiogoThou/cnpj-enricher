// ⚡ Middleware de autenticação
let HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;

function setToken(token) {
  HUBSPOT_ACCESS_TOKEN = token;
}

function getToken() {
  return HUBSPOT_ACCESS_TOKEN;
}

function authMiddleware(req, res, next) {
  req.hubspotToken = HUBSPOT_ACCESS_TOKEN;
  next();
}

module.exports = {
  authMiddleware,
  setToken,
  getToken
};
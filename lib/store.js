let memory = {
  portalId: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null
};

export function setTokens({ portalId, accessToken, refreshToken, expiresIn }) {
  memory.portalId = portalId || null;
  memory.accessToken = accessToken;
  memory.refreshToken = refreshToken || null;
  memory.expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;
}

export function getTokens() {
  return { ...memory };
}

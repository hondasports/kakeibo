import { resolveLineIntegrationMode } from "../../domain/lineLink/integrationMode";

export function getLineIntegrationMode() {
  return resolveLineIntegrationMode(process.env.LINE_INTEGRATION_MODE, process.env.APP_ENV);
}

export function getLineLoginConfiguration() {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  const redirectUri = process.env.LINE_LOGIN_REDIRECT_URI;
  if (!channelId || !channelSecret || !redirectUri) {
    throw new Error("LINE integration is unavailable");
  }
  return { channelId, channelSecret, redirectUri };
}

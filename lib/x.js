import { APP_ORIGIN } from './security.js';
import { encryptionReady, storageReady } from './linkedin.js';
import { getSocialAccount, saveSocialAccount } from './social-storage.js';

export function xRedirectUri() {
  return process.env.X_REDIRECT_URI || `${APP_ORIGIN}/api/oauth/x/callback`;
}

export function xCredentialsReady() {
  return Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET && xRedirectUri());
}

export function xPublishingReady() {
  return xCredentialsReady() && encryptionReady() && storageReady();
}

function basicAuth() {
  return `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64')}`;
}

export async function exchangeXToken(fields) {
  const response = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...fields, client_id: process.env.X_CLIENT_ID }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error('X could not exchange the authorization code. Check its OAuth 2.0 settings and callback URL.');
  return result;
}

async function currentAccount() {
  const account = await getSocialAccount('x');
  if (!account) return null;
  if (account.expiresAt - Date.now() > 60_000) return account;
  if (!account.refreshToken) throw new Error('X connection expired. Reconnect the account.');
  const token = await exchangeXToken({ grant_type: 'refresh_token', refresh_token: account.refreshToken });
  const updated = {
    ...account,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || account.refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  await saveSocialAccount('x', updated);
  return updated;
}

export async function publishXText(text) {
  const account = await currentAccount();
  if (!account) throw new Error('Connect X before publishing.');
  const response = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.data?.id) {
    if (response.status === 401) throw new Error('X access expired or was revoked. Reconnect X and try again.');
    throw new Error(`X rejected the post (${response.status}). Check the app write permission and account access.`);
  }
  return result.data.id;
}

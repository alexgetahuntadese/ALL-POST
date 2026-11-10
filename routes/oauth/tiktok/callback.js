import { APP_ORIGIN, clearOAuthCookie, requireSession, verifyOAuthState } from '../../../lib/security.js';
import { encryptionReady } from '../../../lib/linkedin.js';
import { exchangeTikTokToken, getTikTokProfile, tiktokCredentialsReady, tiktokRedirectUri } from '../../../lib/tiktok.js';
import { saveSocialAccount } from '../../../lib/social-storage.js';

function finish(response, status, message) {
  response.setHeader('Set-Cookie', clearOAuthCookie('tiktok'));
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).send(message);
}

export default async function handler(request, response) {
  if (!requireSession(request, response)) return;
  const state = String(request.query?.state || '');
  if (!verifyOAuthState(request, state, 'tiktok')) return finish(response, 400, 'TikTok sign-in state did not match. Return to ALL-POST and try again.');
  if (request.query?.error) return finish(response, 400, 'TikTok authorization was cancelled. You can return to ALL-POST.');
  if (!tiktokCredentialsReady() || !encryptionReady()) return finish(response, 503, 'TikTok is not configured in ALL-POST yet.');
  try {
    const code = String(request.query?.code || '');
    if (!code) return finish(response, 400, 'TikTok did not return an authorization code.');
    const token = await exchangeTikTokToken({ grant_type: 'authorization_code', code, redirect_uri: tiktokRedirectUri() });
    const profile = await getTikTokProfile(token.access_token);
    if (!profile?.open_id) throw new Error('Could not read the TikTok profile.');
    await saveSocialAccount('tiktok', {
      id: profile.open_id,
      name: profile.display_name || 'TikTok creator',
      username: profile.display_name || '',
      picture: profile.avatar_url || null,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      refreshExpiresAt: Date.now() + token.refresh_expires_in * 1000,
    });
    response.setHeader('Set-Cookie', clearOAuthCookie('tiktok'));
    response.setHeader('Cache-Control', 'no-store');
    response.writeHead(302, { Location: `${APP_ORIGIN}/?connection=tiktok` });
    response.end();
  } catch (error) {
    console.error('TikTok OAuth callback failed:', error.message);
    finish(response, 502, 'TikTok could not complete the connection. Check Login Kit, approved scopes, and the redirect URL.');
  }
}

import { APP_ORIGIN, clearOAuthCookie, requireSession, verifyOAuthState } from '../../../lib/security.js';
import { encryptionReady } from '../../../lib/linkedin.js';
import { exchangeInstagramToken, getInstagramProfile, instagramCredentialsReady, instagramRedirectUri } from '../../../lib/instagram.js';
import { saveSocialAccount } from '../../../lib/social-storage.js';

function finish(response, status, message) {
  response.setHeader('Set-Cookie', clearOAuthCookie('instagram'));
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).send(message);
}

export default async function handler(request, response) {
  if (!requireSession(request, response)) return;
  const state = String(request.query?.state || '');
  if (!verifyOAuthState(request, state, 'instagram')) return finish(response, 400, 'Instagram sign-in state did not match. Return to ALL-POST and try again.');
  if (request.query?.error) return finish(response, 400, 'Instagram authorization was cancelled. You can return to ALL-POST.');
  if (!instagramCredentialsReady() || !encryptionReady()) return finish(response, 503, 'Instagram is not configured in ALL-POST yet.');
  try {
    const code = String(request.query?.code || '');
    if (!code) return finish(response, 400, 'Instagram did not return an authorization code.');
    const shortToken = await exchangeInstagramToken({ grant_type: 'authorization_code', redirect_uri: instagramRedirectUri(), code });
    const longUrl = new URL('https://graph.instagram.com/access_token');
    longUrl.search = new URLSearchParams({ grant_type: 'ig_exchange', client_secret: process.env.META_APP_SECRET, access_token: shortToken.access_token });
    const longResponse = await fetch(longUrl);
    const longToken = await longResponse.json();
    if (!longResponse.ok || !longToken.access_token) throw new Error('Instagram could not issue a long-lived access token.');
    const profile = await getInstagramProfile(longToken.access_token);
    const userId = String(profile.user_id || shortToken.user_id || profile.id || '');
    if (!userId) throw new Error('Could not read the Instagram professional profile.');
    await saveSocialAccount('instagram', {
      userId,
      name: profile.username || 'Instagram professional account',
      username: profile.username || '',
      accountType: profile.account_type || '',
      accessToken: longToken.access_token,
      expiresAt: Date.now() + longToken.expires_in * 1000,
    });
    response.setHeader('Set-Cookie', clearOAuthCookie('instagram'));
    response.setHeader('Cache-Control', 'no-store');
    response.writeHead(302, { Location: `${APP_ORIGIN}/?connection=instagram` });
    response.end();
  } catch (error) {
    console.error('Instagram OAuth callback failed:', error.message);
    finish(response, 502, 'Instagram could not complete the connection. Check the professional account, app permissions, and redirect URL.');
  }
}

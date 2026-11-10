import { APP_ORIGIN, clearOAuthCookie, requireSession, verifyOAuthState } from '../../../lib/security.js';
import { encryptionReady } from '../../../lib/linkedin.js';
import { exchangeYouTubeToken, getYouTubeChannel, youtubeCredentialsReady, youtubeRedirectUri } from '../../../lib/youtube.js';
import { saveSocialAccount } from '../../../lib/social-storage.js';

function finish(response, status, message) {
  response.setHeader('Set-Cookie', clearOAuthCookie('youtube'));
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).send(message);
}

export default async function handler(request, response) {
  if (!requireSession(request, response)) return;
  const state = String(request.query?.state || '');
  if (!verifyOAuthState(request, state, 'youtube')) return finish(response, 400, 'Google sign-in state did not match. Return to ALL-POST and try again.');
  if (request.query?.error) return finish(response, 400, 'Google authorization was cancelled. You can return to ALL-POST.');
  if (!youtubeCredentialsReady() || !encryptionReady()) return finish(response, 503, 'YouTube is not configured in ALL-POST yet.');
  try {
    const code = String(request.query?.code || '');
    if (!code) return finish(response, 400, 'Google did not return an authorization code.');
    const token = await exchangeYouTubeToken({ grant_type: 'authorization_code', code, redirect_uri: youtubeRedirectUri() });
    const channel = await getYouTubeChannel(token.access_token);
    await saveSocialAccount('youtube', {
      ...channel,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt: Date.now() + token.expires_in * 1000,
    });
    response.setHeader('Set-Cookie', clearOAuthCookie('youtube'));
    response.setHeader('Cache-Control', 'no-store');
    response.writeHead(302, { Location: `${APP_ORIGIN}/?connection=youtube` });
    response.end();
  } catch (error) {
    console.error('YouTube OAuth callback failed:', error.message);
    finish(response, 502, 'Google could not complete the YouTube connection. Check the OAuth client, enabled API, and redirect URL.');
  }
}

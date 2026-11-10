import { clearOAuthCookie, requireSession, verifyOAuthState } from '../../../lib/security.js';
import { credentialsReady, encryptionReady, saveLinkedInAccount, exchangeLinkedInToken } from '../../../lib/linkedin.js';
import { APP_ORIGIN } from '../../../lib/security.js';

function finish(response, status, message) {
  response.setHeader('Set-Cookie', clearOAuthCookie());
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).send(message);
}

export default async function handler(request, response) {
  if (!requireSession(request, response)) return;
  const returnedState = String(request.query?.state || '');
  if (!verifyOAuthState(request, returnedState)) return finish(response, 400, 'LinkedIn sign-in state did not match. Return to ALL-POST and try again.');
  if (request.query?.error) return finish(response, 400, 'LinkedIn authorization was cancelled. You can return to ALL-POST.');
  if (!credentialsReady() || !encryptionReady()) return finish(response, 503, 'LinkedIn is not configured on ALL-POST yet.');

  try {
    const code = String(request.query?.code || '');
    if (!code) return finish(response, 400, 'LinkedIn did not return an authorization code.');
    const token = await exchangeLinkedInToken({ grant_type: 'authorization_code', code });
    const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.sub) throw new Error('Could not read the LinkedIn profile.');
    await saveLinkedInAccount({
      sub: profile.sub,
      name: profile.name || 'LinkedIn member',
      picture: profile.picture || null,
      accessToken: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    });
    response.setHeader('Set-Cookie', clearOAuthCookie());
    response.setHeader('Cache-Control', 'no-store');
    response.writeHead(302, { Location: `${APP_ORIGIN}/?connection=linkedin` });
    response.end();
  } catch (error) {
    console.error('LinkedIn OAuth callback failed:', error.message);
    finish(response, 502, 'LinkedIn could not complete the connection. Check its app permissions and try again.');
  }
}

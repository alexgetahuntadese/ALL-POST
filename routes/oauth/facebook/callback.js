import { APP_ORIGIN, clearOAuthCookie, oauthStateData, requireSession } from '../../../lib/security.js';
import { encryptionReady } from '../../../lib/linkedin.js';
import { exchangeFacebookCode, facebookCredentialsReady, getFacebookPages } from '../../../lib/facebook.js';
import { saveSocialAccount } from '../../../lib/social-storage.js';
function finish(response, status, message) { response.setHeader('Set-Cookie', clearOAuthCookie('facebook')); response.setHeader('Cache-Control', 'no-store'); response.status(status).send(message); }
export default async function handler(request, response) {
  if (!requireSession(request, response)) return;
  const stateData = oauthStateData(request, 'facebook');
  if (!stateData || stateData.state !== String(request.query?.state || '')) return finish(response, 400, 'Facebook sign-in state did not match. Return to ALL-POST and try again.');
  if (request.query?.error) return finish(response, 400, 'Facebook authorization was cancelled. You can return to ALL-POST.');
  if (!facebookCredentialsReady() || !encryptionReady()) return finish(response, 503, 'Facebook is not configured in ALL-POST yet.');
  try {
    const code = String(request.query?.code || '');
    if (!code) return finish(response, 400, 'Facebook did not return an authorization code.');
    const token = await exchangeFacebookCode(code);
    const pages = await getFacebookPages(token.access_token);
    if (!pages.length) throw new Error('No Facebook Pages were returned.');
    await saveSocialAccount('facebook', { name: pages.length === 1 ? pages[0].name : `${pages.length} Facebook Pages`, pages });
    response.setHeader('Set-Cookie', clearOAuthCookie('facebook')); response.setHeader('Cache-Control', 'no-store');
    response.writeHead(302, { Location: `${APP_ORIGIN}/?connection=facebook` }); response.end();
  } catch (error) {
    console.error('Facebook OAuth callback failed:', error.message);
    finish(response, 502, 'Facebook could not complete the connection. Check the Page roles, permissions, app review, and exact callback URL.');
  }
}

import { APP_ORIGIN, clearOAuthCookie, oauthStateData, requireSession } from '../../../lib/security.js';
import { xPublishingReady, xRedirectUri, exchangeXToken } from '../../../lib/x.js';
import { saveSocialAccount } from '../../../lib/social-storage.js';

function finish(response, status, message) {
  response.setHeader('Set-Cookie', clearOAuthCookie('x'));
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).send(message);
}

export default async function handler(request, response) {
  if (!requireSession(request, response)) return;
  const data = oauthStateData(request, 'x');
  const state = String(request.query?.state || '');
  if (!data || data.state !== state || !data.verifier) return finish(response, 400, 'X sign-in state did not match. Return to ALL-POST and try again.');
  if (request.query?.error) return finish(response, 400, 'X authorization was cancelled. You can return to ALL-POST.');
  if (!xPublishingReady()) return finish(response, 503, 'X is not configured in ALL-POST yet.');
  try {
    const code = String(request.query?.code || '');
    if (!code) return finish(response, 400, 'X did not return an authorization code.');
    const token = await exchangeXToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: xRedirectUri(),
      code_verifier: data.verifier,
    });
    const meResponse = await fetch('https://api.x.com/2/users/me?user.fields=profile_image_url', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const me = await meResponse.json();
    if (!meResponse.ok || !me.data?.id) throw new Error('Could not read the X profile for this account.');
    await saveSocialAccount('x', {
      id: me.data.id,
      name: me.data.name,
      username: me.data.username,
      picture: me.data.profile_image_url || null,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt: Date.now() + token.expires_in * 1000,
    });
    response.setHeader('Set-Cookie', clearOAuthCookie('x'));
    response.setHeader('Cache-Control', 'no-store');
    response.writeHead(302, { Location: `${APP_ORIGIN}/?connection=x` });
    response.end();
  } catch (error) {
    console.error('X OAuth callback failed:', error.message);
    finish(response, 502, 'X could not complete the connection. Check its OAuth settings and app permissions.');
  }
}

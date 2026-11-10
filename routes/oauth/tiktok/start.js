import { randomBytes } from 'node:crypto';
import { requireSession, setOAuthState } from '../../../lib/security.js';
import { encryptionReady, storageReady } from '../../../lib/linkedin.js';
import { tiktokCredentialsReady, tiktokRedirectUri } from '../../../lib/tiktok.js';

export default function handler(request, response) {
  if (!requireSession(request, response)) return;
  if (!tiktokCredentialsReady() || !encryptionReady() || !storageReady()) {
    return response.status(503).json({ error: 'TikTok credentials and private token storage must be configured first.' });
  }
  const state = randomBytes(32).toString('base64url');
  setOAuthState(request, response, state, 'tiktok');
  const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
  url.search = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    response_type: 'code',
    scope: 'user.info.basic,video.publish',
    redirect_uri: tiktokRedirectUri(),
    state,
  });
  response.writeHead(302, { Location: url.toString(), 'Cache-Control': 'no-store' });
  response.end();
}

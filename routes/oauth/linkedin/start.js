import { randomBytes } from 'node:crypto';
import { credentialsReady, encryptionReady, storageReady } from '../../../lib/linkedin.js';
import { APP_ORIGIN, requireSession, setOAuthState } from '../../../lib/security.js';

export default function handler(request, response) {
  if (!requireSession(request, response)) return;
  if (!credentialsReady() || !encryptionReady() || !storageReady()) {
    return response.status(503).json({ error: 'LinkedIn credentials and private token storage must be configured first.' });
  }
  const state = randomBytes(32).toString('base64url');
  setOAuthState(request, response, state);
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${APP_ORIGIN}/api/oauth/linkedin/callback`;
  const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    scope: 'openid profile w_member_social',
  });
  response.writeHead(302, { Location: url.toString(), 'Cache-Control': 'no-store' });
  response.end();
}

import { randomBytes } from 'node:crypto';
import { APP_ORIGIN, requireSession, setOAuthState } from '../../../lib/security.js';
import { encryptionReady, storageReady } from '../../../lib/linkedin.js';
import { instagramCredentialsReady, instagramRedirectUri } from '../../../lib/instagram.js';

export default function handler(request, response) {
  if (!requireSession(request, response)) return;
  if (!instagramCredentialsReady() || !encryptionReady() || !storageReady()) {
    return response.status(503).json({ error: 'Instagram credentials and private token storage must be configured first.' });
  }
  const state = randomBytes(32).toString('base64url');
  setOAuthState(request, response, state, 'instagram');
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    redirect_uri: instagramRedirectUri(),
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_content_publish',
    state,
  });
  response.writeHead(302, { Location: url.toString(), 'Cache-Control': 'no-store' });
  response.end();
}

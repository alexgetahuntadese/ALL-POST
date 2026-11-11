import { randomBytes } from 'node:crypto';
import { requireSession, setOAuthState } from '../../../lib/security.js';
import { encryptionReady, storageReady } from '../../../lib/linkedin.js';
import { facebookCredentialsReady, facebookRedirectUri } from '../../../lib/facebook.js';
export default function handler(request, response) {
  if (!requireSession(request, response)) return;
  if (!facebookCredentialsReady() || !encryptionReady() || !storageReady()) return response.status(503).json({ error: 'Facebook credentials and private token storage must be configured first.' });
  const state = randomBytes(32).toString('base64url');
  setOAuthState(request, response, state, 'facebook');
  const url = new URL(`https://www.facebook.com/${process.env.FACEBOOK_API_VERSION || 'v26.0'}/dialog/oauth`);
  url.search = new URLSearchParams({ client_id: process.env.META_APP_ID, redirect_uri: facebookRedirectUri(), response_type: 'code', scope: 'pages_show_list,pages_read_engagement,pages_manage_posts', state });
  response.writeHead(302, { Location: url.toString(), 'Cache-Control': 'no-store' }); response.end();
}

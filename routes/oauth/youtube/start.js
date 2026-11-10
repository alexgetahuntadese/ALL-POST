import { randomBytes } from 'node:crypto';
import { requireSession, setOAuthState } from '../../../lib/security.js';
import { encryptionReady, storageReady } from '../../../lib/linkedin.js';
import { youtubeCredentialsReady, youtubeRedirectUri } from '../../../lib/youtube.js';

export default function handler(request, response) {
  if (!requireSession(request, response)) return;
  if (!youtubeCredentialsReady() || !encryptionReady() || !storageReady()) {
    return response.status(503).json({ error: 'Google OAuth credentials and private token storage must be configured first.' });
  }
  const state = randomBytes(32).toString('base64url');
  setOAuthState(request, response, state, 'youtube');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: youtubeRedirectUri(),
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/youtube.upload',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  response.writeHead(302, { Location: url.toString(), 'Cache-Control': 'no-store' });
  response.end();
}

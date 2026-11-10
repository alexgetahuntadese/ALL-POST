import { randomBytes, createHash } from 'node:crypto';
import { requireSession, setOAuthState } from '../../../lib/security.js';
import { xPublishingReady, xRedirectUri } from '../../../lib/x.js';

export default function handler(request, response) {
  if (!requireSession(request, response)) return;
  if (!xPublishingReady()) return response.status(503).json({ error: 'X OAuth credentials and private token storage must be configured first.' });
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  setOAuthState(request, response, state, 'x', { verifier });
  const url = new URL('https://x.com/i/oauth2/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.X_CLIENT_ID,
    redirect_uri: xRedirectUri(),
    scope: 'tweet.read tweet.write users.read offline.access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  response.writeHead(302, { Location: url.toString(), 'Cache-Control': 'no-store' });
  response.end();
}

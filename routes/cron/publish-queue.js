import { createPublicKey, verify } from 'node:crypto';
import { processDuePosts } from '../../lib/post-queue.js';
import { APP_ORIGIN } from '../../lib/security.js';

let keySetCache;

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

async function signingKey(kid) {
  if (!keySetCache || keySetCache.expiresAt < Date.now()) {
    const response = await fetch('https://token.actions.githubusercontent.com/.well-known/jwks');
    if (!response.ok) throw new Error('GitHub OIDC key lookup failed.');
    keySetCache = { keys: (await response.json()).keys, expiresAt: Date.now() + 10 * 60_000 };
  }
  const jwk = keySetCache.keys.find((key) => key.kid === kid && key.use === 'sig' && key.alg === 'RS256');
  return jwk ? createPublicKey({ key: jwk, format: 'jwk' }) : null;
}

async function authorized(request) {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra) return false;
  try {
    const header = decodeSegment(encodedHeader);
    const claims = decodeSegment(encodedPayload);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return false;
    const key = await signingKey(header.kid);
    if (!key || !verify('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), key, Buffer.from(encodedSignature, 'base64url'))) return false;
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    return claims.iss === 'https://token.actions.githubusercontent.com'
      && audiences.includes(APP_ORIGIN)
      && Number.isFinite(claims.exp) && claims.exp > now
      && Number.isFinite(claims.iat) && claims.iat <= now + 60 && claims.iat >= now - 10 * 60
      && (!Number.isFinite(claims.nbf) || claims.nbf <= now)
      && claims.repository === 'alexgetahuntadese/ALL-POST'
      && String(claims.repository_id) === '1446870040'
      && claims.ref === 'refs/heads/main'
      && claims.workflow_ref === 'alexgetahuntadese/ALL-POST/.github/workflows/publish-queue.yml@refs/heads/main'
      && ['schedule', 'workflow_dispatch'].includes(claims.event_name);
  } catch {
    return false;
  }
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).end();
  }
  if (!await authorized(request)) return response.status(401).json({ error: 'Unauthorized.' });
  try {
    const posts = await processDuePosts();
    return response.status(200).json({ processed: posts.length, posts });
  } catch (error) {
    console.error('Scheduled publishing run failed:', error.message);
    return response.status(500).json({ error: 'Scheduled publishing run failed.' });
  }
}

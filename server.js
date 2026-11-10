import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const dataDir = resolve(root, '.data');
const keyPath = resolve(dataDir, 'linkedin-token.key');
const tokenPath = resolve(dataDir, 'linkedin-token.enc');
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 4173);
const baseUrl = process.env.APP_BASE_URL ?? `http://${host}:${port}`;
const redirectUri = process.env.LINKEDIN_REDIRECT_URI ?? `${baseUrl}/api/oauth/linkedin/callback`;
const linkedinVersion = process.env.LINKEDIN_VERSION ?? '202610';
const pendingStates = new Map();

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function send(res, status, body, headers = {}) {
  const content = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
  res.end(content);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

async function readJson(req, limit = 16_000) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error('Request body is too large.');
  }
  return JSON.parse(body || '{}');
}

async function encryptionKey() {
  await mkdir(dataDir, { recursive: true });
  try {
    const key = await readFile(keyPath);
    if (key.length !== 32) throw new Error('The local token encryption key has an invalid length.');
    return key;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const key = randomBytes(32);
    await writeFile(keyPath, key, { flag: 'wx' });
    return key;
  }
}

async function saveAccount(account) {
  const key = await encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(account)), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  await writeFile(tokenPath, payload, { encoding: 'utf8' });
}

async function loadAccount() {
  let raw;
  try {
    raw = await readFile(tokenPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const payload = Buffer.from(raw, 'base64');
  const key = await encryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  const decrypted = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

function credentialsReady() {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

async function exchangeToken(params) {
  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...params,
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      redirect_uri: redirectUri,
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || 'LinkedIn token exchange failed.');
  return data;
}

async function freshAccount() {
  const account = await loadAccount();
  if (!account) return null;
  if (account.expiresAt - Date.now() > 60_000) return account;
  if (!account.refreshToken) throw new Error('LinkedIn connection expired. Reconnect the account.');
  const token = await exchangeToken({ grant_type: 'refresh_token', refresh_token: account.refreshToken });
  const updated = {
    ...account,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? account.refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  await saveAccount(updated);
  return updated;
}

async function publishLinkedIn(text) {
  const account = await freshAccount();
  if (!account) throw new Error('Connect a LinkedIn account before publishing.');
  const response = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json',
      'Linkedin-Version': linkedinVersion,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${account.sub}`,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LinkedIn returned ${response.status}: ${detail.slice(0, 300)}`);
  }
  return { id: response.headers.get('x-restli-id') };
}

function safeError(error) {
  const message = String(error?.message ?? 'Unexpected server error.');
  return message.replace(/(access_token|refresh_token|client_secret)[^\s]*/gi, '$1 [redacted]');
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url, baseUrl);
  try {
    if (req.method === 'GET' && requestUrl.pathname === '/api/health') {
      return send(res, 200, { ok: true, mode: 'local-prototype' });
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/accounts') {
      const account = await loadAccount();
      return send(res, 200, {
        linkedinConfigured: credentialsReady(),
        linkedin: account ? { connected: true, name: account.name, picture: account.picture } : { connected: false },
      });
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/oauth/linkedin/start') {
      if (!credentialsReady()) return send(res, 503, { error: 'Add LinkedIn client credentials to .env before connecting.' });
      const state = randomBytes(24).toString('hex');
      pendingStates.set(state, Date.now() + 10 * 60_000);
      const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
      authUrl.search = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.LINKEDIN_CLIENT_ID,
        redirect_uri: redirectUri,
        state,
        scope: 'openid profile w_member_social',
      });
      return redirect(res, authUrl.toString());
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/oauth/linkedin/callback') {
      const state = requestUrl.searchParams.get('state');
      const expires = pendingStates.get(state);
      pendingStates.delete(state);
      if (!state || !expires || expires < Date.now()) return send(res, 400, 'The LinkedIn sign-in request expired. Return to ALL-POST and try again.');
      if (requestUrl.searchParams.has('error')) return redirect(res, '/?connection=cancelled');
      const code = requestUrl.searchParams.get('code');
      if (!code) return send(res, 400, 'LinkedIn did not return an authorization code.');
      const token = await exchangeToken({ grant_type: 'authorization_code', code });
      const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      const profile = await profileResponse.json();
      if (!profileResponse.ok || !profile.sub) throw new Error('Could not read the LinkedIn profile for this account.');
      await saveAccount({
        sub: profile.sub,
        name: profile.name ?? 'LinkedIn member',
        picture: profile.picture ?? null,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt: Date.now() + token.expires_in * 1000,
      });
      return redirect(res, '/?connection=linkedin');
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/publish/linkedin') {
      const origin = req.headers.origin;
      if (origin && origin !== baseUrl) return send(res, 403, { error: 'Cross-origin requests are not allowed.' });
      const payload = await readJson(req);
      const text = typeof payload.text === 'string' ? payload.text.trim() : '';
      if (!text) return send(res, 400, { error: 'Write a post before publishing.' });
      if ([...text].length > 3000) return send(res, 400, { error: 'LinkedIn text posts are limited to 3,000 characters.' });
      if (!await loadAccount()) return send(res, 409, { error: 'Connect a LinkedIn account before publishing.' });
      const published = await publishLinkedIn(text);
      return send(res, 201, { published: true, platform: 'linkedin', postId: published.id });
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/accounts/linkedin/disconnect') {
      await unlink(tokenPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      return send(res, 200, { disconnected: true });
    }

    if (req.method === 'GET') {
      const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
      const file = resolve(root, `.${decodeURIComponent(pathname)}`);
      if (!file.startsWith(root + sep) || !['index.html', 'app.js', 'styles.css', 'privacy.html'].includes(file.slice(root.length + 1))) return send(res, 404, 'Not found.');
      const content = await readFile(file);
      res.writeHead(200, {
        'Content-Type': mimeTypes[extname(file)] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      return res.end(content);
    }

    return send(res, 404, { error: 'Not found.' });
  } catch (error) {
    console.error(safeError(error));
    if (!res.headersSent) send(res, 500, { error: safeError(error) });
    else res.destroy();
  }
});

server.listen(port, host, () => {
  console.log(`ALL-POST local app listening at http://${host}:${port}`);
  if (!credentialsReady()) console.log('LinkedIn publishing is not configured yet; add credentials in .env.');
});

setInterval(() => {
  const now = Date.now();
  for (const [state, expiresAt] of pendingStates) if (expiresAt < now) pendingStates.delete(state);
}, 60_000).unref();

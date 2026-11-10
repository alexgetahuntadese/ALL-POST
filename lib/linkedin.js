import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { get, put, del } from '@vercel/blob';

const ACCOUNT_PATH = 'all-post/private/linkedin-account.enc';

export function credentialsReady() {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET && process.env.LINKEDIN_REDIRECT_URI);
}
export function encryptionReady() { return /^[0-9a-f]{64}$/i.test(process.env.OAUTH_ENCRYPTION_KEY || ''); }
export function privateBlobToken() {
  return process.env.PRIVATE_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || '';
}
export function storageReady() {
  return Boolean((process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN) || privateBlobToken());
}

function encryptionKey() {
  if (!encryptionReady()) throw new Error('OAuth token encryption is not configured.');
  return Buffer.from(process.env.OAUTH_ENCRYPTION_KEY, 'hex');
}

export async function getLinkedInAccount() {
  const stored = await get(ACCOUNT_PATH, { access: 'private', useCache: false, token: privateBlobToken() });
  if (!stored || stored.statusCode !== 200 || !stored.stream) return null;
  const chunks = [];
  for await (const chunk of stored.stream) chunks.push(Buffer.from(chunk));
  const payload = Buffer.concat(chunks);
  if (payload.length < 29) throw new Error('Stored LinkedIn connection is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  const clear = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
  return JSON.parse(clear.toString('utf8'));
}

export async function saveLinkedInAccount(account) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(account)), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  await put(ACCOUNT_PATH, payload, {
    access: 'private', contentType: 'application/octet-stream', allowOverwrite: true, cacheControlMaxAge: 60,
    token: privateBlobToken(),
  });
}

export async function removeLinkedInAccount() {
  const stored = await get(ACCOUNT_PATH, { access: 'private', useCache: false, token: privateBlobToken() });
  if (stored?.blob?.url) await del(stored.blob.url, { access: 'private', token: privateBlobToken() });
}

export async function exchangeLinkedInToken(fields) {
  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...fields,
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error('LinkedIn token exchange failed. Check the app credentials and callback URL.');
  return result;
}

export async function publishLinkedInText(text) {
  const account = await getLinkedInAccount();
  if (!account) throw new Error('Connect LinkedIn before publishing.');
  if (account.expiresAt <= Date.now()) throw new Error('LinkedIn access expired. Reconnect the account.');
  const response = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json',
      'Linkedin-Version': process.env.LINKEDIN_VERSION || '202610',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${account.sub}`,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!response.ok) throw new Error(`LinkedIn rejected the post (${response.status}). Check the account authorization and post content.`);
  return response.headers.get('x-restli-id');
}

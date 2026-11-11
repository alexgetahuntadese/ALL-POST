import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { del, get, put } from '@vercel/blob';
import { encryptionReady, privateBlobToken } from './linkedin.js';

const PROVIDERS = new Set(['x', 'instagram', 'facebook', 'tiktok', 'youtube']);

function accountPath(provider) {
  if (!PROVIDERS.has(provider)) throw new Error('Unsupported social account provider.');
  return `all-post/private/${provider}-account.enc`;
}

function encryptionKey() {
  if (!encryptionReady()) throw new Error('OAuth token encryption is not configured.');
  return Buffer.from(process.env.OAUTH_ENCRYPTION_KEY, 'hex');
}

export async function getSocialAccount(provider) {
  const stored = await get(accountPath(provider), { access: 'private', useCache: false, token: privateBlobToken() });
  if (!stored || stored.statusCode !== 200 || !stored.stream) return null;
  const chunks = [];
  for await (const chunk of stored.stream) chunks.push(Buffer.from(chunk));
  const payload = Buffer.concat(chunks);
  if (payload.length < 29) throw new Error('Stored social connection is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  const clear = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
  return JSON.parse(clear.toString('utf8'));
}

export async function saveSocialAccount(provider, account) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(account)), cipher.final()]);
  await put(accountPath(provider), Buffer.concat([iv, cipher.getAuthTag(), encrypted]), {
    access: 'private', contentType: 'application/octet-stream', allowOverwrite: true, cacheControlMaxAge: 60,
    token: privateBlobToken(),
  });
}

export async function removeSocialAccount(provider) {
  const stored = await get(accountPath(provider), { access: 'private', useCache: false, token: privateBlobToken() });
  if (stored?.blob?.url) await del(stored.blob.url, { access: 'private', token: privateBlobToken() });
}

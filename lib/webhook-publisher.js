import { createHmac, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { getSocialAccount } from './social-storage.js';

function validateWebhookUrl(value) {
  const url = new URL(String(value || ''));
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.startsWith('[') || isIP(host) || /^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\.|^0\.|^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|^22[4-9]\.|^23\.|^24[0-9]\.|^25[0-5]\./.test(host)) {
    throw new Error('Webhook destination must be a public HTTPS URL.');
  }
  return url;
}

async function assertPublicDns(url) {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => {
    const ip = address.toLowerCase();
    if (isIP(ip) === 4) return /^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\.|^0\.|^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|^22[4-9]\.|^23\.|^24[0-9]\.|^25[0-5]\./.test(ip);
    return ip === '::' || ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || /^fe[89ab]/.test(ip) || ip.startsWith('ff') || ip.startsWith('::ffff:');
  })) throw new Error('Webhook hostname must resolve only to public IP addresses.');
}

export function createWebhookSignature(secret, timestamp, body) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function verifyWebhookSignature(secret, timestamp, body, signature) {
  const expected = Buffer.from(createWebhookSignature(secret, timestamp, body), 'hex');
  let received;
  try { received = Buffer.from(String(signature || ''), 'hex'); } catch { return false; }
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function validateWebhookConfig({ url, secret }) {
  validateWebhookUrl(url);
  if (typeof secret !== 'string' || secret.length < 32 || secret.length > 256) throw new Error('Webhook signing secret must be 32–256 characters.');
}

export async function publishWebhookPost(job) {
  const account = await getSocialAccount('webhook');
  if (!account?.url || !account?.secret) throw new Error('Configure a webhook destination before publishing.');
  const payload = {
    id: job.id,
    scheduledAt: job.scheduledAt || null,
    platform: 'webhook',
    text: job.payload.overrides?.webhook?.text ?? job.payload.text,
    media: job.payload.overrides?.webhook?.mediaUrl
      ? { url: job.payload.overrides.webhook.mediaUrl, type: job.payload.overrides.webhook.mediaType }
      : job.payload.mediaUrl ? { url: job.payload.mediaUrl, type: job.payload.mediaType } : null,
  };
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const url = validateWebhookUrl(account.url);
  await assertPublicDns(url);
  const response = await fetch(url, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', 'X-ALL-POST-Timestamp': timestamp, 'X-ALL-POST-Signature': `sha256=${createWebhookSignature(account.secret, timestamp, body)}`, 'X-ALL-POST-Event': 'post.publish', 'Idempotency-Key': `${job.id}:webhook` },
    body,
  });
  if (response.status >= 300 && response.status < 400) throw new Error('Webhook redirects are not followed. Use the final HTTPS endpoint URL.');
  if (!response.ok) {
    const error = new Error(`Webhook returned HTTP ${response.status}.`);
    error.status = response.status;
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  const result = await response.json().catch(() => ({}));
  return { id: String(result.id || response.headers.get('x-post-id') || job.id), url: typeof result.url === 'string' ? result.url.slice(0, 2000) : null };
}

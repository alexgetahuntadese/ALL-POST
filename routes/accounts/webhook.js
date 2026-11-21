import { requireSameOrigin, requireSession } from '../../lib/security.js';
import { encryptionReady, storageReady } from '../../lib/linkedin.js';
import { validateWebhookConfig } from '../../lib/webhook-publisher.js';
import { getSocialAccount, removeSocialAccount, saveSocialAccount } from '../../lib/social-storage.js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!requireSession(request, response)) return;
  if (request.method === 'GET') return response.status(200).json({ configured: Boolean(await getSocialAccount('webhook')) });
  if (!requireSameOrigin(request, response)) return;
  try {
    if (!encryptionReady() || !storageReady()) throw new Error('Private encrypted storage is not configured.');
    if (request.method === 'DELETE') {
      await removeSocialAccount('webhook');
      return response.status(200).json({ disconnected: true });
    }
    if (request.method !== 'POST') { response.setHeader('Allow', 'GET, POST, DELETE'); return response.status(405).end(); }
    await validateWebhookConfig({ url: request.body?.url, secret: request.body?.secret });
    await saveSocialAccount('webhook', { url: new URL(request.body.url).toString(), secret: request.body.secret });
    return response.status(200).json({ configured: true });
  } catch (error) {
    const message = String(error?.message || 'Could not configure webhook.');
    return response.status(/HTTPS|secret|URL/i.test(message) ? 400 : 503).json({ error: message });
  }
}

import { requireSameOrigin, requireSession } from '../../lib/security.js';
import { credentialsReady, encryptionReady, publishLinkedInText, storageReady } from '../../lib/linkedin.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).end();
  if (!requireSameOrigin(request, response) || !requireSession(request, response)) return;
  if (!credentialsReady() || !encryptionReady() || !storageReady()) {
    return response.status(503).json({ error: 'LinkedIn connection is not configured yet.' });
  }
  const text = typeof request.body?.text === 'string' ? request.body.text.trim() : '';
  if (!text) return response.status(400).json({ error: 'Write a post before publishing.' });
  if ([...text].length > 3000) return response.status(400).json({ error: 'LinkedIn text posts are limited to 3,000 characters.' });
  try {
    const postId = await publishLinkedInText(text);
    response.status(201).json({ published: true, platform: 'linkedin', postId });
  } catch (error) {
    console.error('LinkedIn publishing failed:', error.message);
    const status = /connect LinkedIn/i.test(error.message) ? 409 : /expired/i.test(error.message) ? 401 : 502;
    response.status(status).json({ error: error.message });
  }
}

import { requireSameOrigin, requireSession } from '../../lib/security.js';
import { xPublishingReady, publishXText } from '../../lib/x.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).end();
  if (!requireSameOrigin(request, response) || !requireSession(request, response)) return;
  if (!xPublishingReady()) return response.status(503).json({ error: 'X publishing is not configured yet.' });
  const text = typeof request.body?.text === 'string' ? request.body.text.trim() : '';
  if (!text) return response.status(400).json({ error: 'Write a post before publishing.' });
  if ([...text].length > 280) return response.status(400).json({ error: 'X posts are limited to 280 characters.' });
  try {
    const postId = await publishXText(text);
    response.status(201).json({ published: true, platform: 'x', postId });
  } catch (error) {
    console.error('X publishing failed:', error.message);
    const status = /connect X/i.test(error.message) ? 409 : /expired|revoked/i.test(error.message) ? 401 : 502;
    response.status(status).json({ error: error.message });
  }
}

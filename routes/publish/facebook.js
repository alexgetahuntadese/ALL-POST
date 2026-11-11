import { requireSameOrigin, requireSession } from '../../lib/security.js';
import { facebookPublishingReady, publishFacebookPost } from '../../lib/facebook.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).end();
  if (!requireSameOrigin(request, response) || !requireSession(request, response)) return;
  if (!facebookPublishingReady()) return response.status(503).json({ error: 'Facebook publishing is not configured yet.' });
  const text = typeof request.body?.text === 'string' ? request.body.text.trim() : '';
  if (!text) return response.status(400).json({ error: 'Write a message before publishing to Facebook.' });
  try {
    const postId = await publishFacebookPost({ text, mediaUrl: request.body?.mediaUrl, mediaType: request.body?.mediaType, pageId: request.body?.facebookPageId });
    response.status(201).json({ published: true, platform: 'facebook', postId });
  } catch (error) {
    console.error('Facebook publishing failed:', error.message);
    response.status(/connect Facebook|Choose one/i.test(error.message) ? 409 : 502).json({ error: error.message });
  }
}

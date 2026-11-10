import { requireSameOrigin, requireSession } from '../../lib/security.js';
import { instagramPublishingReady, publishInstagramMedia } from '../../lib/instagram.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).end();
  if (!requireSameOrigin(request, response) || !requireSession(request, response)) return;
  if (!instagramPublishingReady()) return response.status(503).json({ error: 'Instagram media storage and publishing are not configured yet.' });
  const caption = typeof request.body?.text === 'string' ? request.body.text.trim() : '';
  const mediaUrl = typeof request.body?.mediaUrl === 'string' ? request.body.mediaUrl : '';
  const mediaType = typeof request.body?.mediaType === 'string' ? request.body.mediaType : '';
  if (!mediaUrl) return response.status(400).json({ error: 'Instagram requires a photo or video.' });
  try {
    const mediaId = await publishInstagramMedia({ caption, mediaUrl, mediaType });
    response.status(201).json({ published: true, platform: 'instagram', postId: mediaId });
  } catch (error) {
    console.error('Instagram publishing failed:', error.message);
    const status = /connect Instagram/i.test(error.message) ? 409 : /expired/i.test(error.message) ? 401 : 502;
    response.status(status).json({ error: error.message });
  }
}

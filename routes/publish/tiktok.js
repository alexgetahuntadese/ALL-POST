import { requireSameOrigin, requireSession } from '../../lib/security.js';
import { publishTikTokPhoto, publishTikTokVideo, tiktokPublishingReady } from '../../lib/tiktok.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).end();
  if (!requireSameOrigin(request, response) || !requireSession(request, response)) return;
  if (!tiktokPublishingReady()) return response.status(503).json({ error: 'TikTok media storage and publishing are not configured yet.' });
  const text = typeof request.body?.text === 'string' ? request.body.text.trim() : '';
  const mediaUrl = typeof request.body?.mediaUrl === 'string' ? request.body.mediaUrl : '';
  const mediaType = typeof request.body?.mediaType === 'string' ? request.body.mediaType : '';
  const privacyLevel = typeof request.body?.tiktokPrivacy === 'string' ? request.body.tiktokPrivacy : '';
  const interactions = request.body?.tiktokInteractions || {};
  const brand = request.body?.tiktokBrand || {};
  if (!mediaUrl) return response.status(400).json({ error: 'TikTok requires a photo or video.' });
  if (!privacyLevel) return response.status(400).json({ error: 'Choose a TikTok privacy setting before publishing.' });
  try {
    const result = mediaType.startsWith('video/')
      ? await publishTikTokVideo({ text, mediaUrl, mediaType, privacyLevel, interactions, brand })
      : await publishTikTokPhoto({ text, mediaUrl, mediaType, privacyLevel, interactions, brand });
    response.status(201).json({ published: result.status === 'PUBLISH_COMPLETE', processing: result.status !== 'PUBLISH_COMPLETE', platform: 'tiktok', postId: result.id, status: result.status });
  } catch (error) {
    console.error('TikTok publishing failed:', error.message);
    const status = /connect TikTok/i.test(error.message) ? 409 : /expired|revoked/i.test(error.message) ? 401 : 502;
    response.status(status).json({ error: error.message });
  }
}

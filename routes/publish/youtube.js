import { requireSameOrigin, requireSession } from '../../lib/security.js';
import { publishYouTubeVideo, youtubePublishingReady } from '../../lib/youtube.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).end();
  if (!requireSameOrigin(request, response) || !requireSession(request, response)) return;
  if (!youtubePublishingReady()) return response.status(503).json({ error: 'YouTube video publishing is not configured yet.' });
  const description = typeof request.body?.text === 'string' ? request.body.text.trim() : '';
  const title = typeof request.body?.youtubeTitle === 'string' ? request.body.youtubeTitle.trim() : '';
  const privacyStatus = typeof request.body?.youtubePrivacy === 'string' ? request.body.youtubePrivacy : '';
  const mediaUrl = typeof request.body?.mediaUrl === 'string' ? request.body.mediaUrl : '';
  const mediaType = typeof request.body?.mediaType === 'string' ? request.body.mediaType : '';
  if (!mediaUrl) return response.status(400).json({ error: 'YouTube requires a video file.' });
  try {
    const videoId = await publishYouTubeVideo({ description, title, privacyStatus, mediaUrl, mediaType });
    response.status(201).json({ published: true, platform: 'youtube', postId: videoId, url: `https://www.youtube.com/watch?v=${videoId}` });
  } catch (error) {
    console.error('YouTube publishing failed:', error.message);
    const status = /connect YouTube/i.test(error.message) ? 409 : /expired|revoked/i.test(error.message) ? 401 : 502;
    response.status(status).json({ error: error.message });
  }
}

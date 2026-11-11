import { handleUpload } from '@vercel/blob/client';
import { requireSameOrigin, requireSession } from '../../lib/security.js';

const mediaTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).end();
  if (!requireSameOrigin(request, response) || !requireSession(request, response)) return;
  const token = process.env.MEDIA_READ_WRITE_TOKEN;
  if (!token) return response.status(503).json({ error: 'Public media storage is not configured yet.' });
  try {
    const result = await handleUpload({
      body: request.body,
      request,
      token,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: mediaTypes,
        maximumSizeInBytes: 250 * 1024 * 1024,
        addRandomSuffix: true,
        cacheControlMaxAge: 60,
      }),
    });
    response.status(200).json(result);
  } catch (error) {
    console.error('Media upload token creation failed:', error.message);
    response.status(400).json({ error: 'Could not prepare the media upload.' });
  }
}

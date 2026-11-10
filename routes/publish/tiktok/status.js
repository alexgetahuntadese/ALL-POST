import { requireSession } from '../../../lib/security.js';
import { getTikTokPublishStatus, tiktokPublishingReady } from '../../../lib/tiktok.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).end();
  if (!requireSession(request, response)) return;
  if (!tiktokPublishingReady()) return response.status(503).json({ error: 'TikTok posting is not configured yet.' });
  const publishId = String(request.query?.id || '');
  if (!publishId || publishId.length > 200) return response.status(400).json({ error: 'Invalid TikTok publish ID.' });
  try {
    const result = await getTikTokPublishStatus(publishId);
    response.status(200).json({ status: result.status, failReason: result.fail_reason || '' });
  } catch (error) {
    console.error('TikTok publish status lookup failed:', error.message);
    response.status(502).json({ error: 'Could not check the TikTok post status.' });
  }
}

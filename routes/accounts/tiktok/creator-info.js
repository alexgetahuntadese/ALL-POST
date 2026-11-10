import { requireSession } from '../../../lib/security.js';
import { getTikTokCreatorInfo, tiktokPublishingReady } from '../../../lib/tiktok.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).end();
  if (!requireSession(request, response)) return;
  if (!tiktokPublishingReady()) return response.status(503).json({ error: 'TikTok publishing is not configured yet.' });
  try {
    const info = await getTikTokCreatorInfo();
    response.status(200).json({
      username: info.creator_username,
      privacyOptions: info.privacy_level_options || [],
      maxVideoDuration: info.max_video_post_duration_sec,
      commentDisabled: info.comment_disabled,
      duetDisabled: info.duet_disabled,
      stitchDisabled: info.stitch_disabled,
    });
  } catch (error) {
    console.error('TikTok creator info failed:', error.message);
    response.status(503).json({ error: error.message });
  }
}

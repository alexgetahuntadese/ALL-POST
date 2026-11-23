import { requireSameOrigin, requireSession } from '../../lib/security.js';
import { getPublisher } from '../../lib/platform-publisher.js';
import { credentialsReady as linkedinReady, encryptionReady, storageReady } from '../../lib/linkedin.js';
import { facebookPublishingReady } from '../../lib/facebook.js';
import { instagramPublishingReady } from '../../lib/instagram.js';
import { xPublishingReady } from '../../lib/x.js';
import { tiktokPublishingReady } from '../../lib/tiktok.js';
import { youtubePublishingReady } from '../../lib/youtube.js';
import { recordImmediatePublication } from '../../lib/post-queue.js';

const readiness = {
  linkedin: () => linkedinReady() && encryptionReady() && storageReady(),
  facebook: facebookPublishingReady,
  instagram: instagramPublishingReady,
  x: xPublishingReady,
  tiktok: tiktokPublishingReady,
  youtube: youtubePublishingReady,
  telegram: () => encryptionReady() && storageReady(),
  webhook: () => encryptionReady() && storageReady(),
};

export function createPublishHandler(platform) {
  return async function publishHandler(request, response) {
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return response.status(405).end(); }
    if (!requireSameOrigin(request, response) || !requireSession(request, response)) return;
    if (!readiness[platform]()) return response.status(503).json({ error: `${platform} publishing is not configured yet.` });
    const publisher = getPublisher(platform);
    const payload = { ...(request.body || {}), text: String(request.body?.text || '').trim() };
    try {
      publisher.validatePost(payload);
      if (platform === 'youtube' && (!payload.youtubeTitle || !['private', 'unlisted', 'public'].includes(payload.youtubePrivacy))) throw new Error('Add a YouTube title and choose visibility.');
      if (platform === 'tiktok' && (!payload.tiktokPrivacy || payload.tiktokConsent !== true)) throw new Error('Choose TikTok privacy and confirm the media upload.');
      const result = await publisher.publish({ id: crypto.randomUUID(), payload: { ...payload, overrides: { [platform]: { text: payload.text } } }, scheduledAt: null });
      try { await recordImmediatePublication(platform, payload, result); }
      catch (error) { console.error(`${platform} post history could not be recorded:`, error.message); }
      const postId = typeof result === 'string' ? result : result?.id || result?.postId || null;
      return response.status(201).json({ published: true, platform, postId, processing: platform === 'tiktok', partial: Boolean(result?.partial), status: result?.status, url: result?.url, results: result?.results || undefined, error: result?.error || undefined });
    } catch (error) {
      const normalized = publisher.normalizeError(error);
      console.error(`${platform} publishing failed:`, normalized.code, normalized.message);
      const status = normalized.reconnectRequired ? 401 : /connect .* before|choose one of your connected/i.test(normalized.message) ? 409 : normalized.retryable ? 503 : /not configured/i.test(normalized.message) ? 503 : 400;
      return response.status(status).json({ error: normalized.message, code: normalized.code, retryable: normalized.retryable });
    }
  };
}

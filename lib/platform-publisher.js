import { publishFacebookPost } from './facebook.js';
import { publishInstagramMedia } from './instagram.js';
import { publishLinkedInText } from './linkedin.js';
import { publishTikTokPhoto, publishTikTokVideo } from './tiktok.js';
import { publishXPost } from './x.js';
import { publishYouTubeVideo } from './youtube.js';
import { publishTelegramPost, telegramError } from './telegram.js';
import { publishWebhookPost } from './webhook-publisher.js';
import twitterText from 'twitter-text';

export function normalizePlatformError(error) {
  const message = String(error?.message || 'Publishing failed.').slice(0, 280);
  const status = Number(error?.status || error?.statusCode || 0);
  const retryable = error?.retryable === false ? false : error?.retryable === true || status === 429 || status >= 500 || /timeout|temporar|network|fetch failed|rate limit/i.test(message);
  const reconnect = status === 401 || /expired|revoked|invalid token/i.test(message);
  const denied = status === 403 || /permission denied|not enough rights/i.test(message);
  return { message, code: reconnect ? 'reconnect_required' : denied ? 'permission_denied' : retryable ? 'transient' : 'publish_failed', retryable: retryable && !reconnect && !denied, reconnectRequired: reconnect };
}

export function definePublisher({ platform, validatePost = () => {}, publish, refreshTokenIfNeeded = async (account) => account, normalizeError = normalizePlatformError }) {
  if (!platform || typeof publish !== 'function') throw new TypeError('A publisher needs a platform name and publish function.');
  return Object.freeze({ platform, validatePost, publish, refreshTokenIfNeeded, normalizeError });
}

const text = (payload, platform, max) => {
  const value = resolvePlatformText(payload, platform);
  if (!value) throw new Error(`Write a ${platform} post before publishing.`);
  if (platform === 'x') {
    const parsed = twitterText.parseTweet(value);
    if (!parsed.valid) throw new Error(`X posts exceed the 280 weighted-character limit (${parsed.weightedLength}/280). Shorten the copy or remove a link.`);
  } else if (max && [...value].length > max) throw new Error(`${platform} posts are limited to ${max} characters.`);
  return value;
};
export function resolvePlatformText(payload, platform) {
  return String(payload?.overrides?.[platform]?.text || payload?.text || '').trim();
}
const media = (payload, platform, field) => payload.overrides?.[platform]?.mediaMode === 'none' ? '' : payload.overrides?.[platform]?.[field] ?? payload[field];

const existingPublishers = [
  definePublisher({ platform: 'linkedin', validatePost: (payload) => text(payload, 'linkedin', 3000), publish: (job) => publishLinkedInText(text(job.payload, 'linkedin', 3000)) }),
  definePublisher({ platform: 'facebook', validatePost: (payload) => { text(payload, 'facebook'); const url = media(payload, 'facebook', 'mediaUrl'); const type = media(payload, 'facebook', 'mediaType'); if (url && !['image/jpeg', 'video/mp4'].includes(type)) throw new Error('Facebook accepts text, one JPEG photo, or one MP4 video.'); }, publish: (job) => publishFacebookPost({ text: text(job.payload, 'facebook'), mediaUrl: media(job.payload, 'facebook', 'mediaUrl'), mediaType: media(job.payload, 'facebook', 'mediaType'), pageId: job.payload.facebookPageId }) }),
  definePublisher({ platform: 'instagram', validatePost: (payload) => { text(payload, 'instagram', 2200); if (!media(payload, 'instagram', 'mediaUrl')) throw new Error('Instagram requires a photo or video.'); }, publish: (job) => publishInstagramMedia({ caption: text(job.payload, 'instagram', 2200), mediaUrl: media(job.payload, 'instagram', 'mediaUrl'), mediaType: media(job.payload, 'instagram', 'mediaType') }) }),
  definePublisher({ platform: 'x', validatePost: (payload) => { text(payload, 'x', 280); const type = media(payload, 'x', 'mediaType'); if (media(payload, 'x', 'mediaUrl') && !['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(type)) throw new Error('X accepts JPEG, PNG, or WebP photos and MP4 videos.'); }, publish: (job) => publishXPost({ text: text(job.payload, 'x', 280), mediaUrl: media(job.payload, 'x', 'mediaUrl'), mediaType: media(job.payload, 'x', 'mediaType') }) }),
  definePublisher({ platform: 'tiktok', validatePost: (payload) => { text(payload, 'tiktok', 2200); if (!media(payload, 'tiktok', 'mediaUrl')) throw new Error('TikTok requires a photo or video.'); }, publish: (job) => { const payload = job.payload; const mediaUrl = media(payload, 'tiktok', 'mediaUrl'); const mediaType = media(payload, 'tiktok', 'mediaType'); const common = { text: text(payload, 'tiktok', 2200), mediaUrl, mediaType, privacyLevel: payload.tiktokPrivacy, interactions: payload.tiktokInteractions, brand: payload.tiktokBrand }; return mediaType.startsWith('video/') ? publishTikTokVideo(common) : publishTikTokPhoto(common); } }),
  definePublisher({ platform: 'youtube', validatePost: (payload) => { text(payload, 'youtube'); if (!media(payload, 'youtube', 'mediaUrl')) throw new Error('YouTube requires a video.'); }, publish: (job) => { const payload = job.payload; return publishYouTubeVideo({ description: text(payload, 'youtube'), title: payload.youtubeTitle, privacyStatus: payload.youtubePrivacy, mediaUrl: media(payload, 'youtube', 'mediaUrl'), mediaType: media(payload, 'youtube', 'mediaType') }); } }),
];

const registry = new Map(existingPublishers.map((publisher) => [publisher.platform, publisher]));
registry.set('telegram', definePublisher({ platform: 'telegram', validatePost: (payload) => text(payload, 'telegram'), publish: (job) => publishTelegramPost({ text: text(job.payload, 'telegram'), mediaUrl: media(job.payload, 'telegram', 'mediaUrl'), mediaType: media(job.payload, 'telegram', 'mediaType'), mediaUrls: job.payload.overrides?.telegram?.mediaUrls, buttons: job.payload.overrides?.telegram?.buttons, destinationIds: job.payload.telegramDestinationIds }), normalizeError: telegramError }));
registry.set('webhook', definePublisher({ platform: 'webhook', validatePost: (payload) => text(payload, 'webhook'), publish: publishWebhookPost }));

export function registerPublisher(publisher) {
  if (!publisher?.platform || typeof publisher.validatePost !== 'function' || typeof publisher.publish !== 'function' || typeof publisher.refreshTokenIfNeeded !== 'function' || typeof publisher.normalizeError !== 'function') {
    throw new TypeError('Publisher must implement platform, validatePost, publish, refreshTokenIfNeeded, and normalizeError.');
  }
  if (registry.has(publisher.platform)) throw new Error(`Publisher already registered: ${publisher.platform}`);
  registry.set(publisher.platform, publisher);
  return publisher;
}

export function getPublisher(platform) { return registry.get(platform) || null; }
export function listPublishers() { return [...registry.values()]; }

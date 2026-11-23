import { get, list, put } from '@vercel/blob';
import { privateBlobToken, storageReady } from './linkedin.js';
import { getSocialAccount } from './social-storage.js';
import { credentialsReady as linkedinCredentialsReady, getLinkedInAccount } from './linkedin.js';
import { facebookPublishingReady } from './facebook.js';
import { instagramPublishingReady } from './instagram.js';
import { xPublishingReady } from './x.js';
import { getTikTokPublishStatus, tiktokPublishingReady } from './tiktok.js';
import { youtubePublishingReady } from './youtube.js';
import { APP_ORIGIN } from './security.js';
import { getPublisher, listPublishers } from './platform-publisher.js';

const PREFIX = 'all-post/private/queue/';
const SUPPORTED_CHANNELS = new Set(listPublishers().map(({ platform }) => platform));

function blobOptions() {
  if (!storageReady()) throw new Error('Private storage is not configured.');
  return { access: 'private', token: privateBlobToken() };
}

async function readJob(pathname) {
  const blob = await get(pathname, { ...blobOptions(), useCache: false });
  if (!blob || blob.statusCode !== 200) return null;
  return JSON.parse(await new Response(blob.stream).text());
}

async function writeJob(job) {
  const pathname = `${PREFIX}${job.id}.json`;
  await put(pathname, JSON.stringify(job), {
    ...blobOptions(), contentType: 'application/json', allowOverwrite: true, cacheControlMaxAge: 0,
  });
  return job;
}

async function allJobs() {
  const jobs = [];
  let cursor;
  do {
    const page = await list({ ...blobOptions(), prefix: PREFIX, limit: 100, cursor });
    for (const blob of page.blobs) {
      const job = await readJob(blob.pathname);
      if (job) jobs.push(job);
    }
    cursor = page.cursor;
  } while (cursor);
  return jobs.sort((a, b) => b.createdAt - a.createdAt);
}

function validatePayload(payload) {
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (!text) throw new Error('Write a post before scheduling.');
  const channels = [...new Set(Array.isArray(payload?.channels) ? payload.channels : [])];
  if (!channels.length || channels.length > SUPPORTED_CHANNELS.size || channels.some((channel) => !SUPPORTED_CHANNELS.has(channel))) {
    throw new Error('Choose one or more supported channels.');
  }
  const overrides = {};
  for (const channel of channels) {
    const supplied = payload?.overrides?.[channel] || {};
    const overrideText = typeof supplied.text === 'string' ? supplied.text.trim().slice(0, 10_000) : '';
    overrides[channel] = { ...(overrideText ? { text: overrideText } : {}), skip: supplied.skip === true };
    if (supplied.mediaMode === 'none' || supplied.mediaMode === 'default') overrides[channel].mediaMode = supplied.mediaMode;
    if (supplied.mediaUrl) {
      let media;
      try { media = new URL(String(supplied.mediaUrl)); } catch { throw new Error(`Upload ${channel} media through ALL-POST before scheduling.`); }
      if (media.origin !== APP_ORIGIN || media.pathname !== '/api/media/public' || !media.searchParams.get('url')) throw new Error(`Upload ${channel} media through ALL-POST before scheduling.`);
      overrides[channel].mediaUrl = media.toString();
      overrides[channel].mediaType = String(supplied.mediaType || '');
    }
    if (channel === 'telegram' && Array.isArray(supplied.mediaUrls)) {
      if (supplied.mediaUrls.length > 10) throw new Error('Telegram media groups support up to 10 files.');
      overrides[channel].mediaUrls = supplied.mediaUrls.map((item) => {
        let media;
        try { media = new URL(String(item.url || '')); } catch { throw new Error('Upload Telegram media through ALL-POST.'); }
        const type = String(item.type || '');
        if (media.origin !== APP_ORIGIN || media.pathname !== '/api/media/public' || !media.searchParams.get('url') || !['image/jpeg', 'image/png', 'video/mp4'].includes(type)) throw new Error('Telegram media must be uploaded JPEG/PNG photos or MP4 videos.');
        return { url: media.toString(), type };
      });
      overrides[channel].buttons = Array.isArray(supplied.buttons) ? supplied.buttons.slice(0, 20).map((button) => ({ text: String(button.text || '').slice(0, 64), url: String(button.url || '') })) : [];
      for (const button of overrides[channel].buttons) {
        let target;
        try { target = new URL(button.url); } catch { throw new Error('Telegram buttons need a valid HTTPS link.'); }
        if (target.protocol !== 'https:' || !button.text) throw new Error('Telegram buttons need a label and HTTPS link.');
      }
    }
  }
  const activeChannels = channels.filter((channel) => !overrides[channel].skip);
  if (!activeChannels.length) throw new Error('Keep at least one platform enabled for this post.');
  for (const channel of activeChannels) getPublisher(channel)?.validatePost({ text, overrides, mediaUrl: payload.mediaUrl, mediaType: payload.mediaType, youtubeTitle: payload.youtubeTitle });
  const mediaUrl = typeof payload.mediaUrl === 'string' ? payload.mediaUrl : '';
  const mediaType = typeof payload.mediaType === 'string' ? payload.mediaType : '';
  if (mediaUrl) {
    let url;
    try { url = new URL(mediaUrl); }
    catch { throw new Error('Upload media through ALL-POST before scheduling.'); }
    if (url.origin !== APP_ORIGIN || url.pathname !== '/api/media/public') throw new Error('Upload media through ALL-POST before scheduling.');
  }
  if (activeChannels.some((channel) => ['instagram', 'tiktok', 'youtube'].includes(channel)) && activeChannels.some((channel) => ['instagram', 'tiktok', 'youtube'].includes(channel) && !(overrides[channel].mediaUrl || mediaUrl))) {
    throw new Error('Instagram, TikTok, and YouTube need media before scheduling.');
  }
  const facebookMediaUrl = overrides.facebook?.mediaMode === 'none' ? '' : overrides.facebook?.mediaUrl || mediaUrl;
  const facebookMediaType = overrides.facebook?.mediaType || mediaType;
  if (activeChannels.includes('facebook') && facebookMediaUrl && !['image/jpeg', 'video/mp4'].includes(facebookMediaType)) throw new Error('Facebook accepts text, one JPEG photo, or one MP4 video.');
  if (activeChannels.includes('instagram') && (overrides.instagram?.mediaUrl || mediaUrl) && !['image/jpeg', 'video/mp4', 'video/quicktime'].includes(overrides.instagram?.mediaType || mediaType)) {
    throw new Error('Instagram accepts JPEG photos or MP4/MOV videos.');
  }
  const youtubeMediaType = overrides.youtube?.mediaType || mediaType;
  if (activeChannels.includes('youtube') && (!youtubeMediaType.startsWith('video/') || !['video/mp4', 'video/quicktime', 'video/webm'].includes(youtubeMediaType))) {
    throw new Error('YouTube needs an MP4, MOV, or WebM video.');
  }
  const tiktokMediaType = overrides.tiktok?.mediaType || mediaType;
  if (activeChannels.includes('tiktok') && !(overrides.tiktok?.mediaUrl || mediaUrl) || activeChannels.includes('tiktok') && !['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'].includes(tiktokMediaType)) throw new Error('TikTok needs supported photo or video media.');
  const scheduledAt = Date.parse(payload?.scheduledAt);
  if (!Number.isFinite(scheduledAt) || scheduledAt < Date.now() + 2 * 60_000) throw new Error('Choose a time at least two minutes from now.');
  if (scheduledAt > Date.now() + 180 * 24 * 60 * 60_000) throw new Error('Posts can be scheduled up to 180 days ahead.');
  if (activeChannels.includes('youtube')) {
    if (!String(payload.youtubeTitle || '').trim()) throw new Error('Add a YouTube title.');
    if (!['private', 'unlisted', 'public'].includes(payload.youtubePrivacy)) throw new Error('Choose YouTube visibility.');
  }
  if (activeChannels.includes('tiktok')) {
    if (!payload.tiktokPrivacy) throw new Error('Choose TikTok visibility.');
    if (payload.tiktokConsent !== true) throw new Error('Confirm the TikTok upload before scheduling.');
  }
  if (activeChannels.includes('facebook') && !String(payload.facebookPageId || '')) throw new Error('Choose a Facebook Page.');
  if (activeChannels.includes('telegram') && Array.isArray(payload.telegramDestinationIds) && !payload.telegramDestinationIds.length) throw new Error('Choose one or more Telegram destinations.');
  return {
    text, channels: activeChannels, scheduledAt: new Date(scheduledAt).toISOString(), mediaUrl, mediaType, overrides,
    youtubeTitle: String(payload.youtubeTitle || '').trim(), youtubePrivacy: String(payload.youtubePrivacy || ''),
    tiktokPrivacy: String(payload.tiktokPrivacy || ''), tiktokInteractions: payload.tiktokInteractions || {},
    tiktokBrand: payload.tiktokBrand || {}, tiktokConsent: payload.tiktokConsent === true,
    mediaName: String(payload.mediaName || '').slice(0, 180),
    facebookPageId: String(payload.facebookPageId || ''),
    ...(Array.isArray(payload.telegramDestinationIds) ? { telegramDestinationIds: [...new Set(payload.telegramDestinationIds.map(String))].slice(0, 50) } : {}),
  };
}

async function assertChannelsConnected(channels, facebookPageId, telegramDestinationIds = null) {
  if (!storageReady()) throw new Error('Private account storage is not configured.');
  const checks = {
    linkedin: async () => linkedinCredentialsReady() && Boolean(await getLinkedInAccount()),
    facebook: async () => facebookPublishingReady() && Boolean((await getSocialAccount('facebook'))?.pages?.some((page) => page.id === facebookPageId)),
    instagram: async () => instagramPublishingReady() && Boolean(await getSocialAccount('instagram')),
    x: async () => xPublishingReady() && Boolean(await getSocialAccount('x')),
    tiktok: async () => tiktokPublishingReady() && Boolean(await getSocialAccount('tiktok')),
    youtube: async () => youtubePublishingReady() && Boolean(await getSocialAccount('youtube')),
    telegram: async () => {
      const targets = (await getSocialAccount('telegram'))?.targets || [];
      const available = targets.map(({ chatId }) => String(chatId));
      return available.length > 0 && (!Array.isArray(telegramDestinationIds) || telegramDestinationIds.length > 0 && telegramDestinationIds.every((id) => available.includes(id)));
    },
    webhook: async () => Boolean(await getSocialAccount('webhook')),
  };
  const missing = [];
  for (const channel of channels) {
    try { if (!await checks[channel]()) missing.push(channel); }
    catch { missing.push(channel); }
  }
  if (missing.length) throw new Error(`Connect and configure ${missing.join(', ')} before scheduling.`);
}

export async function createScheduledPost(rawPayload) {
  const payload = validatePayload(rawPayload);
  await assertChannelsConnected(payload.channels, payload.facebookPageId, payload.telegramDestinationIds);
  const now = new Date().toISOString();
  return writeJob({
    id: crypto.randomUUID(), status: 'scheduled', createdAt: now, updatedAt: now,
    scheduledAt: payload.scheduledAt, payload,
    results: payload.channels.map((channel) => ({ channel, status: 'pending', attempts: 0, updatedAt: now })),
  });
}

export async function listScheduledPosts(limit = 200) {
  return (await allJobs()).slice(0, limit).map(({ id, status, createdAt, updatedAt, scheduledAt, retryAt, payload, results, error }) => ({
    id, status, createdAt, updatedAt, scheduledAt, text: payload.text, channels: payload.channels,
    retryAt: retryAt || null, mediaName: payload.mediaName || '', results: results || [], error: error || '',
  }));
}

export async function recordImmediatePublication(channel, payload, published) {
  const now = new Date().toISOString();
  const asyncTikTok = channel === 'tiktok' && published?.status && published.status !== 'PUBLISH_COMPLETE';
  const result = {
    channel, status: published?.partial ? 'partial' : asyncTikTok ? 'publishing' : 'published',
    success: !published?.partial && !asyncTikTok, attempts: 1,
    postId: typeof published === 'string' ? published : published?.id || published?.postId || null,
    url: published?.url || null, targetResults: published?.results || null,
    error: published?.error || null, pollAt: asyncTikTok ? new Date(Date.now() + 5 * 60_000).toISOString() : null,
    updatedAt: now,
  };
  return writeJob({
    id: crypto.randomUUID(), status: asyncTikTok ? 'processing' : published?.partial ? 'partial' : 'published',
    createdAt: now, updatedAt: now, scheduledAt: now,
    payload: { text: String(payload.text || ''), channels: [channel], mediaName: String(payload.mediaName || '').slice(0, 180) },
    results: [result], completedAt: asyncTikTok ? null : now,
  });
}

export async function cancelScheduledPost(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid scheduled post.');
  const job = await readJob(`${PREFIX}${id}.json`);
  if (!job) throw new Error('Scheduled post not found.');
  if (job.status !== 'scheduled') throw new Error('Only scheduled posts can be cancelled.');
  job.status = 'cancelled';
  job.updatedAt = new Date().toISOString();
  return writeJob(job);
}

async function publishOne(channel, job) {
  const publisher = getPublisher(channel);
  if (!publisher) throw new Error('Unsupported publishing channel.');
  publisher.validatePost(job.payload);
  return publisher.publish(job);
}

export async function processDuePosts(now = Date.now()) {
  const due = (await allJobs()).filter((job) => {
    const scheduled = ['scheduled', 'retrying'].includes(job.status) && Date.parse(job.scheduledAt) <= now && (!job.retryAt || Date.parse(job.retryAt) <= now);
    const tiktokPoll = job.status === 'processing' && (job.results || []).some((result) => result.channel === 'tiktok' && result.status === 'publishing' && result.pollAt && Date.parse(result.pollAt) <= now);
    return scheduled || tiktokPoll;
  })
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)).slice(0, 3);
  const processed = [];
  for (const job of due) {
    job.status = 'processing';
    job.updatedAt = new Date().toISOString();
    await writeJob(job);
    for (const channel of job.payload.channels) {
      const prior = job.results.find((result) => result.channel === channel) || { channel, status: 'pending', attempts: 0 };
      if (['published', 'partial', 'failed'].includes(prior.status) || prior.status === 'retrying' && prior.retryAt && Date.parse(prior.retryAt) > now) continue;
      if (prior.status === 'publishing') {
        if (channel !== 'tiktok' || !prior.pollAt || Date.parse(prior.pollAt) > now) continue;
        try {
          const status = await getTikTokPublishStatus(prior.postId);
          if (status.status === 'PUBLISH_COMPLETE') Object.assign(prior, { status: 'published', success: true, error: null, pollAt: null });
          else if (status.status === 'FAILED') Object.assign(prior, { status: 'failed', success: false, error: String(status.fail_reason || 'TikTok could not complete this post.').slice(0, 240), pollAt: null });
          else prior.pollAt = new Date(now + 5 * 60_000).toISOString();
        } catch (error) {
          prior.pollAt = new Date(now + 5 * 60_000).toISOString();
          prior.error = String(error?.message || 'Could not read TikTok publish status.').slice(0, 240);
        }
        prior.updatedAt = new Date().toISOString();
        job.results = [...job.results.filter((item) => item.channel !== channel), prior];
        await writeJob(job);
        continue;
      }
      const result = { ...prior, status: 'publishing', attempts: (prior.attempts || 0) + 1, updatedAt: new Date().toISOString() };
      job.results = [...job.results.filter((item) => item.channel !== channel), result];
      job.updatedAt = new Date().toISOString();
      await writeJob(job);
      try {
        const providerResult = await publishOne(channel, job);
        const asyncTikTok = channel === 'tiktok' && providerResult?.status && providerResult.status !== 'PUBLISH_COMPLETE';
        Object.assign(result, { status: providerResult?.partial ? 'partial' : asyncTikTok ? 'publishing' : 'published', success: !providerResult?.partial && !asyncTikTok, postId: typeof providerResult === 'string' ? providerResult : providerResult?.id || providerResult?.postId || null, url: providerResult?.url || null, targetResults: providerResult?.results || null, error: providerResult?.error || null, pollAt: asyncTikTok ? new Date(now + 5 * 60_000).toISOString() : null });
      } catch (error) {
        const normalized = getPublisher(channel).normalizeError(error);
        const shouldRetry = normalized.retryable && result.attempts < 5;
        result.status = shouldRetry ? 'retrying' : 'failed';
        result.success = false;
        result.error = normalized.message;
        if (error.results) result.targetResults = error.results;
        result.code = normalized.code;
        if (shouldRetry) result.retryAt = new Date(now + Math.min(60_000 * (2 ** (result.attempts - 1)), 60 * 60_000)).toISOString();
      }
      result.updatedAt = new Date().toISOString();
      job.results = [...job.results.filter((item) => item.channel !== channel), result];
      job.updatedAt = new Date().toISOString();
      await writeJob(job);
    }
    const results = job.results;
    const successes = results.filter((result) => ['published', 'partial'].includes(result.status)).length;
    const retries = results.filter((result) => result.status === 'retrying');
    const pending = results.some((result) => ['pending', 'publishing'].includes(result.status));
    job.status = retries.length ? 'retrying' : pending ? 'processing' : results.some((result) => result.status === 'partial') ? 'partial' : successes === results.length ? 'published' : successes ? 'partial' : 'failed';
    job.retryAt = retries.length ? retries.map((result) => Date.parse(result.retryAt)).sort((a, b) => a - b)[0] : null;
    if (['published', 'partial', 'failed'].includes(job.status)) job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();
    await writeJob(job);
    processed.push({ id: job.id, status: job.status });
  }
  return processed;
}

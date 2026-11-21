import { get, list, put } from '@vercel/blob';
import { privateBlobToken, storageReady } from './linkedin.js';
import { getSocialAccount } from './social-storage.js';
import { credentialsReady as linkedinCredentialsReady, getLinkedInAccount, publishLinkedInText } from './linkedin.js';
import { facebookPublishingReady, publishFacebookPost } from './facebook.js';
import { instagramPublishingReady, publishInstagramMedia } from './instagram.js';
import { xPublishingReady, publishXText } from './x.js';
import { tiktokPublishingReady, publishTikTokPhoto, publishTikTokVideo } from './tiktok.js';
import { publishYouTubeVideo, youtubePublishingReady } from './youtube.js';
import { APP_ORIGIN } from './security.js';

const PREFIX = 'all-post/private/queue/';
const SUPPORTED_CHANNELS = new Set(['facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok']);

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
  if (channels.includes('x') && [...text].length > 280) throw new Error('X posts are limited to 280 characters.');
  const mediaUrl = typeof payload.mediaUrl === 'string' ? payload.mediaUrl : '';
  const mediaType = typeof payload.mediaType === 'string' ? payload.mediaType : '';
  if (mediaUrl) {
    let url;
    try { url = new URL(mediaUrl); }
    catch { throw new Error('Upload media through ALL-POST before scheduling.'); }
    if (url.origin !== APP_ORIGIN || url.pathname !== '/api/media/public') throw new Error('Upload media through ALL-POST before scheduling.');
  }
  if (channels.some((channel) => ['instagram', 'tiktok', 'youtube'].includes(channel)) && !mediaUrl) {
    throw new Error('Instagram, TikTok, and YouTube need media before scheduling.');
  }
  if (channels.includes('facebook') && mediaUrl && mediaType !== 'image/jpeg') throw new Error('Facebook currently supports text posts or a single JPEG photo.');
  if (channels.includes('instagram') && mediaUrl && !['image/jpeg', 'video/mp4', 'video/quicktime'].includes(mediaType)) {
    throw new Error('Instagram accepts JPEG photos or MP4/MOV videos.');
  }
  if (channels.includes('youtube') && (!mediaType.startsWith('video/') || !['video/mp4', 'video/quicktime', 'video/webm'].includes(mediaType))) {
    throw new Error('YouTube needs an MP4, MOV, or WebM video.');
  }
  const scheduledAt = Date.parse(payload?.scheduledAt);
  if (!Number.isFinite(scheduledAt) || scheduledAt < Date.now() + 2 * 60_000) throw new Error('Choose a time at least two minutes from now.');
  if (scheduledAt > Date.now() + 180 * 24 * 60 * 60_000) throw new Error('Posts can be scheduled up to 180 days ahead.');
  if (channels.includes('youtube')) {
    if (!String(payload.youtubeTitle || '').trim()) throw new Error('Add a YouTube title.');
    if (!['private', 'unlisted', 'public'].includes(payload.youtubePrivacy)) throw new Error('Choose YouTube visibility.');
  }
  if (channels.includes('tiktok')) {
    if (!payload.tiktokPrivacy) throw new Error('Choose TikTok visibility.');
    if (payload.tiktokConsent !== true) throw new Error('Confirm the TikTok upload before scheduling.');
  }
  if (channels.includes('facebook') && !String(payload.facebookPageId || '')) throw new Error('Choose a Facebook Page.');
  return {
    text, channels, scheduledAt: new Date(scheduledAt).toISOString(), mediaUrl, mediaType,
    youtubeTitle: String(payload.youtubeTitle || '').trim(), youtubePrivacy: String(payload.youtubePrivacy || ''),
    tiktokPrivacy: String(payload.tiktokPrivacy || ''), tiktokInteractions: payload.tiktokInteractions || {},
    tiktokBrand: payload.tiktokBrand || {}, tiktokConsent: payload.tiktokConsent === true,
    mediaName: String(payload.mediaName || '').slice(0, 180),
    facebookPageId: String(payload.facebookPageId || ''),
  };
}

async function assertChannelsConnected(channels, facebookPageId) {
  if (!storageReady()) throw new Error('Private account storage is not configured.');
  const checks = {
    linkedin: async () => linkedinCredentialsReady() && Boolean(await getLinkedInAccount()),
    facebook: async () => facebookPublishingReady() && Boolean((await getSocialAccount('facebook'))?.pages?.some((page) => page.id === facebookPageId)),
    instagram: async () => instagramPublishingReady() && Boolean(await getSocialAccount('instagram')),
    x: async () => xPublishingReady() && Boolean(await getSocialAccount('x')),
    tiktok: async () => tiktokPublishingReady() && Boolean(await getSocialAccount('tiktok')),
    youtube: async () => youtubePublishingReady() && Boolean(await getSocialAccount('youtube')),
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
  await assertChannelsConnected(payload.channels, payload.facebookPageId);
  const now = new Date().toISOString();
  return writeJob({
    id: crypto.randomUUID(), status: 'scheduled', createdAt: now, updatedAt: now,
    scheduledAt: payload.scheduledAt, payload, results: [],
  });
}

export async function listScheduledPosts(limit = 30) {
  return (await allJobs()).slice(0, limit).map(({ id, status, createdAt, updatedAt, scheduledAt, payload, results, error }) => ({
    id, status, createdAt, updatedAt, scheduledAt, text: payload.text, channels: payload.channels,
    mediaName: payload.mediaName || '', results, error: error || '',
  }));
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

async function publishOne(channel, payload) {
  switch (channel) {
    case 'linkedin': return publishLinkedInText(payload.text);
    case 'x': return publishXText(payload.text);
    case 'facebook': return publishFacebookPost({ text: payload.text, mediaUrl: payload.mediaUrl, mediaType: payload.mediaType, pageId: payload.facebookPageId });
    case 'instagram': return publishInstagramMedia({ caption: payload.text, mediaUrl: payload.mediaUrl, mediaType: payload.mediaType });
    case 'tiktok': return payload.mediaType.startsWith('video/')
      ? publishTikTokVideo({ text: payload.text, mediaUrl: payload.mediaUrl, mediaType: payload.mediaType, privacyLevel: payload.tiktokPrivacy, interactions: payload.tiktokInteractions, brand: payload.tiktokBrand })
      : publishTikTokPhoto({ text: payload.text, mediaUrl: payload.mediaUrl, mediaType: payload.mediaType, privacyLevel: payload.tiktokPrivacy, interactions: payload.tiktokInteractions, brand: payload.tiktokBrand });
    case 'youtube': return publishYouTubeVideo({ description: payload.text, title: payload.youtubeTitle, privacyStatus: payload.youtubePrivacy, mediaUrl: payload.mediaUrl, mediaType: payload.mediaType });
    default: throw new Error('Unsupported publishing channel.');
  }
}

export async function processDuePosts(now = Date.now()) {
  const due = (await allJobs()).filter((job) => job.status === 'scheduled' && Date.parse(job.scheduledAt) <= now)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)).slice(0, 3);
  const processed = [];
  for (const job of due) {
    job.status = 'processing';
    job.updatedAt = new Date().toISOString();
    await writeJob(job);
    const results = [];
    for (const channel of job.payload.channels) {
      try {
        const providerResult = await publishOne(channel, job.payload);
        results.push({ channel, success: true, postId: typeof providerResult === 'string' ? providerResult : providerResult?.id || providerResult?.postId || null });
      } catch (error) {
        results.push({ channel, success: false, error: String(error?.message || 'Publishing failed.').slice(0, 240) });
      }
      job.results = [...results];
      job.updatedAt = new Date().toISOString();
      await writeJob(job);
    }
    const successes = results.filter((result) => result.success).length;
    job.status = successes === results.length ? 'published' : successes ? 'partial' : 'failed';
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    await writeJob(job);
    processed.push({ id: job.id, status: job.status });
  }
  return processed;
}

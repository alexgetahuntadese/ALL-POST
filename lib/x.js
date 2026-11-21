import { APP_ORIGIN } from './security.js';
import { encryptionReady, storageReady } from './linkedin.js';
import { getSocialAccount, saveSocialAccount } from './social-storage.js';
import { providerError } from './provider-error.js';

export function xRedirectUri() {
  return process.env.X_REDIRECT_URI || `${APP_ORIGIN}/api/oauth/x/callback`;
}

export function xCredentialsReady() {
  return Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET && xRedirectUri());
}

export function xPublishingReady() {
  return xCredentialsReady() && encryptionReady() && storageReady();
}

function basicAuth() {
  return `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64')}`;
}

export async function exchangeXToken(fields) {
  const response = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...fields, client_id: process.env.X_CLIENT_ID }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw providerError('X', response, result, 'could not exchange the authorization code. Check its OAuth 2.0 settings and callback URL.');
  return result;
}

async function currentAccount() {
  const account = await getSocialAccount('x');
  if (!account) return null;
  if (account.expiresAt - Date.now() > 60_000) return account;
  if (!account.refreshToken) throw new Error('X connection expired. Reconnect the account.');
  const token = await exchangeXToken({ grant_type: 'refresh_token', refresh_token: account.refreshToken });
  const updated = {
    ...account,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || account.refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  await saveSocialAccount('x', updated);
  return updated;
}

export async function publishXText(text) {
  return publishXPost({ text });
}

async function xRequest(account, path, body, method = 'POST') {
  const response = await fetch(`https://api.x.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) { const error = new Error('X access expired or was revoked. Reconnect X and try again.'); error.status = 401; throw error; }
    throw providerError('X', response, result, `rejected the request (${response.status}). Check the app write and media permissions.`);
  }
  return result;
}

async function uploadXMedia(account, mediaUrl, mediaType) {
  const parsed = new URL(mediaUrl);
  const appHost = new URL(APP_ORIGIN).host;
  if (parsed.protocol !== 'https:' || parsed.host !== appHost || parsed.pathname !== '/api/media/public' || !parsed.searchParams.get('url')) {
    throw new Error('X media must be uploaded through ALL-POST.');
  }
  const response = await fetch(parsed);
  if (!response.ok) throw new Error('Could not retrieve the uploaded X media.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 250 * 1024 * 1024) throw new Error('X media must be under 250 MB.');
  let mediaId;
  if (mediaType.startsWith('image/')) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mediaType) || bytes.length > 5 * 1024 * 1024) throw new Error('X photos must be JPEG, PNG, or WebP and under 5 MB.');
    const uploaded = await xRequest(account, '/2/media/upload', { media: bytes.toString('base64'), media_category: 'tweet_image' });
    mediaId = uploaded.data?.id;
  } else if (mediaType === 'video/mp4') {
    const init = await xRequest(account, '/2/media/upload/initialize', { media_category: 'tweet_video', media_type: mediaType, total_bytes: bytes.length });
    mediaId = init.data?.id;
    if (!mediaId) throw new Error('X did not start the video upload.');
    const chunkSize = 3 * 1024 * 1024;
    for (let offset = 0, segmentIndex = 0; offset < bytes.length; offset += chunkSize, segmentIndex += 1) {
      await xRequest(account, `/2/media/upload/${encodeURIComponent(mediaId)}/append`, { media: bytes.subarray(offset, offset + chunkSize).toString('base64'), segment_index: segmentIndex });
    }
    await xRequest(account, `/2/media/upload/${encodeURIComponent(mediaId)}/finalize`, {});
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const status = await xRequest(account, `/2/media/upload/${encodeURIComponent(mediaId)}/status`, undefined, 'GET');
      const processing = status.data?.processing_info;
      if (!processing || processing.state === 'succeeded') break;
      if (processing.state === 'failed' || attempt === 11) throw new Error('X is still processing this video. Try publishing again shortly.');
      await new Promise((resolve) => setTimeout(resolve, Math.min((processing.check_after_secs || 2) * 1000, 10_000)));
    }
  } else {
    throw new Error('X accepts JPEG, PNG, or WebP photos and MP4 videos.');
  }
  if (!mediaId) throw new Error('X did not return a media ID.');
  return mediaId;
}

export async function publishXPost({ text, mediaUrl = '', mediaType = '' }) {
  const account = await currentAccount();
  if (!account) throw new Error('Connect X before publishing.');
  const mediaId = mediaUrl ? await uploadXMedia(account, mediaUrl, mediaType) : null;
  const result = await xRequest(account, '/2/tweets', { text, ...(mediaId ? { media: { media_ids: [mediaId] } } : {}) });
  if (!result.data?.id) throw new Error('X did not return a post ID.');
  return result.data.id;
}

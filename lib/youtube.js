import { APP_ORIGIN } from './security.js';
import { encryptionReady, storageReady } from './linkedin.js';
import { getSocialAccount, saveSocialAccount } from './social-storage.js';

const APP_ORIGIN_HOST = new URL(APP_ORIGIN).host;

export function youtubeRedirectUri() {
  return process.env.YOUTUBE_REDIRECT_URI || `${APP_ORIGIN}/api/oauth/youtube/callback`;
}

export function youtubeCredentialsReady() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && youtubeRedirectUri());
}

export function youtubePublishingReady() {
  return youtubeCredentialsReady() && encryptionReady() && storageReady() && Boolean(process.env.MEDIA_BLOB_READ_WRITE_TOKEN);
}

export async function exchangeYouTubeToken(fields) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...fields,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error('Google could not exchange the authorization code. Check its OAuth client and callback URL.');
  return result;
}

export async function getYouTubeChannel(accessToken) {
  const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const result = await response.json().catch(() => ({}));
  const channel = result.items?.[0];
  if (!response.ok || !channel?.id) throw new Error('Could not read the YouTube channel for this Google account.');
  return { id: channel.id, name: channel.snippet?.title || 'YouTube channel', picture: channel.snippet?.thumbnails?.default?.url || null };
}

async function currentAccount() {
  const account = await getSocialAccount('youtube');
  if (!account) return null;
  if (account.expiresAt - Date.now() > 60_000) return account;
  if (!account.refreshToken) throw new Error('YouTube connection expired. Reconnect the account.');
  const token = await exchangeYouTubeToken({ grant_type: 'refresh_token', refresh_token: account.refreshToken });
  const updated = { ...account, accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  await saveSocialAccount('youtube', updated);
  return updated;
}

function publicMediaUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Upload a video before selecting YouTube.'); }
  if (url.protocol !== 'https:' || url.host !== APP_ORIGIN_HOST || url.pathname !== '/api/media/public' || !url.searchParams.get('url')) {
    throw new Error('YouTube media must be an ALL-POST uploaded public file.');
  }
  return url;
}

export async function publishYouTubeVideo({ description, title, privacyStatus, mediaUrl, mediaType }) {
  if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(mediaType)) throw new Error('YouTube publishing needs an MP4, MOV, or WebM video.');
  const account = await currentAccount();
  if (!account) throw new Error('Connect YouTube before publishing.');
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) throw new Error('Add a YouTube video title.');
  if ([...cleanTitle].length > 100) throw new Error('YouTube titles are limited to 100 characters.');
  if (!['private', 'unlisted', 'public'].includes(privacyStatus)) throw new Error('Choose a YouTube visibility setting.');
  const media = await fetch(publicMediaUrl(mediaUrl));
  if (!media.ok) throw new Error('Could not retrieve the uploaded video for YouTube.');
  const bytes = Buffer.from(await media.arrayBuffer());
  if (!bytes.length || bytes.length > 250 * 1024 * 1024) throw new Error('YouTube uploads through ALL-POST are limited to 250 MB.');
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mediaType,
      'X-Upload-Content-Length': String(bytes.length),
    },
    body: JSON.stringify({
      snippet: { title: cleanTitle, description, categoryId: '22' },
      status: { privacyStatus },
    }),
  });
  const location = init.headers.get('location');
  if (!init.ok || !location) throw new Error(`YouTube could not start the video upload (${init.status}).`);
  const uploaded = await fetch(location, { method: 'PUT', headers: { 'Content-Type': mediaType, 'Content-Length': String(bytes.length) }, body: bytes });
  const result = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok || !result.id) {
    if (uploaded.status === 401) throw new Error('YouTube access expired or was revoked. Reconnect the account.');
    throw new Error(`YouTube rejected the video upload (${uploaded.status}). Check the channel, quota, and video format.`);
  }
  return result.id;
}

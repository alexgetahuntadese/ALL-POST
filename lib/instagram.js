import { APP_ORIGIN } from './security.js';
import { encryptionReady, storageReady } from './linkedin.js';
import { getSocialAccount, saveSocialAccount } from './social-storage.js';

const APP_ORIGIN_HOST = new URL(APP_ORIGIN).host;

export function instagramRedirectUri() {
  return process.env.INSTAGRAM_REDIRECT_URI || `${APP_ORIGIN}/api/oauth/instagram/callback`;
}

export function instagramCredentialsReady() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && instagramRedirectUri());
}

export function instagramPublishingReady() {
  return instagramCredentialsReady() && encryptionReady() && storageReady() && Boolean(process.env.MEDIA_BLOB_READ_WRITE_TOKEN);
}

const apiBase = `https://graph.instagram.com/${process.env.INSTAGRAM_API_VERSION || 'v25.0'}`;

async function instagramJson(url, init) {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error('Instagram rejected the request. Check the account type, app permissions, and media format.');
  return result;
}

export async function exchangeInstagramToken(fields) {
  return instagramJson('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...fields,
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
    }),
  });
}

export async function getInstagramProfile(accessToken) {
  const url = new URL(`${apiBase}/me`);
  url.search = new URLSearchParams({ fields: 'user_id,username,account_type', access_token: accessToken });
  return instagramJson(url, {});
}

async function currentAccount() {
  const account = await getSocialAccount('instagram');
  if (!account) return null;
  if (account.expiresAt - Date.now() > 5 * 24 * 60 * 60 * 1000) return account;
  const url = new URL('https://graph.instagram.com/refresh_access_token');
  url.search = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: account.accessToken });
  const refreshed = await instagramJson(url, {});
  const updated = { ...account, accessToken: refreshed.access_token, expiresAt: Date.now() + refreshed.expires_in * 1000 };
  await saveSocialAccount('instagram', updated);
  return updated;
}

function publicMediaUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Upload a photo or video before selecting Instagram.'); }
  if (url.protocol !== 'https:' || url.host !== APP_ORIGIN_HOST || url.pathname !== '/api/media/public' || !url.searchParams.get('url')) {
    throw new Error('Instagram media must be an ALL-POST uploaded public file.');
  }
  return url;
}

export async function publishInstagramMedia({ caption, mediaUrl, mediaType }) {
  const account = await currentAccount();
  if (!account) throw new Error('Connect Instagram before publishing.');
  if (mediaType === 'image/jpeg') {
    const url = new URL(`${apiBase}/${account.userId}/media`);
    const container = await instagramJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${account.accessToken}` },
      body: new URLSearchParams({ image_url: publicMediaUrl(mediaUrl).toString(), caption }),
    });
    return publishContainer(account, container.id);
  }
  if (!['video/mp4', 'video/quicktime'].includes(mediaType)) throw new Error('Instagram accepts JPEG photos or MP4/MOV Reels.');
  const url = new URL(`${apiBase}/${account.userId}/media`);
  const container = await instagramJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${account.accessToken}` },
    body: new URLSearchParams({ media_type: 'REELS', video_url: publicMediaUrl(mediaUrl).toString(), caption, share_to_feed: 'true' }),
  });
  return publishContainer(account, container.id);
}

async function publishContainer(account, containerId) {
  if (!containerId) throw new Error('Instagram did not create a media container.');
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const statusUrl = new URL(`${apiBase}/${containerId}`);
    statusUrl.search = new URLSearchParams({ fields: 'status_code,status', access_token: account.accessToken });
    const status = await instagramJson(statusUrl, {});
    if (status.status_code === 'FINISHED') break;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') throw new Error('Instagram could not process the uploaded media. Try a supported photo or video.');
    if (attempt === 11) throw new Error('Instagram is still processing this media. Try publishing again shortly.');
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  const published = await instagramJson(`${apiBase}/${account.userId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${account.accessToken}` },
    body: new URLSearchParams({ creation_id: containerId }),
  });
  return published.id;
}

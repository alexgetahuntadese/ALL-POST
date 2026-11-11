import { APP_ORIGIN } from './security.js';
import { encryptionReady, storageReady } from './linkedin.js';
import { getSocialAccount, saveSocialAccount } from './social-storage.js';

const APP_ORIGIN_HOST = new URL(APP_ORIGIN).host;

export function tiktokRedirectUri() {
  return process.env.TIKTOK_REDIRECT_URI || `${APP_ORIGIN}/api/oauth/tiktok/callback`;
}

export function tiktokCredentialsReady() {
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && tiktokRedirectUri());
}

export function tiktokPublishingReady() {
  return tiktokCredentialsReady() && encryptionReady() && storageReady() && Boolean(process.env.MEDIA_READ_WRITE_TOKEN)
    && Boolean(process.env.TIKTOK_VERIFIED_DOMAIN);
}

async function tiktokJson(url, init) {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || (result.error?.code && result.error.code !== 'ok')) {
    const reason = result.error?.message || result.error?.code || 'request failed';
    throw new Error(`TikTok ${reason}.`);
  }
  return result;
}

export async function exchangeTikTokToken(fields) {
  const result = await tiktokJson('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...fields,
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
    }),
  });
  if (!result.data?.access_token) throw new Error('TikTok did not return an access token.');
  return result.data;
}

export async function getTikTokProfile(accessToken) {
  const result = await tiktokJson('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return result.data?.user;
}

async function currentAccount() {
  const account = await getSocialAccount('tiktok');
  if (!account) return null;
  if (account.expiresAt - Date.now() > 60_000) return account;
  if (account.refreshExpiresAt <= Date.now()) throw new Error('TikTok connection expired. Reconnect the account.');
  const token = await exchangeTikTokToken({ grant_type: 'refresh_token', refresh_token: account.refreshToken });
  const updated = {
    ...account,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || account.refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
    refreshExpiresAt: Date.now() + token.refresh_expires_in * 1000,
  };
  await saveSocialAccount('tiktok', updated);
  return updated;
}

export async function getTikTokCreatorInfo() {
  const account = await currentAccount();
  if (!account) throw new Error('Connect TikTok before publishing.');
  const result = await tiktokJson('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({}),
  });
  return result.data;
}

function publicMediaUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Upload media before selecting TikTok.'); }
  const verifiedHost = String(process.env.TIKTOK_VERIFIED_DOMAIN || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  if (url.protocol !== 'https:' || url.host !== APP_ORIGIN_HOST || url.hostname.toLowerCase() !== verifiedHost || url.pathname !== '/api/media/public' || !url.searchParams.get('url')) {
    throw new Error('TikTok media must be an ALL-POST uploaded public file.');
  }
  return url;
}

export async function publishTikTokVideo({ text, mediaUrl, mediaType, privacyLevel, interactions = {}, brand = {} }) {
  if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(mediaType)) throw new Error('TikTok video posting needs an MP4, MOV, or WebM file.');
  const account = await currentAccount();
  if (!account) throw new Error('Connect TikTok before publishing.');
  const creator = await getTikTokCreatorInfo();
  if (!creator.privacy_level_options?.includes(privacyLevel)) throw new Error('Choose a TikTok privacy setting offered for your account.');
  const media = publicMediaUrl(mediaUrl);
  const initialized = await tiktokJson('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: {
        title: text,
        privacy_level: privacyLevel,
        disable_duet: !Boolean(interactions.duet),
        disable_comment: !Boolean(interactions.comments),
        disable_stitch: !Boolean(interactions.stitch),
        brand_content_toggle: Boolean(brand.branded),
        brand_organic_toggle: Boolean(brand.ownBrand),
      },
      source_info: { source: 'PULL_FROM_URL', video_url: media.toString() },
    }),
  });
  const publishId = initialized.data?.publish_id;
  if (!publishId) throw new Error('TikTok did not create a media upload.');
  return { id: publishId, status: 'PROCESSING_DOWNLOAD' };
}

export async function getTikTokPublishStatus(publishId) {
  const account = await currentAccount();
  if (!account) throw new Error('Connect TikTok before checking post status.');
  const statusResult = await tiktokJson('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ publish_id: publishId }),
  });
  return statusResult.data;
}

export async function publishTikTokPhoto({ text, mediaUrl, mediaType, privacyLevel, interactions = {}, brand = {} }) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) throw new Error('TikTok photo posting needs a JPEG, PNG, or WebP image.');
  const account = await currentAccount();
  if (!account) throw new Error('Connect TikTok before publishing.');
  const creator = await getTikTokCreatorInfo();
  if (!creator.privacy_level_options?.includes(privacyLevel)) throw new Error('Choose a TikTok privacy setting offered for your account.');
  const imageUrl = publicMediaUrl(mediaUrl);
  const result = await tiktokJson('https://open.tiktokapis.com/v2/post/publish/content/init/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: {
        title: text,
        description: text,
        privacy_level: privacyLevel,
        disable_comment: !Boolean(interactions.comments),
        brand_content_toggle: Boolean(brand.branded),
        brand_organic_toggle: Boolean(brand.ownBrand),
      },
      source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: [imageUrl.toString()] },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
    }),
  });
  return { id: result.data?.publish_id, status: 'PROCESSING_DOWNLOAD' };
}

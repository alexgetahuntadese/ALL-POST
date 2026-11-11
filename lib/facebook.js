import { APP_ORIGIN } from './security.js';
import { encryptionReady, storageReady } from './linkedin.js';
import { getSocialAccount } from './social-storage.js';

export function facebookRedirectUri() { return process.env.FACEBOOK_REDIRECT_URI || `${APP_ORIGIN}/api/oauth/facebook/callback`; }
export function facebookCredentialsReady() { return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && facebookRedirectUri()); }
export function facebookPublishingReady() { return facebookCredentialsReady() && encryptionReady() && storageReady(); }
const graphBase = `https://graph.facebook.com/${process.env.FACEBOOK_API_VERSION || 'v26.0'}`;

async function graphJson(url, init) {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error(String(result.error?.message || 'Facebook rejected the request.').slice(0, 280));
  return result;
}

export async function exchangeFacebookCode(code) {
  const url = new URL(`${graphBase}/oauth/access_token`);
  url.search = new URLSearchParams({ client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: facebookRedirectUri(), code });
  const shortToken = await graphJson(url, {});
  const longUrl = new URL(`${graphBase}/oauth/access_token`);
  longUrl.search = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: shortToken.access_token });
  return graphJson(longUrl, {});
}

export async function getFacebookPages(userToken) {
  const url = new URL(`${graphBase}/me/accounts`);
  url.search = new URLSearchParams({ fields: 'id,name,access_token,tasks', limit: '100', access_token: userToken });
  const result = await graphJson(url, {});
  return (result.data || []).filter((page) => page.id && page.access_token).map((page) => ({ id: String(page.id), name: String(page.name || 'Facebook Page'), accessToken: page.access_token, tasks: page.tasks || [] }));
}

export async function publishFacebookPost({ text, mediaUrl, mediaType, pageId }) {
  const account = await getSocialAccount('facebook');
  if (!account?.pages?.length) throw new Error('Connect a Facebook Page before publishing.');
  const page = account.pages.find((item) => item.id === String(pageId)) || (account.pages.length === 1 ? account.pages[0] : null);
  if (!page) throw new Error('Choose one of your connected Facebook Pages.');
  const endpoint = mediaUrl ? `${graphBase}/${page.id}/photos` : `${graphBase}/${page.id}/feed`;
  const body = new URLSearchParams({ access_token: page.accessToken });
  if (mediaUrl) {
    let parsed;
    try { parsed = new URL(mediaUrl); } catch { throw new Error('Upload media through ALL-POST before selecting Facebook.'); }
    const appHost = new URL(APP_ORIGIN).host;
    if (parsed.protocol !== 'https:' || parsed.host !== appHost || parsed.pathname !== '/api/media/public' || !parsed.searchParams.get('url')) throw new Error('Facebook media must be an ALL-POST uploaded public file.');
    if (mediaType !== 'image/jpeg') throw new Error('Facebook currently supports a text post or one JPEG photo.');
    body.set('url', parsed.toString()); body.set('caption', text);
  } else body.set('message', text);
  const result = await graphJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!result.id) throw new Error('Facebook did not return a post ID.');
  return result.id;
}

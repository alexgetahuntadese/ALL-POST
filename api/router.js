import accounts from '../routes/accounts.js';
import accountInstagramDisconnect from '../routes/accounts/instagram/disconnect.js';
import accountLinkedInDisconnect from '../routes/accounts/linkedin/disconnect.js';
import accountTikTokCreatorInfo from '../routes/accounts/tiktok/creator-info.js';
import accountTikTokDisconnect from '../routes/accounts/tiktok/disconnect.js';
import accountXDisconnect from '../routes/accounts/x/disconnect.js';
import accountYouTubeDisconnect from '../routes/accounts/youtube/disconnect.js';
import authLogin from '../routes/auth/login.js';
import authLogout from '../routes/auth/logout.js';
import authSession from '../routes/auth/session.js';
import health from '../routes/health.js';
import mediaDelete from '../routes/media/delete.js';
import mediaPublic from '../routes/media/public.js';
import mediaUpload from '../routes/media/upload.js';
import oauthInstagramCallback from '../routes/oauth/instagram/callback.js';
import oauthInstagramStart from '../routes/oauth/instagram/start.js';
import oauthLinkedInCallback from '../routes/oauth/linkedin/callback.js';
import oauthLinkedInStart from '../routes/oauth/linkedin/start.js';
import oauthTikTokCallback from '../routes/oauth/tiktok/callback.js';
import oauthTikTokStart from '../routes/oauth/tiktok/start.js';
import oauthXCallback from '../routes/oauth/x/callback.js';
import oauthXStart from '../routes/oauth/x/start.js';
import oauthYouTubeCallback from '../routes/oauth/youtube/callback.js';
import oauthYouTubeStart from '../routes/oauth/youtube/start.js';
import publishInstagram from '../routes/publish/instagram.js';
import publishLinkedIn from '../routes/publish/linkedin.js';
import publishTikTok from '../routes/publish/tiktok.js';
import publishTikTokStatus from '../routes/publish/tiktok/status.js';
import publishX from '../routes/publish/x.js';
import publishYouTube from '../routes/publish/youtube.js';

const handlers = new Map([
  ['accounts', accounts],
  ['accounts/instagram/disconnect', accountInstagramDisconnect],
  ['accounts/linkedin/disconnect', accountLinkedInDisconnect],
  ['accounts/tiktok/creator-info', accountTikTokCreatorInfo],
  ['accounts/tiktok/disconnect', accountTikTokDisconnect],
  ['accounts/x/disconnect', accountXDisconnect],
  ['accounts/youtube/disconnect', accountYouTubeDisconnect],
  ['auth/login', authLogin],
  ['auth/logout', authLogout],
  ['auth/session', authSession],
  ['health', health],
  ['media/delete', mediaDelete],
  ['media/public', mediaPublic],
  ['media/upload', mediaUpload],
  ['oauth/instagram/callback', oauthInstagramCallback],
  ['oauth/instagram/start', oauthInstagramStart],
  ['oauth/linkedin/callback', oauthLinkedInCallback],
  ['oauth/linkedin/start', oauthLinkedInStart],
  ['oauth/tiktok/callback', oauthTikTokCallback],
  ['oauth/tiktok/start', oauthTikTokStart],
  ['oauth/x/callback', oauthXCallback],
  ['oauth/x/start', oauthXStart],
  ['oauth/youtube/callback', oauthYouTubeCallback],
  ['oauth/youtube/start', oauthYouTubeStart],
  ['publish/instagram', publishInstagram],
  ['publish/linkedin', publishLinkedIn],
  ['publish/tiktok', publishTikTok],
  ['publish/tiktok/status', publishTikTokStatus],
  ['publish/x', publishX],
  ['publish/youtube', publishYouTube],
]);

export default async function handler(request, response) {
  const requestPath = request.query?.path;
  const path = (Array.isArray(requestPath) ? requestPath.join('/') : String(requestPath || '')).replace(/^\/+|\/+$/g, '');
  const route = handlers.get(path);
  if (!route) return response.status(404).json({ error: 'API route not found.' });
  return route(request, response);
}

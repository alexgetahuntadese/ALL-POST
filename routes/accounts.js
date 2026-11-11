import { requireSession } from '../lib/security.js';
import { credentialsReady, encryptionReady, getLinkedInAccount, storageReady } from '../lib/linkedin.js';
import { xCredentialsReady } from '../lib/x.js';
import { instagramCredentialsReady } from '../lib/instagram.js';
import { tiktokCredentialsReady } from '../lib/tiktok.js';
import { youtubeCredentialsReady } from '../lib/youtube.js';
import { getSocialAccount } from '../lib/social-storage.js';

export default async function handler(request, response) {
  if (!requireSession(request, response)) return;
  try {
    const ready = credentialsReady() && encryptionReady() && storageReady();
    const account = ready ? await getLinkedInAccount() : null;
    const xReady = xCredentialsReady() && encryptionReady() && storageReady();
    const xAccount = xReady ? await getSocialAccount('x') : null;
    const instagramReady = instagramCredentialsReady() && encryptionReady() && storageReady();
    const instagramAccount = instagramReady ? await getSocialAccount('instagram') : null;
    const tiktokReady = tiktokCredentialsReady() && encryptionReady() && storageReady();
    const tiktokAccount = tiktokReady ? await getSocialAccount('tiktok') : null;
    const youtubeReady = youtubeCredentialsReady() && encryptionReady() && storageReady();
    const youtubeAccount = youtubeReady ? await getSocialAccount('youtube') : null;
    response.status(200).json({
      linkedinConfigured: ready,
      linkedin: account ? { connected: true, name: account.name, picture: account.picture } : { connected: false },
      publishingEnabled: credentialsReady() && encryptionReady() && storageReady() && Boolean(account),
      xConfigured: xReady,
      x: xAccount ? { connected: true, name: xAccount.name, username: xAccount.username, picture: xAccount.picture } : { connected: false },
      xPublishingEnabled: xReady && Boolean(xAccount),
      instagramConfigured: instagramReady,
      instagram: instagramAccount ? { connected: true, name: instagramAccount.name, username: instagramAccount.username } : { connected: false },
      instagramPublishingEnabled: Boolean(process.env.MEDIA_READ_WRITE_TOKEN) && instagramReady && Boolean(instagramAccount),
      tiktokConfigured: tiktokReady,
      tiktok: tiktokAccount ? { connected: true, name: tiktokAccount.name, username: tiktokAccount.username } : { connected: false },
      tiktokPublishingEnabled: Boolean(process.env.MEDIA_READ_WRITE_TOKEN && process.env.TIKTOK_VERIFIED_DOMAIN) && tiktokReady && Boolean(tiktokAccount),
      youtubeConfigured: youtubeReady,
      youtube: youtubeAccount ? { connected: true, name: youtubeAccount.name, picture: youtubeAccount.picture } : { connected: false },
      youtubePublishingEnabled: Boolean(process.env.MEDIA_READ_WRITE_TOKEN) && youtubeReady && Boolean(youtubeAccount),
      publicMediaConfigured: Boolean(process.env.MEDIA_READ_WRITE_TOKEN),
    });
  } catch (error) {
    console.error('LinkedIn account lookup failed:', error.message);
    response.status(503).json({ error: 'Account storage is not ready.' });
  }
}

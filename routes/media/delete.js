import { del } from '@vercel/blob';
import { requireSameOrigin, requireSession } from '../../lib/security.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).end();
  if (!requireSameOrigin(request, response) || !requireSession(request, response)) return;
  const token = process.env.MEDIA_READ_WRITE_TOKEN;
  if (!token) return response.status(503).json({ error: 'Public media storage is not configured yet.' });
  const mediaUrl = typeof request.body?.url === 'string' ? request.body.url : '';
  let parsed;
  try { parsed = new URL(mediaUrl); } catch { return response.status(400).json({ error: 'Invalid media URL.' }); }
  if (!parsed.hostname.endsWith('.public.blob.vercel-storage.com') || !parsed.pathname.startsWith('/all-post/media/')) {
    return response.status(400).json({ error: 'Only ALL-POST uploaded media can be removed.' });
  }
  try {
    await del(mediaUrl, { access: 'public', token });
    response.status(200).json({ deleted: true });
  } catch (error) {
    console.error('Media cleanup failed:', error.message);
    response.status(503).json({ error: 'Could not delete the uploaded media.' });
  }
}

import { del, get, list, put } from '@vercel/blob';
import { privateBlobToken, storageReady } from '../lib/linkedin.js';
import { requireSameOrigin, requireSession } from '../lib/security.js';

const PREFIX = 'all-post/private/drafts/';
const options = () => {
  if (!storageReady()) throw new Error('Private draft storage is not configured.');
  return { access: 'private', token: privateBlobToken() };
};
const validId = (id) => /^[0-9a-f-]{36}$/i.test(id);

async function readDraft(pathname) {
  const blob = await get(pathname, { ...options(), useCache: false });
  if (blob?.statusCode !== 200) return null;
  return JSON.parse(await new Response(blob.stream).text());
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!requireSession(request, response)) return;
  try {
    if (request.method === 'GET') {
      const page = await list({ ...options(), prefix: PREFIX, limit: 100 });
      const drafts = (await Promise.all(page.blobs.map((blob) => readDraft(blob.pathname)))).filter(Boolean)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      return response.status(200).json({ drafts });
    }
    if (!requireSameOrigin(request, response)) return;
    if (request.method === 'POST') {
      const payload = request.body?.payload;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.text !== 'string' || payload.text.length > 10_000) {
        return response.status(400).json({ error: 'A draft needs post content under 10,000 characters.' });
      }
      const id = request.body.id && validId(request.body.id) ? request.body.id : crypto.randomUUID();
      const existing = request.body.id ? await readDraft(`${PREFIX}${id}.json`) : null;
      if (request.body.id && !existing) return response.status(404).json({ error: 'Draft not found.' });
      if (!existing) {
        const page = await list({ ...options(), prefix: PREFIX, limit: 101 });
        if (page.blobs.length >= 100) return response.status(409).json({ error: 'Draft limit reached. Delete a draft before saving another.' });
      }
      const draft = { id, title: payload.text.trim().split(/\s+/).slice(0, 8).join(' ') || 'Untitled draft', payload, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
      await put(`${PREFIX}${id}.json`, JSON.stringify(draft), { ...options(), contentType: 'application/json', allowOverwrite: true, cacheControlMaxAge: 0 });
      return response.status(200).json({ draft });
    }
    if (request.method === 'DELETE') {
      const id = String(request.body?.id || '');
      if (!validId(id)) return response.status(400).json({ error: 'Invalid draft.' });
      const blob = await get(`${PREFIX}${id}.json`, { ...options(), useCache: false });
      if (blob?.statusCode !== 200) return response.status(404).json({ error: 'Draft not found.' });
      await del(blob.blob.url, options());
      return response.status(200).json({ deleted: true });
    }
    response.setHeader('Allow', 'GET, POST, DELETE');
    return response.status(405).end();
  } catch (error) {
    console.error('Draft storage failed:', error.message);
    return response.status(503).json({ error: 'Could not access saved drafts.' });
  }
}

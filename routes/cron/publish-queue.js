import { timingSafeEqual } from 'node:crypto';
import { processDuePosts } from '../../lib/post-queue.js';

function authorized(request) {
  const secret = process.env.CRON_SECRET || '';
  const supplied = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length >= 32 && expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).end();
  }
  if (!authorized(request)) return response.status(401).json({ error: 'Unauthorized.' });
  try {
    const posts = await processDuePosts();
    return response.status(200).json({ processed: posts.length, posts });
  } catch (error) {
    console.error('Scheduled publishing run failed:', error.message);
    return response.status(500).json({ error: 'Scheduled publishing run failed.' });
  }
}

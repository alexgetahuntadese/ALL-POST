import { cancelScheduledPost, createScheduledPost, listScheduledPosts } from '../lib/post-queue.js';
import { requireSameOrigin, requireSession } from '../lib/security.js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!requireSession(request, response)) return;
  if (request.method === 'GET') {
    try {
      return response.status(200).json({ posts: await listScheduledPosts() });
    } catch (error) {
      console.error('Queue lookup failed:', error.message);
      return response.status(503).json({ error: 'Could not load the scheduled posts.' });
    }
  }
  if (!requireSameOrigin(request, response)) return;
  try {
    if (request.method === 'POST') {
      const post = await createScheduledPost(request.body || {});
      return response.status(201).json({ scheduled: true, post: { id: post.id, scheduledAt: post.scheduledAt, channels: post.payload.channels } });
    }
    if (request.method === 'DELETE') {
      await cancelScheduledPost(String(request.body?.id || ''));
      return response.status(200).json({ cancelled: true });
    }
    response.setHeader('Allow', 'GET, POST, DELETE');
    return response.status(405).end();
  } catch (error) {
    const message = String(error?.message || 'Could not update the queue.');
    const status = /not found/i.test(message) ? 404 : /invalid|choose|write|limited|need|accept|confirm|upload|add a|connect/i.test(message) ? 400 : 503;
    return response.status(status).json({ error: message });
  }
}

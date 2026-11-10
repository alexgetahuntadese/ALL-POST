import { requireSameOrigin, requireSession } from '../../../lib/security.js';
import { removeSocialAccount } from '../../../lib/social-storage.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).end();
  if (!requireSameOrigin(request, response) || !requireSession(request, response)) return;
  try {
    await removeSocialAccount('x');
    response.status(200).json({ disconnected: true });
  } catch (error) {
    console.error('X disconnect failed:', error.message);
    response.status(503).json({ error: 'Could not remove the stored X connection.' });
  }
}

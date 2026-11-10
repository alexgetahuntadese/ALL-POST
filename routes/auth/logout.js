import { clearSession, requireSameOrigin } from '../../lib/security.js';

export default function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).end();
  if (!requireSameOrigin(request, response)) return;
  clearSession(response);
  response.status(200).json({ authenticated: false });
}

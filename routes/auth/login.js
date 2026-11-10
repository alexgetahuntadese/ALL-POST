import { loginResponse, requireSameOrigin } from '../../lib/security.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).end();
  if (!requireSameOrigin(request, response)) return;
  let body;
  try { body = request.body ?? JSON.parse(await readBody(request)); }
  catch { return response.status(400).json({ error: 'Invalid request.' }); }
  loginResponse(request, response, body.password);
}

async function readBody(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 4000) throw new Error('Request too large.');
  }
  return raw || '{}';
}

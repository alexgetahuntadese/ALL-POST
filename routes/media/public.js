const blobHostPattern = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/;

export default async function handler(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) return response.status(405).end();
  let mediaUrl;
  try { mediaUrl = new URL(String(request.query?.url || '')); }
  catch { return response.status(400).end('Invalid media URL.'); }
  if (mediaUrl.protocol !== 'https:' || !blobHostPattern.test(mediaUrl.hostname) || !mediaUrl.pathname.startsWith('/all-post/media/')) {
    return response.status(400).end('Only ALL-POST uploaded media can be served.');
  }
  try {
    const headers = {};
    if (request.headers.range) headers.Range = request.headers.range;
    const upstream = await fetch(mediaUrl, { method: request.method, headers });
    response.status(upstream.status);
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name);
      if (value) response.setHeader(name, value);
    }
    response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=3600');
    if (request.method === 'HEAD') return response.end();
    if (!upstream.body) return response.end();
    const { Readable } = await import('node:stream');
    const { pipeline } = await import('node:stream/promises');
    await pipeline(Readable.fromWeb(upstream.body), response);
  } catch (error) {
    console.error('Public media proxy failed:', error.message);
    response.status(502).end('Uploaded media is temporarily unavailable.');
  }
}

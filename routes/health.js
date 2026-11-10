export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(200).json({ ok: true, mode: 'single-owner-production' });
}

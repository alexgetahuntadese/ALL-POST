import { hasAppPassword, hasSessionSecret, sessionValid } from '../../lib/security.js';

export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(200).json({
    authenticated: sessionValid(request),
    configured: hasAppPassword() && hasSessionSecret(),
  });
}

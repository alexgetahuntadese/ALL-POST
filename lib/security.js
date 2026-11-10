import { createHmac, timingSafeEqual } from 'node:crypto';

export const APP_ORIGIN = (process.env.APP_BASE_URL || 'https://all-post.vercel.app').replace(/\/$/, '');
const SESSION_COOKIE = 'allpost_session';
const OAUTH_COOKIE = 'allpost_linkedin_oauth';
const SESSION_SECONDS = 60 * 60 * 12;
const OAUTH_SECONDS = 60 * 10;
const loginAttempts = new Map();

function cookieValue(request, key) {
  const header = request.headers.cookie || '';
  const item = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${key}=`));
  return item ? decodeURIComponent(item.slice(key.length + 1)) : '';
}

function sign(value) {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('App session configuration is incomplete.');
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function isSignatureValid(payload, signature) {
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature || '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function cookie(name, value, maxAge, sameSite = 'Lax') {
  return [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'Secure', 'HttpOnly', `SameSite=${sameSite}`, `Max-Age=${maxAge}`].join('; ');
}

function oauthCookieName(provider = 'linkedin') {
  return provider === 'linkedin' ? OAUTH_COOKIE : `allpost_${provider}_oauth`;
}
export function clearOAuthCookie(provider = 'linkedin') { return cookie(oauthCookieName(provider), '', 0); }
export function hasAppPassword() { return Boolean(process.env.APP_PASSWORD && Buffer.byteLength(process.env.APP_PASSWORD) >= 16); }
export function hasSessionSecret() { return Boolean(process.env.APP_SESSION_SECRET && Buffer.byteLength(process.env.APP_SESSION_SECRET) >= 32); }

export function sessionValid(request) {
  try {
    const [payload, signature] = cookieValue(request, SESSION_COOKIE).split('.');
    if (!payload || !signature || !isSignatureValid(payload, signature)) return false;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).exp > Date.now();
  } catch { return false; }
}

export function requireSession(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!hasAppPassword() || !hasSessionSecret()) {
    response.status(503).json({ error: 'Secure app access is not configured yet.' });
    return false;
  }
  if (!sessionValid(request)) {
    response.status(401).json({ error: 'Sign in to ALL-POST first.' });
    return false;
  }
  return true;
}

export function requireSameOrigin(request, response) {
  if (request.headers.origin !== APP_ORIGIN) {
    response.status(403).json({ error: 'This request did not come from ALL-POST.' });
    return false;
  }
  return true;
}

export function loginResponse(request, response, password) {
  response.setHeader('Cache-Control', 'no-store');
  if (!hasAppPassword() || !hasSessionSecret()) {
    response.status(503).json({ error: 'Set APP_PASSWORD and APP_SESSION_SECRET in Vercel before signing in.' });
    return;
  }
  const now = Date.now();
  const key = request.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const prior = loginAttempts.get(key);
  if (prior && prior.until > now && prior.count >= 8) {
    response.setHeader('Retry-After', String(Math.ceil((prior.until - now) / 1000)));
    response.status(429).json({ error: 'Too many attempts. Wait before trying again.' });
    return;
  }
  const attempt = prior && prior.until > now ? prior : { count: 0, until: now + 15 * 60_000 };
  attempt.count += 1;
  loginAttempts.set(key, attempt);
  const supplied = Buffer.from(String(password ?? ''));
  const expected = Buffer.from(process.env.APP_PASSWORD);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    response.status(401).json({ error: 'Password did not match.' });
    return;
  }
  loginAttempts.delete(key);
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_SECONDS * 1000 })).toString('base64url');
  response.setHeader('Set-Cookie', cookie(SESSION_COOKIE, `${payload}.${sign(payload)}`, SESSION_SECONDS));
  response.status(200).json({ authenticated: true });
}

export function clearSession(response) {
  response.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
  response.setHeader('Cache-Control', 'no-store');
}

export function setOAuthState(request, response, state, provider = 'linkedin', extra = {}) {
  const exp = Date.now() + OAUTH_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ state, exp, session: cookieValue(request, SESSION_COOKIE), provider, ...extra })).toString('base64url');
  response.setHeader('Set-Cookie', cookie(oauthCookieName(provider), `${payload}.${sign(payload)}`, OAUTH_SECONDS));
}

export function oauthStateData(request, provider = 'linkedin') {
  try {
    const [payload, signature] = cookieValue(request, oauthCookieName(provider)).split('.');
    if (!payload || !signature || !isSignatureValid(payload, signature)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp <= Date.now() || data.session !== cookieValue(request, SESSION_COOKIE) || data.provider !== provider || !sessionValid(request)) return null;
    return data;
  } catch { return null; }
}

export function verifyOAuthState(request, returnedState, provider = 'linkedin') {
  return oauthStateData(request, provider)?.state === returnedState;
}

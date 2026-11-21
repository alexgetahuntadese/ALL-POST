import test from 'node:test';
import assert from 'node:assert/strict';
import { listPublishers, normalizePlatformError } from '../lib/platform-publisher.js';
import { splitTelegramText } from '../lib/telegram.js';
import { createWebhookSignature, verifyWebhookSignature, validateWebhookConfig } from '../lib/webhook-publisher.js';

test('all social destinations implement the shared publisher contract', () => {
  const platforms = listPublishers().map((publisher) => publisher.platform);
  assert.deepEqual(platforms.sort(), ['facebook', 'instagram', 'linkedin', 'tiktok', 'telegram', 'webhook', 'x', 'youtube'].sort());
  for (const publisher of listPublishers()) {
    assert.equal(typeof publisher.validatePost, 'function');
    assert.equal(typeof publisher.publish, 'function');
    assert.equal(typeof publisher.refreshTokenIfNeeded, 'function');
    assert.equal(typeof publisher.normalizeError, 'function');
  }
});

test('platform errors retry 429 and 5xx but mark auth and permission errors permanent', () => {
  assert.equal(normalizePlatformError(Object.assign(new Error('rate limited'), { status: 429 })).retryable, true);
  assert.equal(normalizePlatformError(Object.assign(new Error('upstream error'), { status: 503 })).retryable, true);
  assert.equal(normalizePlatformError(Object.assign(new Error('unauthorized'), { status: 401 })).reconnectRequired, true);
  assert.equal(normalizePlatformError(Object.assign(new Error('denied'), { status: 403 })).code, 'permission_denied');
});

test('Telegram text splits at the requested limit and preserves all content', () => {
  const text = `${'የኢትዮጵያ '.repeat(500)}end`;
  const parts = splitTelegramText(text, 1024);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((part) => part.length <= 1024));
  assert.equal(parts.join(' ').replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim());
});

test('webhook signatures validate the exact timestamp and serialized body', () => {
  const secret = 'a'.repeat(48);
  const body = JSON.stringify({ id: 'job-1', text: 'ሰላም' });
  const signature = createWebhookSignature(secret, '1790000000', body);
  assert.equal(verifyWebhookSignature(secret, '1790000000', body, signature), true);
  assert.equal(verifyWebhookSignature(secret, '1790000001', body, signature), false);
  assert.equal(verifyWebhookSignature(secret, '1790000000', `${body} `, signature), false);
});

test('webhook configuration accepts public HTTPS and rejects unsafe targets', () => {
  assert.doesNotThrow(() => validateWebhookConfig({ url: 'https://hooks.example.org/post', secret: 's'.repeat(32) }));
  assert.throws(() => validateWebhookConfig({ url: 'http://hooks.example.org/post', secret: 's'.repeat(32) }), /HTTPS/);
  assert.throws(() => validateWebhookConfig({ url: 'https://127.0.0.1/post', secret: 's'.repeat(32) }), /public HTTPS/);
});

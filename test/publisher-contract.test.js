import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublisher, listPublishers, normalizePlatformError, resolvePlatformText } from '../lib/platform-publisher.js';
import { splitTelegramText } from '../lib/telegram.js';
import { createWebhookSignature, verifyWebhookSignature, validateWebhookConfig } from '../lib/webhook-publisher.js';
import { sortJobsByCreatedAt } from '../lib/post-queue.js';

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

test('product media formats validate for Facebook, Instagram, X, and TikTok', () => {
  const sample = { text: 'New product is here', mediaUrl: 'https://media.example/item', mediaType: 'video/mp4' };
  for (const platform of ['facebook', 'instagram', 'x', 'tiktok']) {
    const payload = platform === 'tiktok' ? { ...sample, tiktokPrivacy: 'PUBLIC_TO_EVERYONE' } : sample;
    assert.doesNotThrow(() => getPublisher(platform).validatePost(payload), `${platform} should accept an MP4 product clip`);
  }
  assert.throws(() => getPublisher('facebook').validatePost({ ...sample, mediaType: 'video/webm' }), /Facebook accepts/);
  assert.throws(() => getPublisher('instagram').validatePost({ text: sample.text }), /Instagram requires/);
});

test('all platform adapters accept their minimum post payload without network calls', () => {
  const photo = { text: 'ሰላም', mediaUrl: 'https://media.example/post.jpg', mediaType: 'image/jpeg' };
  const video = { text: 'ሰላም', mediaUrl: 'https://media.example/post.mp4', mediaType: 'video/mp4' };
  const payloads = {
    linkedin: { text: 'ሰላም' },
    facebook: { text: 'ሰላም' },
    instagram: photo,
    x: { text: 'ሰላም' },
    tiktok: photo,
    youtube: video,
    telegram: { text: 'ሰላም' },
    webhook: { text: 'ሰላም' },
  };
  for (const [platform, payload] of Object.entries(payloads)) {
    assert.doesNotThrow(() => getPublisher(platform).validatePost(payload), `${platform} should accept its minimum valid post`);
  }
  assert.throws(() => getPublisher('x').validatePost({ text: 'x'.repeat(281) }), /weighted-character limit/);
  assert.doesNotThrow(() => getPublisher('linkedin').validatePost({ text: 'Master copy', overrides: { linkedin: { text: 'ልዩ ጽሑፍ' } } }));
});

test('immediate publishing preserves per-platform copy and falls back to the master post', () => {
  const payload = { text: 'Master copy', overrides: { instagram: { text: 'አማርኛ ጽሑፍ' } } };
  assert.equal(resolvePlatformText(payload, 'instagram'), 'አማርኛ ጽሑፍ');
  assert.equal(resolvePlatformText(payload, 'facebook'), 'Master copy');
  assert.doesNotThrow(() => getPublisher('instagram').validatePost({ ...payload, mediaUrl: 'https://media.example/photo.jpg', mediaType: 'image/jpeg' }));
});

test('X post validation uses weighted Unicode and link length rules', () => {
  assert.doesNotThrow(() => getPublisher('x').validatePost({ text: 'ሰላም https://example.com' }));
  assert.throws(() => getPublisher('x').validatePost({ text: 'ሰ'.repeat(141) }), /weighted-character limit/);
  assert.throws(() => getPublisher('x').validatePost({ text: `${'a'.repeat(258)} https://example.com` }), /weighted-character limit/);
});

test('queue history sorts ISO timestamps newest first', () => {
  const jobs = [
    { id: 'old', createdAt: '2026-11-20T08:00:00.000Z' },
    { id: 'newest', createdAt: '2026-11-23T08:00:00.000Z' },
    { id: 'middle', createdAt: '2026-11-21T08:00:00.000Z' },
  ];
  assert.deepEqual(sortJobsByCreatedAt(jobs).map((job) => job.id), ['newest', 'middle', 'old']);
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

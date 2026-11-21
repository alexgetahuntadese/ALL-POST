import { getSocialAccount } from './social-storage.js';

const API = 'https://api.telegram.org';

export function splitTelegramText(value, limit) {
  const chunks = [];
  let remaining = value;
  while (remaining.length > limit) {
    let end = remaining.lastIndexOf('\n', limit);
    if (end < Math.floor(limit * 0.6)) end = remaining.lastIndexOf(' ', limit);
    if (end < Math.floor(limit * 0.6)) end = limit;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function telegramRequest(token, method, payload) {
  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    const error = new Error(String(result.description || `Telegram ${method} failed (${response.status}).`).slice(0, 240));
    error.status = Number(result.error_code) || response.status || 502;
    error.retryable = error.status === 429 || error.status >= 500;
    throw error;
  }
  return result.result;
}

function validateDestination(value) {
  const chatId = String(value || '').trim();
  if (!chatId || chatId.length > 100 || !/^(?:@[A-Za-z0-9_]{5,}|-?\d{5,})$/.test(chatId)) throw new Error('Telegram destination must be a public @channel username or numeric chat ID.');
  return chatId;
}

export async function validateTelegramBotToken(token) {
  const value = String(token || '').trim();
  if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(value)) throw new Error('Enter a valid Telegram bot token from BotFather.');
  const me = await telegramRequest(value, 'getMe', {});
  return { id: String(me.id), name: me.first_name || 'Telegram bot', username: me.username || '' };
}

export async function configureTelegram({ token, destination, name }) {
  const account = await getSocialAccount('telegram');
  const valid = await validateTelegramBotToken(token || account?.accessToken);
  const chatId = validateDestination(destination);
  const targets = [...(account?.targets || [])];
  if (targets.some((target) => target.chatId === chatId)) throw new Error('That Telegram destination is already saved.');
  targets.push({ chatId, name: String(name || chatId).trim().slice(0, 80) });
  return { ...account, ...valid, accessToken: String(token || account.accessToken).trim(), targets };
}

export async function publishTelegramPost({ text, mediaUrl, mediaType, mediaUrls, buttons, chatId: explicitChatId, destinationIds }) {
  const account = await getSocialAccount('telegram');
  if (!account?.accessToken) throw new Error('Connect a Telegram bot before publishing.');
  const configuredTargets = (account.targets || []).map((target) => validateDestination(target.chatId));
  const chatIds = explicitChatId ? [validateDestination(explicitChatId)] : Array.isArray(destinationIds) ? destinationIds.map(validateDestination).filter((id) => configuredTargets.includes(id)) : configuredTargets;
  if (Array.isArray(destinationIds) && chatIds.length !== destinationIds.length) throw new Error('Choose only saved Telegram destinations.');
  if (!chatIds.length) throw new Error('Add at least one Telegram channel or group destination.');
  const caption = String(text || '').trim();
  if (!caption) throw new Error('Write a Telegram post before publishing.');
  if (buttons?.length && buttons.length > 20) throw new Error('Telegram supports at most 20 inline buttons per post.');
  const replyMarkup = buttons?.length ? { inline_keyboard: [buttons.slice(0, 20).map(({ text: label, url }) => {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !label || label.length > 64) throw new Error('Telegram buttons need a label and HTTPS link.');
    return { text: label, url: target.toString() };
  })] } : undefined;
  const mediaList = (Array.isArray(mediaUrls) && mediaUrls.length ? mediaUrls : mediaUrl ? [{ url: mediaUrl, type: mediaType }] : [])
    .map((item) => ({ url: String(item.url || item.mediaUrl || ''), type: String(item.type || item.mediaType || '') }));
  if (mediaList.length > 10) throw new Error('Telegram media groups support up to 10 files per post.');
  for (const item of mediaList) {
    if (!['image/jpeg', 'image/png', 'video/mp4'].includes(item.type)) throw new Error('Telegram media accepts JPEG/PNG photos or MP4 videos.');
    const url = new URL(item.url);
    if (url.protocol !== 'https:' || url.hostname !== new URL(process.env.APP_BASE_URL || 'https://all-post.vercel.app').hostname || url.pathname !== '/api/media/public' || !url.searchParams.get('url')) {
      throw new Error('Telegram media must be an ALL-POST uploaded public file.');
    }
  }
  const results = [];
  for (const chatId of chatIds) {
    let sent = [];
    try {
      const parts = splitTelegramText(caption, mediaList.length ? 1024 : 4096);
      if (mediaList.length > 1) {
        const group = mediaList.map((item, index) => ({ type: item.type.startsWith('video/') ? 'video' : 'photo', media: item.url, ...(index === 0 ? { caption: parts[0] } : {}) }));
        sent = await telegramRequest(account.accessToken, 'sendMediaGroup', { chat_id: chatId, media: group });
        if (replyMarkup) sent.push(await telegramRequest(account.accessToken, 'sendMessage', { chat_id: chatId, text: 'Links', reply_markup: replyMarkup }));
      } else if (mediaList.length === 1 && mediaList[0].type === 'video/mp4') {
        sent = [await telegramRequest(account.accessToken, 'sendVideo', { chat_id: chatId, video: mediaList[0].url, caption: parts[0], ...(replyMarkup ? { reply_markup: replyMarkup } : {}) })];
      } else if (mediaList.length === 1) {
        sent = [await telegramRequest(account.accessToken, 'sendPhoto', { chat_id: chatId, photo: mediaList[0].url, caption: parts[0], ...(replyMarkup ? { reply_markup: replyMarkup } : {}) })];
      } else {
        sent = [await telegramRequest(account.accessToken, 'sendMessage', { chat_id: chatId, text: parts[0], ...(replyMarkup ? { reply_markup: replyMarkup } : {}) })];
      }
      for (const part of parts.slice(1)) sent.push(await telegramRequest(account.accessToken, 'sendMessage', { chat_id: chatId, text: part }));
      results.push({ chatId, status: 'published', messageIds: sent.map((message) => String(message.message_id)), url: sent[0]?.chat?.username ? `https://t.me/${sent[0].chat.username}/${sent[0].message_id}` : null });
    } catch (error) {
      const message = String(error?.message || 'Telegram publish failed.').slice(0, 240);
      results.push(sent.length
        ? { chatId, status: 'published', messageIds: sent.map((item) => String(item.message_id)), warning: message }
        : { chatId, status: 'failed', error: message, statusCode: Number(error?.status || 0), retryable: Boolean(error?.retryable) });
    }
  }
  const published = results.filter((item) => item.status === 'published');
  const failed = results.filter((item) => item.status === 'failed');
  if (!published.length && failed.length) {
    const error = new Error(failed.map((item) => `${item.chatId}: ${item.error}`).join(' · '));
    error.status = failed.find((item) => item.retryable)?.statusCode || failed[0].statusCode || 502; error.retryable = failed.some((item) => item.retryable); error.results = results;
    throw error;
  }
  return { id: published.map((item) => `${item.chatId}:${item.messageIds[0]}`).join(','), results, partial: failed.length > 0, error: [...failed.map((item) => `${item.chatId}: ${item.error}`), ...published.filter((item) => item.warning).map((item) => `${item.chatId}: ${item.warning}`)].join(' · ') || null };
}

export function telegramError(error) {
  const status = Number(error?.status || 0);
  const retryable = error?.retryable === false ? false : error?.retryable === true || status === 429 || status >= 500 || /timeout|fetch failed|network/i.test(String(error?.message));
  return { message: String(error?.message || 'Telegram publish failed.').slice(0, 280), code: status === 401 ? 'reconnect_required' : status === 403 ? 'permission_denied' : retryable ? 'transient' : 'publish_failed', retryable: Boolean(retryable && status !== 401 && status !== 403), reconnectRequired: status === 401 };
}

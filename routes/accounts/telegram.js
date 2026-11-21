import { requireSameOrigin, requireSession } from '../../lib/security.js';
import { encryptionReady, storageReady } from '../../lib/linkedin.js';
import { configureTelegram } from '../../lib/telegram.js';
import { getSocialAccount, removeSocialAccount, saveSocialAccount } from '../../lib/social-storage.js';

function safeAccount(account) {
  return account ? { connected: true, name: account.name, username: account.username, targets: (account.targets || []).map(({ chatId, name }) => ({ chatId, name })) } : { connected: false, targets: [] };
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!requireSession(request, response)) return;
  if (request.method === 'GET') {
    try { return response.status(200).json(safeAccount(await getSocialAccount('telegram'))); }
    catch { return response.status(503).json({ error: 'Could not read Telegram setup.' }); }
  }
  if (!requireSameOrigin(request, response)) return;
  try {
    if (!encryptionReady() || !storageReady()) throw new Error('Private encrypted storage is not configured.');
    if (request.method === 'POST') {
      const account = await configureTelegram({ token: request.body?.token, destination: request.body?.destination, name: request.body?.name });
      await saveSocialAccount('telegram', account);
      return response.status(200).json(safeAccount(account));
    }
    if (request.method === 'DELETE') {
      const chatId = String(request.body?.chatId || '');
      const account = await getSocialAccount('telegram');
      if (!account) return response.status(404).json({ error: 'Telegram is not configured.' });
      if (chatId === '*') await removeSocialAccount('telegram');
      else {
        account.targets = (account.targets || []).filter((target) => target.chatId !== chatId);
        await saveSocialAccount('telegram', account);
      }
      return response.status(200).json({ disconnected: true });
    }
    response.setHeader('Allow', 'GET, POST, DELETE');
    return response.status(405).end();
  } catch (error) {
    const message = String(error?.message || 'Could not configure Telegram.');
    return response.status(/token|destination|username|chat ID|HTTPS|already saved/i.test(message) ? 400 : 503).json({ error: message });
  }
}

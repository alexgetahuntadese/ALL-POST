import { upload } from '@vercel/blob/client';

const textarea = document.getElementById('post-text');
const rows = [...document.querySelectorAll('.channel-row')];
const tabs = [...document.querySelectorAll('.preview-tab')];
const toast = document.getElementById('toast');
const modal = document.getElementById('modal');
const emojiPicker = document.getElementById('emoji-picker');
const draftState = document.getElementById('draft-state');
const loginGate = document.getElementById('login-gate');
const loginForm = document.getElementById('login-form');
const loginMessage = document.getElementById('login-message');
const loginError = document.getElementById('login-error');
const loginPassword = document.getElementById('app-password');
let activePreview = 'instagram';
let toastTimer;
let saveTimer;
let selectedMedia = null;
let mediaStorageConfigured = false;
let scheduleMode = false;
let lastQueuePosts = [];
let savedDrafts = [];
let activeDraftId = null;
let calendarCursor = new Date();
let selectedCalendarDate = null;
const platformOverrides = {};
const facebookGroupsKey = 'allpost-facebook-groups';
const ETHIOPIA_TIME_ZONE = 'Africa/Addis_Ababa';
let interfaceLanguage = localStorage.getItem('allpost-language') === 'am' ? 'am' : 'en';

function zonedParts(date, timeZone = ETHIOPIA_TIME_ZONE) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map(({ type, value }) => [type, Number(value)]));
}

function toZonedDateTimeValue(date, timeZone = ETHIOPIA_TIME_ZONE) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function fromZonedDateTimeValue(value, timeZone = ETHIOPIA_TIME_ZONE) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return new Date(NaN);
  const [, y, mo, d, h, mi] = match.map(Number);
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  let instant = wanted;
  for (let i = 0; i < 3; i += 1) {
    const p = zonedParts(new Date(instant), timeZone);
    instant += wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return new Date(instant);
}

function formatDate(date, options = {}) {
  const locale = interfaceLanguage === 'am' ? 'am-ET' : 'en-ET';
  return new Intl.DateTimeFormat(locale, { timeZone: ETHIOPIA_TIME_ZONE, ...options }).format(date);
}

function updateTodayLabel() {
  document.querySelector('.today-label').textContent = formatDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' });
}

const translations = {
  'Workspace': 'የሥራ ቦታ', 'Compose': 'ጽሑፍ አዘጋጅ', 'Queue': 'የሚጠብቁ', 'Calendar': 'የጊዜ ሰሌዳ', 'Analytics': 'ትንታኔ', 'Drafts': 'ረቂቆች',
  'YOUR SOCIAL DESK': 'የማህበራዊ ሚዲያ ማዕከል', 'Make one post.': 'አንድ ጽሑፍ ያዘጋጁ።', 'Share it everywhere.': 'በሁሉም ቦታ ያጋሩ።',
  'Write once, then publish to the channels you choose.': 'አንድ ጊዜ ይጻፉ፤ በመረጡት ቻናሎች ያጋሩ።', 'Your post': 'ጽሑፍዎ', 'Start with one idea. Make it yours.': 'በአንድ ሀሳብ ይጀምሩ። የእርስዎ ያድርጉት።',
  'Pick your places': 'የሚያጋሩባቸውን ይምረጡ', 'Publish': 'ያጋሩ', 'Schedule': 'ጊዜ ይወስኑ', 'Save draft': 'ረቂቅ ያስቀምጡ', 'Add a tag': 'መለያ ጨምር',
  'Made for your time.': 'ለእርስዎ ሰዓት የተዘጋጀ።', 'Scheduling uses Addis Ababa time (EAT, UTC+3). Write in English or አማርኛ.': 'የጊዜ ሰሌዳው የአዲስ አበባን ሰዓት (EAT, UTC+3) ይጠቀማል። በእንግሊዝኛ ወይም በአማርኛ ይጻፉ።',
  'Explore plans': 'ዕቅዶችን ይመልከቱ', 'Sign out': 'ውጣ', 'View queue': 'የሚጠብቁትን ይመልከቱ', 'See how it lands.': 'እንዴት እንደሚታይ ይመልከቱ።',
  'Write something good': 'ጥሩ ነገር ይጻፉ',
  'Live preview': 'ቅድመ እይታ', 'A little momentum': 'ቀጣይ እርምጃ', 'Nothing scheduled for this day.': 'ለዚህ ቀን ምንም አልተያዘም።',
  'Start with a thought.': 'በሀሳብ ይጀምሩ።', 'Choose a date and time.': 'ቀንና ሰዓት ይምረጡ።', 'Got it': 'ገባኝ', 'Add to queue': 'ወደ ዝርዝር ጨምር',
};

function applyLanguage() {
  document.documentElement.lang = interfaceLanguage;
  document.getElementById('language-picker').value = interfaceLanguage;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.__allpostOriginalText) node.__allpostOriginalText = node.nodeValue;
    const original = node.__allpostOriginalText;
    const key = original.trim();
    if (!key || !translations[key]) continue;
    const translated = interfaceLanguage === 'am' ? translations[key] : key;
    node.nodeValue = `${original.match(/^\s*/)?.[0] || ''}${translated}${original.match(/\s*$/)?.[0] || ''}`;
  }
  const postText = document.getElementById('post-text');
  postText.placeholder = interfaceLanguage === 'am' ? 'ምን ማጋራት ይፈልጋሉ? ሀሳብዎን፣ ስኬትዎን ወይም ጠቃሚ ነገር ይጻፉ…' : 'What’s on your mind? Share a thought, a win, or something worth passing on…';
  updateTodayLabel();
}

const platformCopy = {
  facebook: ['Page post', 'Facebook Page'],
  instagram: ['Suggested for you', 'alexgetahun'],
  linkedin: ['Your network', 'Alex Getahun'],
  x: ['Latest posts', 'alexgetahun'],
  youtube: ['Video preview', 'Alex Getahun'],
  tiktok: ['For you', 'alexgetahun'],
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function openModal(title, body) {
  scheduleMode = false;
  document.getElementById('schedule-controls').hidden = true;
  document.getElementById('modal-action').innerHTML = 'Got it <span>→</span>';
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  modal.classList.add('open');
  document.getElementById('modal-action').focus();
}

function openScheduleModal() {
  openModal('Choose when to publish.', 'Choose a date and time in Addis Ababa (EAT, UTC+3). ALL-POST will publish it to the selected connected channels.');
  const controls = document.getElementById('schedule-controls');
  const input = document.getElementById('schedule-at');
  const minTime = new Date(Date.now() + 2 * 60_000);
  input.min = toZonedDateTimeValue(minTime);
  const rounded = new Date(Date.now() + 20 * 60_000);
  rounded.setMinutes(Math.ceil(rounded.getMinutes() / 15) * 15, 0, 0);
  input.value = toZonedDateTimeValue(rounded);
  controls.hidden = false;
  scheduleMode = true;
  document.getElementById('modal-action').innerHTML = 'Add to queue <span>→</span>';
  input.focus();
}

function composePayload() {
  const channels = selectedRows().filter((row) => !platformOverrides[row.dataset.channel]?.skip).map((row) => row.dataset.channel);
  const overrides = structuredClone(platformOverrides);
  const buttonText = document.getElementById('telegram-button-text').value.trim();
  const buttonUrl = document.getElementById('telegram-button-url').value.trim();
  if (buttonText && buttonUrl) overrides.telegram = { ...overrides.telegram, buttons: [{ text: buttonText, url: buttonUrl }] };
  return {
    text: textarea.value,
    channels,
    overrides,
    telegramDestinationIds: [...document.querySelectorAll('#telegram-targets [data-telegram-target]:checked')].map((input) => input.dataset.telegramTarget),
    mediaUrl: selectedMedia?.url || '',
    mediaType: selectedMedia?.contentType || '',
    mediaName: selectedMedia?.name || '',
    tiktokPrivacy: document.getElementById('tiktok-privacy').value,
    tiktokInteractions: {
      comments: document.getElementById('tiktok-comments').checked,
      duet: document.getElementById('tiktok-duet').checked,
      stitch: document.getElementById('tiktok-stitch').checked,
    },
    tiktokBrand: {
      branded: document.getElementById('tiktok-branded').checked,
      ownBrand: document.getElementById('tiktok-own-brand').checked,
    },
    tiktokConsent: document.getElementById('tiktok-consent').checked,
    youtubeTitle: document.getElementById('youtube-title').value.trim(),
    youtubePrivacy: document.getElementById('youtube-privacy').value,
    facebookPageId: document.getElementById('facebook-page').value,
  };
}

function renderQueue(posts) {
  lastQueuePosts = posts;
  document.getElementById('queue-count').textContent = String(posts.filter((post) => ['scheduled', 'retrying', 'processing'].includes(post.status)).length);
  const list = document.getElementById('scheduled-list');
  const fallback = document.getElementById('queue-fallback');
  list.replaceChildren();
  const visible = posts.slice(0, 5);
  fallback.hidden = visible.length > 0;
  for (const post of visible) {
    const row = document.createElement('div');
    row.className = 'queue-post';
    const date = document.createElement('div');
    date.className = 'queue-date';
    const day = document.createElement('b');
    const month = document.createElement('small');
    const parsed = new Date(post.scheduledAt || post.createdAt);
    day.textContent = formatDate(parsed, { day: '2-digit' });
    month.textContent = formatDate(parsed, { month: 'short' }).toUpperCase();
    date.append(day, month);
    const info = document.createElement('div');
    info.className = 'queue-post-info';
    const title = document.createElement('strong');
    title.textContent = post.text || 'Scheduled post';
    const detail = document.createElement('small');
    const retryTime = post.retryAt ? ` · retry after ${formatDate(new Date(post.retryAt), { timeStyle: 'short' })}` : '';
    detail.textContent = `${post.status.replaceAll('_', ' ')} · ${formatDate(parsed, { dateStyle: 'medium', timeStyle: 'short' })}${retryTime}`;
    info.append(title, detail);
    const actions = document.createElement('div');
    actions.className = 'queue-actions';
    for (const channel of (post.channels || []).slice(0, 3)) {
      const result = (post.results || []).find((item) => item.channel === channel);
      const badge = document.createElement('i');
      badge.className = channel;
      const stateMark = ({ pending: '…', publishing: '↗', published: '✓', partial: '½', failed: '!', retrying: '↻' })[result?.status] || '';
      badge.textContent = `${({ facebook: 'f', instagram: '◎', linkedin: 'in', x: '𝕏', youtube: '▶', tiktok: '♪', telegram: '➤', webhook: '⌁' })[channel] || channel}${stateMark}`;
      badge.title = `${channel}: ${result?.status || 'pending'}${result?.error ? ` · ${result.error}` : ''}`;
      actions.append(badge);
    }
    if (post.status === 'scheduled') {
      const cancel = document.createElement('button');
      cancel.className = 'queue-cancel';
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      cancel.setAttribute('aria-label', 'Cancel scheduled post');
      cancel.addEventListener('click', async () => {
        cancel.disabled = true;
        try {
          const response = await fetch('/api/queue', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: post.id }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Could not cancel this post.');
          showToast('Scheduled post cancelled.');
          await loadQueue();
        } catch (error) { showToast(error.message); cancel.disabled = false; }
      });
      actions.append(cancel);
    }
    row.append(date, info, actions);
    list.append(row);
  }
  const full = document.getElementById('full-queue-list');
  if (full) {
    full.replaceChildren();
    if (!posts.length) {
      const empty = document.createElement('div'); empty.className = 'queue-empty'; empty.textContent = 'Your queue is clear. Schedule a post to see it here.'; full.append(empty);
    } else {
      for (const post of [...posts].sort((a, b) => Date.parse(b.scheduledAt || b.createdAt) - Date.parse(a.scheduledAt || a.createdAt))) {
        const row = document.createElement('div'); row.className = 'queue-post full-queue-item';
        const title = document.createElement('strong'); title.textContent = post.text || 'Scheduled post';
        const detail = document.createElement('small'); detail.textContent = `${post.status} · ${formatDate(new Date(post.scheduledAt || post.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}`;
        const content = document.createElement('div'); content.className = 'queue-post-info'; content.append(title, detail);
        const badges = document.createElement('div'); badges.className = 'queue-actions';
        for (const channel of post.channels || []) { const result = (post.results || []).find((item) => item.channel === channel); const badge = document.createElement('i'); badge.className = channel; badge.textContent = `${channel} · ${result?.status || 'pending'}`; badge.title = result?.error || ''; badges.append(badge); }
        if (post.status === 'scheduled') { const cancel = document.createElement('button'); cancel.className = 'queue-cancel'; cancel.type = 'button'; cancel.dataset.cancelQueueId = post.id; cancel.textContent = 'Cancel'; badges.append(cancel); }
        row.append(content, badges); full.append(row);
      }
    }
  }
  renderCalendar();
  renderAnalytics(posts);
}

function dayKey(date) { const p = zonedParts(date); return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`; }

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  const year = calendarCursor.getFullYear(); const month = calendarCursor.getMonth();
  document.getElementById('calendar-month').textContent = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(calendarCursor);
  grid.replaceChildren();
  for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) { const head = document.createElement('div'); head.className = 'calendar-weekday'; head.textContent = label; grid.append(head); }
  const first = new Date(year, month, 1);
  const start = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(year, month, index - start + 1);
    const cell = document.createElement('button'); cell.type = 'button'; cell.className = 'calendar-cell'; cell.dataset.calendarDay = dayKey(date);
    if (date.getMonth() !== month) cell.classList.add('outside-month');
    if (dayKey(date) === dayKey(new Date())) cell.classList.add('is-today');
    const number = document.createElement('span'); number.className = 'calendar-number'; number.textContent = String(date.getDate()); cell.append(number);
    const matches = lastQueuePosts.filter((post) => dayKey(new Date(post.scheduledAt || post.createdAt)) === dayKey(date));
    if (matches.length) { const marker = document.createElement('span'); marker.className = 'calendar-event-count'; marker.textContent = `${matches.length} ${matches.length === 1 ? 'post' : 'posts'}`; cell.append(marker); }
    cell.addEventListener('click', () => selectCalendarDay(date)); grid.append(cell);
  }
  selectCalendarDay(new Date(year, month, Math.min(new Date().getDate(), days)));
}

function selectCalendarDay(date) {
  selectedCalendarDate = date;
  const key = dayKey(date);
  document.querySelectorAll('.calendar-cell').forEach((cell) => cell.classList.toggle('selected', cell.dataset.calendarDay === key));
  document.getElementById('calendar-day-title').textContent = formatDate(date, { dateStyle: 'full' });
  const root = document.getElementById('calendar-day-posts'); root.replaceChildren();
  const matches = lastQueuePosts.filter((post) => dayKey(new Date(post.scheduledAt || post.createdAt)) === key);
  if (!matches.length) { const empty = document.createElement('div'); empty.className = 'queue-empty'; empty.textContent = 'Nothing scheduled for this day.'; root.append(empty); return; }
  for (const post of matches) { const row = document.createElement('div'); row.className = 'queue-post'; const info = document.createElement('div'); info.className = 'queue-post-info'; const title = document.createElement('strong'); title.textContent = post.text || 'Scheduled post'; const detail = document.createElement('small'); detail.textContent = `${post.status} · ${formatDate(new Date(post.scheduledAt || post.createdAt), { timeStyle: 'short' })} · ${(post.channels || []).join(', ')}`; info.append(title, detail); row.append(info); root.append(row); }
}

function renderAnalytics(posts) {
  const results = posts.flatMap((post) => post.results || []);
  const published = results.filter((result) => result.status === 'published').length;
  const attempts = results.filter((result) => ['published', 'partial', 'failed'].includes(result.status)).length;
  const values = [
    ['Posts delivered', String(published), 'Across all connected channels'],
    ['Delivery success', `${attempts ? Math.round(published / attempts * 100) : 0}%`, `${published} published of ${attempts} completed channel attempts`],
    ['Needs attention', String(results.filter((result) => ['failed', 'retrying', 'partial'].includes(result.status)).length), 'Failed, partial, or retrying channels'],
    ['Scheduled', String(posts.filter((post) => ['scheduled', 'processing', 'retrying'].includes(post.status)).length), 'Posts still in the queue'],
  ];
  const cards = document.getElementById('analytics-cards'); cards.replaceChildren();
  for (const [label, value, note] of values) { const card = document.createElement('article'); card.className = 'analytics-card'; const heading = document.createElement('small'); heading.textContent = label; const metric = document.createElement('strong'); metric.textContent = value; const caption = document.createElement('span'); caption.textContent = note; card.append(heading, metric, caption); cards.append(card); }
  const counts = new Map();
  for (const result of results) { const item = counts.get(result.channel) || { published: 0, failed: 0, pending: 0 }; if (result.status === 'published') item.published += 1; else if (['failed', 'partial'].includes(result.status)) item.failed += 1; else item.pending += 1; counts.set(result.channel, item); }
  const channelRoot = document.getElementById('analytics-channels'); channelRoot.replaceChildren();
  if (!counts.size) { const empty = document.createElement('p'); empty.className = 'queue-empty'; empty.textContent = 'Publish or schedule a post to start building delivery history.'; channelRoot.append(empty); }
  for (const [channel, count] of counts) { const row = document.createElement('div'); row.className = 'analytics-channel'; const name = document.createElement('strong'); name.textContent = channel; const meter = document.createElement('span'); meter.className = 'analytics-meter'; const fill = document.createElement('i'); const total = count.published + count.failed + count.pending; fill.style.width = `${total ? Math.round(count.published / total * 100) : 0}%`; meter.append(fill); const detail = document.createElement('small'); detail.textContent = `${count.published} published · ${count.failed} needs attention · ${count.pending} pending`; row.append(name, meter, detail); channelRoot.append(row); }
}

function renderDrafts() {
  const root = document.getElementById('draft-list'); root.replaceChildren();
  if (!savedDrafts.length) { const empty = document.createElement('div'); empty.className = 'queue-empty'; empty.textContent = 'No saved drafts yet. Write an idea and choose Save draft.'; root.append(empty); return; }
  for (const draft of savedDrafts) {
    const card = document.createElement('article'); card.className = 'draft-card';
    const title = document.createElement('strong'); title.textContent = draft.title || 'Untitled draft';
    const excerpt = document.createElement('p'); excerpt.textContent = draft.payload?.text || 'No text yet';
    const date = document.createElement('small'); date.textContent = `Saved ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.updatedAt))}`;
    const actions = document.createElement('div'); actions.className = 'draft-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'schedule-button'; edit.textContent = 'Open draft'; edit.addEventListener('click', () => restoreWorkspaceDraft(draft));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'queue-cancel'; remove.textContent = 'Delete'; remove.addEventListener('click', async () => { try { const response = await fetch('/api/drafts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: draft.id }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not delete draft.'); savedDrafts = savedDrafts.filter((item) => item.id !== draft.id); renderDrafts(); showToast('Draft deleted.'); } catch (error) { showToast(error.message); } });
    actions.append(edit, remove); card.append(title, excerpt, date, actions); root.append(card);
  }
}

function restoreWorkspaceDraft(draft) {
  const payload = draft.payload || {}; activeDraftId = draft.id;
  textarea.value = payload.text || '';
  Object.keys(platformOverrides).forEach((key) => delete platformOverrides[key]);
  if (payload.overrides) Object.assign(platformOverrides, payload.overrides);
  rows.forEach((row) => { const checked = (payload.channels || []).includes(row.dataset.channel); row.querySelector('input').checked = checked; row.classList.toggle('selected', checked); });
  if (payload.mediaUrl) {
    const blobUrl = new URL(payload.mediaUrl, window.location.origin).searchParams.get('url');
    selectedMedia = { url: payload.mediaUrl, blobUrl, contentType: payload.mediaType || '', name: payload.mediaName || 'Saved media' };
    document.getElementById('media-upload-status').hidden = false; document.getElementById('media-upload-message').textContent = `${selectedMedia.name} is attached to this draft.`;
  } else { selectedMedia = null; document.getElementById('media-upload-status').hidden = true; }
  document.getElementById('youtube-title').value = payload.youtubeTitle || '';
  document.getElementById('youtube-privacy').value = payload.youtubePrivacy || '';
  document.getElementById('tiktok-privacy').value = payload.tiktokPrivacy || '';
  document.getElementById('facebook-page').value = payload.facebookPageId || '';
  localStorage.setItem('allpost-draft', JSON.stringify({ id: activeDraftId, text: textarea.value, channels: payload.channels || [], overrides: platformOverrides }));
  document.getElementById('draft-state').textContent = 'Saved to workspace';
  updateSelected(); refreshPreview(); setWorkspacePage('compose'); showToast('Draft opened.');
}

async function loadSavedDrafts() {
  const root = document.getElementById('draft-list');
  try { const response = await fetch('/api/drafts', { cache: 'no-store' }); if (!response.ok) throw new Error('Drafts unavailable.'); const data = await response.json(); savedDrafts = data.drafts || []; renderDrafts(); }
  catch { root.textContent = 'Could not load saved drafts. Check private storage configuration.'; }
}

function setWorkspacePage(page) {
  const pages = { compose: 'compose', calendar: 'calendar-view', analytics: 'analytics-view', queue: 'queue-view', drafts: 'drafts-view' };
  for (const [name, id] of Object.entries(pages)) document.getElementById(id).hidden = name !== page;
  document.querySelectorAll('.main-nav .nav-item').forEach((item) => item.classList.toggle('active', item.getAttribute('href') === `#${page === 'queue' ? 'queue-view' : page}`));
  const title = { compose: 'Compose', calendar: 'Calendar', analytics: 'Analytics', queue: 'Queue', drafts: 'Drafts' }[page];
  document.querySelector('.breadcrumbs strong').textContent = title;
  if (page === 'drafts') loadSavedDrafts();
  if (page === 'calendar') renderCalendar();
}

async function loadQueue() {
  try {
    const response = await fetch('/api/queue', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    renderQueue(Array.isArray(data.posts) ? data.posts : []);
  } catch { /* The static preview can still be used without the API. */ }
}

function selectedRows() {
  return rows.filter((row) => row.querySelector('input').checked);
}

function updateSelected() {
  const linkedin = rows.find((row) => row.dataset.channel === 'linkedin');
  document.getElementById('select-all').textContent = linkedin.querySelector('input').checked ? 'Deselect LinkedIn' : 'Select LinkedIn';
  const names = selectedRows().filter((row) => !platformOverrides[row.dataset.channel]?.skip).map((row) => row.querySelector('.channel-info strong').textContent);
  document.getElementById('publish-label').textContent = names.length ? `Post to ${names.join(' + ')}` : 'Choose a channel';
  updateMediaOptions();
}

function updateMediaOptions() {
  const selected = selectedRows().map((row) => row.dataset.channel);
  document.getElementById('media-options').hidden = !selected.some((channel) => ['facebook', 'instagram', 'tiktok', 'youtube'].includes(channel)) && !selectedMedia;
  document.getElementById('facebook-options').hidden = !selected.includes('facebook');
  document.getElementById('facebook-group-options').hidden = !selected.includes('facebook');
  document.getElementById('media-storage-note').hidden = mediaStorageConfigured || selectedMedia !== null;
  document.getElementById('tiktok-privacy-group').hidden = !selected.includes('tiktok');
  document.getElementById('youtube-options').hidden = !selected.includes('youtube');
  document.getElementById('telegram-options').hidden = !selected.includes('telegram');
  document.getElementById('webhook-options').hidden = !selected.includes('webhook');
  const overrideOptions = document.getElementById('platform-overrides');
  overrideOptions.hidden = selected.length < 2;
  renderPlatformOverrides(selected);
}

function renderPlatformOverrides(channels) {
  const root = document.getElementById('platform-overrides-fields');
  for (const field of root.querySelectorAll('[data-override-text]')) platformOverrides[field.dataset.overrideText] = { ...platformOverrides[field.dataset.overrideText], text: field.value };
  for (const field of root.querySelectorAll('[data-override-skip]')) platformOverrides[field.dataset.overrideSkip] = { ...platformOverrides[field.dataset.overrideSkip], skip: field.checked };
  root.replaceChildren();
  for (const channel of channels) {
    const row = document.createElement('div');
    row.className = 'override-row';
    const name = document.createElement('strong');
    name.textContent = channel[0].toUpperCase() + channel.slice(1);
    const skipLabel = document.createElement('label');
    const skip = document.createElement('input');
    skip.type = 'checkbox';
    skip.checked = Boolean(platformOverrides[channel]?.skip);
    skip.dataset.overrideSkip = channel;
    const skipText = document.createElement('span');
    skipText.textContent = 'Skip';
    skipLabel.append(skip, skipText);
    const input = document.createElement('textarea');
    input.placeholder = 'Use the main post, or write platform-specific copy';
    input.value = platformOverrides[channel]?.text || '';
    input.maxLength = channel === 'x' ? 280 : channel === 'youtube' ? 5000 : 10000;
    input.dataset.overrideText = channel;
    input.addEventListener('input', () => { platformOverrides[channel] = { ...platformOverrides[channel], text: input.value, skip: skip.checked }; saveDraft(); });
    skip.addEventListener('change', () => { platformOverrides[channel] = { ...platformOverrides[channel], text: input.value, skip: skip.checked }; updateSelected(); saveDraft(); });
    const media = document.createElement('select');
    media.className = 'override-media';
    media.setAttribute('aria-label', `${channel} media selection`);
    media.add(new Option('Use the main media', 'default'));
    media.add(new Option('No media', 'none'));
    media.value = platformOverrides[channel]?.mediaMode || 'default';
    media.addEventListener('change', () => { platformOverrides[channel] = { ...platformOverrides[channel], text: input.value, skip: skip.checked, mediaMode: media.value }; saveDraft(); });
    row.append(name, skipLabel, input, media);
    root.append(row);
  }
}

function savedFacebookGroups() {
  try {
    const groups = JSON.parse(localStorage.getItem(facebookGroupsKey) || '[]');
    return Array.isArray(groups) ? groups.filter((group) => group && typeof group.id === 'string' && typeof group.name === 'string' && typeof group.url === 'string') : [];
  } catch { return []; }
}

function renderFacebookGroups() {
  const list = document.getElementById('facebook-groups-list');
  list.replaceChildren();
  const groups = savedFacebookGroups();
  if (!groups.length) {
    const empty = document.createElement('small');
    empty.className = 'facebook-group-empty';
    empty.textContent = 'Add your first group above. Your saved list stays on this device.';
    list.append(empty);
    return;
  }
  for (const group of groups) {
    const row = document.createElement('div');
    row.className = 'facebook-group-row';
    const name = document.createElement('span');
    name.className = 'facebook-group-name';
    name.textContent = group.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'group-open';
    open.dataset.groupOpen = group.id;
    open.textContent = 'Open + copy';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'facebook-group-remove';
    remove.dataset.groupRemove = group.id;
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${group.name}`);
    row.append(name, open, remove);
    list.append(row);
  }
}

document.getElementById('facebook-group-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const nameInput = document.getElementById('facebook-group-name');
  const urlInput = document.getElementById('facebook-group-url');
  const name = nameInput.value.trim();
  let url;
  try { url = new URL(urlInput.value.trim()); } catch { showToast('Enter a valid Facebook group link.'); return; }
  if (!name || url.protocol !== 'https:' || url.username || url.password || !['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname) || !/^\/groups\/[^/]+\/?$/.test(url.pathname)) {
    showToast('Use a group link such as facebook.com/groups/your-group.');
    return;
  }
  const groups = savedFacebookGroups();
  const normalizedUrl = `https://www.facebook.com${url.pathname}`;
  if (groups.some((group) => group.url === normalizedUrl)) { showToast('That group is already saved.'); return; }
  groups.push({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, name, url: normalizedUrl, selected: true });
  localStorage.setItem(facebookGroupsKey, JSON.stringify(groups));
  nameInput.value = '';
  urlInput.value = '';
  renderFacebookGroups();
  showToast('Facebook group saved on this device.');
});

document.getElementById('facebook-groups-list').addEventListener('click', async (event) => {
  const removeId = event.target.dataset.groupRemove;
  if (removeId) {
    localStorage.setItem(facebookGroupsKey, JSON.stringify(savedFacebookGroups().filter((group) => group.id !== removeId)));
    renderFacebookGroups();
    return;
  }
  const openId = event.target.dataset.groupOpen;
  if (!openId) return;
  const group = savedFacebookGroups().find((item) => item.id === openId);
  const text = textarea.value.trim();
  if (!group) return;
  if (!text) return showToast('Write your post before opening a group.');
  window.open(group.url, '_blank', 'noopener,noreferrer');
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Post copied. Review and publish it in ${group.name}.`);
  } catch {
    showToast(`Group opened. Copy your post and publish it in ${group.name}.`);
  }
});
renderFacebookGroups();

document.getElementById('telegram-save').addEventListener('click', async () => {
  const button = document.getElementById('telegram-save');
  button.disabled = true;
  try {
    const response = await fetch('/api/accounts/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: document.getElementById('telegram-token').value.trim(), destination: document.getElementById('telegram-destination').value.trim(), name: document.getElementById('telegram-name').value.trim() }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save Telegram destination.');
    document.getElementById('telegram-token').value = '';
    document.getElementById('telegram-name').value = '';
    document.getElementById('telegram-destination').value = '';
    showToast('Telegram destination saved securely.');
    await syncAccounts();
    renderTelegramTargets(result.targets);
  } catch (error) { openModal('Telegram setup could not be saved.', error.message); }
  finally { button.disabled = false; }
});

function renderTelegramTargets(targets = []) {
  const root = document.getElementById('telegram-targets');
  root.replaceChildren();
  let selectedTargetIds = [];
  const hasSavedTargetSelection = localStorage.getItem('allpost-telegram-targets') !== null;
  try { selectedTargetIds = JSON.parse(localStorage.getItem('allpost-telegram-targets') || '[]'); } catch { selectedTargetIds = []; }
  for (const target of targets) {
    const row = document.createElement('div'); row.className = 'facebook-group-row';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.dataset.telegramTarget = target.chatId; checkbox.setAttribute('aria-label', `Select ${target.name}`);
    checkbox.checked = !hasSavedTargetSelection || selectedTargetIds.includes(target.chatId);
    checkbox.addEventListener('change', () => {
      const selected = [...document.querySelectorAll('#telegram-targets [data-telegram-target]:checked')].map((item) => item.dataset.telegramTarget);
      localStorage.setItem('allpost-telegram-targets', JSON.stringify(selected));
    });
    const name = document.createElement('span'); name.className = 'facebook-group-name'; name.textContent = target.name;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'facebook-group-remove'; remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      const response = await fetch('/api/accounts/telegram', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: target.chatId }) });
      if (response.ok) { await syncAccounts(); renderTelegramTargets((await (await fetch('/api/accounts/telegram')).json()).targets); }
    });
    row.append(checkbox, name, remove); root.append(row);
  }
}

document.getElementById('webhook-save').addEventListener('click', async () => {
  const button = document.getElementById('webhook-save'); button.disabled = true;
  try {
    const response = await fetch('/api/accounts/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: document.getElementById('webhook-url').value.trim(), secret: document.getElementById('webhook-secret').value }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not configure webhook.');
    document.getElementById('webhook-secret').value = '';
    showToast('Signed webhook saved securely.'); await syncAccounts();
  } catch (error) { openModal('Webhook setup could not be saved.', error.message); }
  finally { button.disabled = false; }
});

function saveDraft(showConfirmation = false) {
  const draft = {
    id: activeDraftId,
    text: textarea.value,
    channels: rows.filter((row) => row.querySelector('input').checked).map((row) => row.dataset.channel),
    overrides: platformOverrides,
  };
  localStorage.setItem('allpost-draft', JSON.stringify(draft));
  draftState.textContent = 'Saved on this device';
  if (showConfirmation) showToast('Draft saved on this device.');
}

function refreshPreview() {
  const value = textarea.value;
  document.getElementById('preview-copy').textContent = value || 'Your next idea deserves to be seen.';
  document.getElementById('char-count').textContent = value.length;
  const [subtitle, name] = platformCopy[activePreview];
  document.getElementById('preview-subtitle').textContent = subtitle;
  document.querySelector('.preview-user strong').textContent = name;
  document.querySelector('.preview-engagement').style.display = activePreview === 'linkedin' ? 'none' : '';
  document.querySelector('.image-tag').textContent = activePreview === 'youtube' ? 'YOUTUBE' : activePreview === 'tiktok' ? 'TIKTOK' : 'ALL-POST';
  clearTimeout(saveTimer);
  draftState.textContent = 'Saving…';
  saveTimer = setTimeout(() => saveDraft(), 450);
}

textarea.addEventListener('input', refreshPreview);

rows.forEach((row) => {
  const checkbox = row.querySelector('input');
  row.addEventListener('click', (event) => {
    if (event.target === checkbox) return;
    event.preventDefault();
    if (event.target.closest('.channel-status')) {
      const name = row.querySelector('.channel-info strong').textContent;
      if (['telegram', 'webhook'].includes(row.dataset.channel)) {
        checkbox.checked = true;
        row.classList.add('selected');
        updateSelected();
        return;
      }
      if (row.dataset.connected !== 'true') {
        if (row.dataset.configured !== 'true') {
          const setupMessages = {
            linkedin: 'Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in Vercel, then enable Share on LinkedIn and OpenID Connect.',
            x: 'Add X_CLIENT_ID and X_CLIENT_SECRET in Vercel, enable OAuth 2.0 Web App access, and allow tweet.write plus offline.access.',
            instagram: 'Add META_APP_ID and META_APP_SECRET in Vercel. Instagram publishing requires a Professional account and approved Instagram Login permissions.',
            facebook: 'Add META_APP_ID and META_APP_SECRET in Vercel and enable Facebook Login. The app needs pages_show_list, pages_read_engagement, and pages_manage_posts to publish to a Page.',
            tiktok: 'Add the TikTok app credentials and callback in Vercel. Direct Post needs video.publish approval, a domain you own verified in TikTok, and an app audit for public posting.',
            youtube: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel, enable YouTube Data API v3, and request youtube.upload.',
          };
          openModal(`Finish ${name} setup.`, setupMessages[row.dataset.channel]);
          return;
        }
        window.location.href = `/api/oauth/${row.dataset.channel}/start`;
        return;
      }
      if (row.dataset.connected === 'true') {
        openModal(`${name} is connected.`, `Your ${name} account is connected to ALL-POST.`);
        return;
      }
      openModal(`${name} connection is not set up yet.`, 'Add the provider credentials to Vercel, redeploy, then connect the account here.');
      return;
    }
    checkbox.checked = !checkbox.checked;
    row.classList.toggle('selected', checkbox.checked);
    updateSelected();
    saveDraft();
  });
  checkbox.addEventListener('change', () => {
    row.classList.toggle('selected', checkbox.checked);
    updateSelected();
    saveDraft();
  });
});

document.getElementById('select-all').addEventListener('click', () => {
  const linkedin = rows.find((row) => row.dataset.channel === 'linkedin');
  const checkbox = linkedin.querySelector('input');
  checkbox.checked = !checkbox.checked;
  linkedin.classList.toggle('selected', checkbox.checked);
  updateSelected();
  saveDraft();
});

tabs.forEach((tab) => tab.addEventListener('click', () => {
  tabs.forEach((item) => item.classList.toggle('active', item === tab));
  activePreview = tab.dataset.preview;
  refreshPreview();
}));

document.getElementById('save-draft').addEventListener('click', async () => {
  const button = document.getElementById('save-draft'); button.disabled = true;
  try {
    const payload = { ...composePayload(), channels: selectedRows().map((row) => row.dataset.channel) };
    const response = await fetch('/api/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: activeDraftId, payload }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not save this draft.');
    activeDraftId = data.draft.id; savedDrafts = [data.draft, ...savedDrafts.filter((item) => item.id !== data.draft.id)];
    saveDraft(); draftState.textContent = 'Saved to workspace'; showToast('Draft saved to your workspace.');
  } catch (error) { openModal('Draft was saved on this device only.', error.message); }
  finally { button.disabled = false; }
});
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = document.getElementById('login-submit');
  submit.disabled = true;
  loginError.textContent = '';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: loginPassword.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not sign in.');
    loginPassword.value = '';
    enterWorkspace();
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.getElementById('publish-button').addEventListener('click', async () => {
  const count = selectedRows().filter((row) => !platformOverrides[row.dataset.channel]?.skip).length;
  if (!count) return showToast('Choose at least one channel first.');
  if (!textarea.value.trim()) return openModal('Start with a thought.', 'Write a few words and your preview will come to life.');
  const selected = selectedRows().map((row) => row.dataset.channel).filter((channel) => !platformOverrides[channel]?.skip);
  if (selected.some((channel) => ['instagram', 'tiktok', 'youtube'].includes(channel)) && !selectedMedia) {
    openModal('Add photo or video.', 'Instagram, TikTok, and YouTube need media. Facebook, LinkedIn, and X can publish with or without media.');
    return;
  }
  if (selected.includes('facebook') && selectedMedia && !['image/jpeg', 'video/mp4'].includes(selectedMedia.contentType)) {
    openModal('Choose Facebook-ready media.', 'Facebook Pages accept text, one JPEG photo, or one MP4 video.');
    return;
  }
  if (selected.includes('facebook') && document.getElementById('facebook-page').value === '' && (window.facebookPages || []).length > 1) {
    openModal('Choose a Facebook Page.', 'Select which connected Facebook Page should receive this post.');
    return;
  }
  if (selected.includes('instagram') && selectedMedia && !['image/jpeg', 'video/mp4', 'video/quicktime'].includes(selectedMedia.contentType)) {
    openModal('Choose Instagram-ready media.', 'Instagram accepts JPEG photos or MP4/MOV videos for Reels.');
    return;
  }
  if (selected.includes('youtube') && selectedMedia && !['video/mp4', 'video/quicktime', 'video/webm'].includes(selectedMedia.contentType)) {
    openModal('Choose a video for YouTube.', 'YouTube publishing needs an MP4, MOV, or WebM video.');
    return;
  }
  if (selected.includes('x') && [...textarea.value].length > 280) {
    openModal('Shorten the X post.', 'X posts are limited to 280 characters.');
    return;
  }
    const activeSelected = selected;
    if (!activeSelected.length) return openModal('Keep one platform enabled.', 'Every selected channel is set to Skip. Turn one back on before publishing.');
  if (activeSelected.includes('telegram') && !composePayload().telegramDestinationIds.length) return openModal('Choose Telegram destinations.', 'Select one or more Telegram channels or groups for this post.');
  const telegramButtonText = document.getElementById('telegram-button-text').value.trim();
  const telegramButtonUrl = document.getElementById('telegram-button-url').value.trim();
  if (activeSelected.includes('telegram') && Boolean(telegramButtonText) !== Boolean(telegramButtonUrl)) return openModal('Finish the Telegram link button.', 'Add both a button label and an HTTPS link, or leave both fields empty.');
    const notConnected = activeSelected.filter((channel) => rows.find((row) => row.dataset.channel === channel)?.dataset.connected !== 'true');
  if (notConnected.length) {
    openModal(`Connect ${notConnected.join(' and ')} first.`, 'Choose Connect on each selected channel and approve ALL-POST in the provider before publishing.');
    return;
  }
  if (selected.includes('tiktok') && !document.getElementById('tiktok-privacy').value) {
    openModal('Choose TikTok visibility.', 'TikTok requires one of the privacy options offered for the connected creator account.');
    return;
  }
  if (selected.includes('tiktok') && !document.getElementById('tiktok-consent').checked) {
    openModal('Confirm your TikTok post.', 'TikTok requires you to agree before ALL-POST sends your media and post details.');
    return;
  }
  if (selected.includes('youtube') && (!document.getElementById('youtube-title').value.trim() || !document.getElementById('youtube-privacy').value)) {
    openModal('Finish YouTube video details.', 'Add a title and choose whether the video should be private, unlisted, or public.');
    return;
  }
  const button = document.getElementById('publish-button');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const results = [];
    for (const channel of activeSelected) {
      try {
        const response = await fetch(`/api/publish/${channel}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: platformOverrides[channel]?.text?.trim() || textarea.value,
            mediaUrl: platformOverrides[channel]?.mediaMode === 'none' ? '' : platformOverrides[channel]?.mediaUrl || selectedMedia?.url,
            mediaType: platformOverrides[channel]?.mediaMode === 'none' ? '' : platformOverrides[channel]?.mediaType || selectedMedia?.contentType,
            telegramDestinationIds: composePayload().telegramDestinationIds,
            tiktokPrivacy: document.getElementById('tiktok-privacy').value,
            tiktokInteractions: {
              comments: document.getElementById('tiktok-comments').checked,
              duet: document.getElementById('tiktok-duet').checked,
              stitch: document.getElementById('tiktok-stitch').checked,
            },
            tiktokBrand: {
              branded: document.getElementById('tiktok-branded').checked,
              ownBrand: document.getElementById('tiktok-own-brand').checked,
            },
            youtubeTitle: document.getElementById('youtube-title').value.trim(),
            youtubePrivacy: document.getElementById('youtube-privacy').value,
            facebookPageId: document.getElementById('facebook-page').value,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Publishing failed.');
        if (channel === 'tiktok' && result.postId) {
          let status = result.status;
          for (let attempt = 0; attempt < 12 && !['PUBLISH_COMPLETE', 'FAILED'].includes(status); attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 2500));
            const statusResponse = await fetch(`/api/publish/tiktok/status?id=${encodeURIComponent(result.postId)}`, { cache: 'no-store' });
            if (!statusResponse.ok) break;
            status = (await statusResponse.json()).status || status;
          }
          if (status === 'FAILED') throw new Error('TikTok could not publish the media. Check the creator account and upload format.');
          result.status = status;
          result.processing = status !== 'PUBLISH_COMPLETE';
        }
        results.push({ channel, success: true, processing: Boolean(result.processing), url: result.url });
      } catch (error) {
        results.push({ channel, success: false, error: error.message });
      }
    }
    const posted = results.filter((result) => result.success).map((result) => result.channel);
    const failed = results.filter((result) => !result.success);
    if (failed.length) {
      const details = failed.map((result) => `${result.channel}: ${result.error}`).join(' · ');
      openModal(posted.length ? `Posted to ${posted.join(' and ')}.` : 'Could not publish.', details);
    } else {
      const pending = results.filter((result) => result.processing).map((result) => result.channel);
      const videoUrl = results.find((result) => result.url)?.url;
      if (videoUrl) openModal(`Uploaded to ${posted.join(' and ')}.`, `YouTube is processing the video: ${videoUrl}`);
      else if (pending.length) openModal(`Sent to ${posted.join(' and ')}.`, `${pending.join(' and ')} is still processing the media. Check the account before retrying.`);
      else openModal(`Posted to ${posted.join(' and ')}.`, 'Your post was published.');
    }
    await loadQueue();
  } catch (error) {
    openModal('Could not publish.', error.message);
  } finally {
    document.getElementById('tiktok-consent').checked = false;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
});
document.getElementById('schedule-button').addEventListener('click', () => {
  if (!composePayload().channels.length) return showToast('Choose at least one active channel first.');
  if (!textarea.value.trim()) return openModal('Start with a thought.', 'Write a few words before scheduling your post.');
  openScheduleModal();
});

function closeModal() {
  modal.classList.remove('open');
}
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-action').addEventListener('click', async () => {
  if (!scheduleMode) return closeModal();
  const scheduledAt = document.getElementById('schedule-at').value;
  if (!scheduledAt) return showToast('Choose a date and time.');
  const action = document.getElementById('modal-action');
  action.disabled = true;
  action.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...composePayload(), scheduledAt: fromZonedDateTimeValue(scheduledAt).toISOString() }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not schedule this post.');
    closeModal();
    showToast('Post added to your scheduled queue.');
    await loadQueue();
  } catch (error) {
    document.getElementById('modal-title').textContent = 'Could not schedule this post.';
    document.getElementById('modal-body').textContent = error.message;
    scheduleMode = false;
    document.getElementById('schedule-controls').hidden = true;
    action.innerHTML = 'Got it <span>→</span>';
  } finally {
    action.disabled = false;
    action.removeAttribute('aria-busy');
  }
});
modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeModal();
    emojiPicker.hidden = true;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    textarea.focus();
  }
});

document.getElementById('image-button').addEventListener('click', () => document.getElementById('image-input').click());
document.getElementById('image-input').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'].includes(file.type)) return showToast('Choose a JPG, PNG, WebP, MP4, MOV, or WebM file.');
  if (file.size > 250 * 1024 * 1024) return showToast('Choose media smaller than 250 MB.');
  const status = document.getElementById('media-upload-status');
  const message = document.getElementById('media-upload-message');
  status.hidden = false;
  if (!mediaStorageConfigured) {
    message.textContent = 'Public media storage is not connected to Vercel yet.';
    return;
  }
  message.textContent = `Uploading ${file.name}…`;
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const blob = await upload(`all-post/media/${Date.now()}-${safeName}`, file, {
      access: 'public',
      handleUploadUrl: '/api/media/upload',
    });
    const mediaUrl = new URL('/api/media/public', window.location.origin);
    mediaUrl.searchParams.set('url', blob.url);
    selectedMedia = { url: mediaUrl.toString(), blobUrl: blob.url, contentType: file.type, name: file.name };
    message.textContent = `${file.name} uploaded. Anyone with its public link can access it until you remove it.`;
    const preview = document.getElementById('preview-image');
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        preview.style.backgroundImage = `linear-gradient(0deg,rgba(20,35,26,.28),rgba(20,35,26,.05)),url("${reader.result}")`;
        preview.classList.add('has-upload');
      };
      reader.readAsDataURL(file);
    } else {
      preview.style.backgroundImage = 'linear-gradient(145deg,#2a3540,#101820)';
      preview.querySelector('.image-label').textContent = 'VIDEO READY';
      preview.querySelector('.image-caption').textContent = file.name;
      preview.classList.add('has-upload');
    }
  } catch (error) {
    status.hidden = false;
    message.textContent = error.message || 'Media upload failed.';
    showToast('Could not upload media. Check the media-storage setup.');
  }
});
document.getElementById('remove-media').addEventListener('click', async () => {
  if (selectedMedia?.blobUrl) {
    await fetch('/api/media/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: selectedMedia.blobUrl }),
    }).catch(() => {});
  }
  selectedMedia = null;
  document.getElementById('image-input').value = '';
  document.getElementById('media-upload-status').hidden = true;
  const preview = document.getElementById('preview-image');
  preview.style.backgroundImage = '';
  preview.classList.remove('has-upload');
  preview.querySelector('.image-label').innerHTML = 'YOUR NEXT<br />GOOD IDEA <span>↗</span>';
  preview.querySelector('.image-caption').innerHTML = 'Make it<br /><em>happen.</em>';
});

document.getElementById('emoji-button').addEventListener('click', (event) => {
  event.stopPropagation();
  emojiPicker.hidden = !emojiPicker.hidden;
});
emojiPicker.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.setRangeText(button.textContent, start, end, 'end');
  textarea.focus();
  textarea.dispatchEvent(new Event('input'));
  emojiPicker.hidden = true;
});
document.addEventListener('click', (event) => {
  if (!emojiPicker.contains(event.target) && event.target.id !== 'emoji-button') emojiPicker.hidden = true;
});

document.getElementById('link-button').addEventListener('click', () => {
  const link = prompt('Paste a link to add to your post:');
  if (!link) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.setRangeText(link, start, end, 'end');
  textarea.focus();
  textarea.dispatchEvent(new Event('input'));
});

document.querySelector('.hashtag-tool').addEventListener('click', () => {
  const start = textarea.selectionStart;
  textarea.setRangeText(start > 0 && !/\s$/.test(textarea.value.slice(0, start)) ? ' #' : '#', start, textarea.selectionEnd, 'end');
  textarea.focus();
  textarea.dispatchEvent(new Event('input'));
});

document.querySelector('.tiny-plus').addEventListener('click', () => {
  openModal('More channels are on the roadmap.', 'ALL-POST is starting with Instagram, LinkedIn, X, YouTube, and TikTok.');
});
document.querySelectorAll('.main-nav .nav-item').forEach((item) => item.addEventListener('click', (event) => {
  event.preventDefault();
  const page = ({ '#compose': 'compose', '#calendar': 'calendar', '#analytics': 'analytics', '#queue-view': 'queue', '#drafts': 'drafts' })[item.getAttribute('href')];
  if (page) setWorkspacePage(page);
}));
document.getElementById('calendar-compose').addEventListener('click', () => {
  setWorkspacePage('compose');
  if (!selectedCalendarDate) return;
  openScheduleModal();
  const date = new Date(selectedCalendarDate.getFullYear(), selectedCalendarDate.getMonth(), selectedCalendarDate.getDate(), 9, 0, 0);
  if (date.getTime() < Date.now() + 2 * 60_000) date.setTime(Date.now() + 20 * 60_000);
  document.getElementById('schedule-at').value = toZonedDateTimeValue(date);
});
for (const id of ['queue-compose', 'draft-compose']) document.getElementById(id).addEventListener('click', () => {
  if (id === 'draft-compose') { activeDraftId = null; textarea.value = ''; selectedMedia = null; document.getElementById('media-upload-status').hidden = true; document.getElementById('youtube-title').value = ''; document.getElementById('youtube-privacy').value = ''; document.getElementById('tiktok-privacy').value = ''; document.getElementById('tiktok-consent').checked = false; Object.keys(platformOverrides).forEach((key) => delete platformOverrides[key]); rows.forEach((row) => { const checked = row.dataset.channel === 'linkedin'; row.querySelector('input').checked = checked; row.classList.toggle('selected', checked); }); updateSelected(); refreshPreview(); saveDraft(); }
  setWorkspacePage('compose'); textarea.focus();
});
document.getElementById('calendar-prev').addEventListener('click', () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); renderCalendar(); });
document.getElementById('calendar-next').addEventListener('click', () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); renderCalendar(); });
document.getElementById('calendar-today').addEventListener('click', () => { calendarCursor = new Date(); renderCalendar(); });
document.getElementById('full-queue-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-cancel-queue-id]'); if (!button) return;
  button.disabled = true;
  try { const response = await fetch('/api/queue', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: button.dataset.cancelQueueId }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not cancel post.'); await loadQueue(); showToast('Scheduled post cancelled.'); }
  catch (error) { showToast(error.message); button.disabled = false; }
});

const storedDraft = localStorage.getItem('allpost-draft');
let saved = null;
if (storedDraft) {
  try {
    saved = JSON.parse(storedDraft);
  } catch {
    saved = { text: storedDraft };
  }
}
if (saved) {
  activeDraftId = typeof saved === 'object' ? saved.id || null : null;
  textarea.value = typeof saved === 'string' ? saved : saved.text || '';
  if (saved.overrides && typeof saved.overrides === 'object') Object.assign(platformOverrides, saved.overrides);
  if (saved.channels) rows.forEach((row) => {
    const checked = row.dataset.live === 'true' && saved.channels.includes(row.dataset.channel);
    row.querySelector('input').checked = checked;
    row.classList.toggle('selected', checked);
  });
}
updateSelected();
refreshPreview();
async function syncAccounts() {
  try {
    const response = await fetch('/api/accounts', { cache: 'no-store' });
    if (!response.ok) return;
    const accounts = await response.json();
    renderTelegramTargets(accounts.telegram?.targets || []);
    mediaStorageConfigured = Boolean(accounts.publicMediaConfigured);
    window.facebookPages = accounts.facebook?.pages || [];
    const pageSelect = document.getElementById('facebook-page');
    pageSelect.replaceChildren(new Option('Choose a Facebook Page', ''));
    for (const page of window.facebookPages) pageSelect.add(new Option(page.name, page.id));
    if (window.facebookPages.length === 1) pageSelect.value = window.facebookPages[0].id;
    const statusFields = {
      linkedin: ['linkedin', 'linkedinConfigured'],
      x: ['x', 'xConfigured'],
      instagram: ['instagram', 'instagramConfigured'],
      facebook: ['facebook', 'facebookConfigured'],
      tiktok: ['tiktok', 'tiktokConfigured'],
      youtube: ['youtube', 'youtubeConfigured'],
      telegram: ['telegram', 'telegramConfigured'],
      webhook: ['webhook', 'webhookConfigured'],
    };
    for (const [channel, [accountKey, configuredKey]] of Object.entries(statusFields)) {
      const row = rows.find((item) => item.dataset.channel === channel);
      const account = accounts[accountKey];
      const status = row.querySelector('.channel-status');
      row.dataset.connected = String(Boolean(account?.connected));
      row.dataset.configured = String(Boolean(accounts[configuredKey]));
      const label = account?.connected
        ? `Connected · ${account.username ? `@${account.username}` : account.name}`
        : accounts[configuredKey] ? 'Connect' : 'Setup needed';
      status.textContent = label;
      status.setAttribute('aria-label', account?.connected ? `${channel} connected` : accounts[configuredKey] ? `Connect ${channel}` : `Set up ${channel}`);
      const sidebarStatus = document.querySelector(`.account-item[data-provider="${channel}"] .account-state`);
      sidebarStatus.textContent = account?.connected ? 'connected' : accounts[configuredKey] ? 'connect' : 'setup';
      sidebarStatus.classList.toggle('is-connected', Boolean(account?.connected));
    }
    if (accounts.tiktok?.connected && accounts.tiktokPublishingEnabled) {
      const creatorResponse = await fetch('/api/accounts/tiktok/creator-info', { cache: 'no-store' });
      if (creatorResponse.ok) {
        const creator = await creatorResponse.json();
        const privacy = document.getElementById('tiktok-privacy');
        privacy.replaceChildren(new Option('Choose a TikTok privacy level', ''));
        for (const option of creator.privacyOptions || []) privacy.add(new Option(option.replaceAll('_', ' ').toLowerCase(), option));
        for (const [id, disabled] of [
          ['tiktok-comments', creator.commentDisabled], ['tiktok-duet', creator.duetDisabled], ['tiktok-stitch', creator.stitchDisabled],
        ]) {
          const control = document.getElementById(id);
          control.disabled = Boolean(disabled);
          if (disabled) control.checked = false;
        }
      }
    }
    updateMediaOptions();
    await loadQueue();
  } catch {
    // The browser-only prototype still works when the local API server is not running.
  }
}

function enterWorkspace() {
  document.body.classList.remove('auth-required', 'auth-pending');
  document.body.classList.add('authenticated');
  loginGate.hidden = true;
  document.getElementById('logout-button').hidden = false;
  syncAccounts();
}

document.getElementById('logout-button').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  window.location.reload();
});

async function initializeAppAccess() {
  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    if (response.status === 404) {
      // The local demo server predates the protected Vercel API routes.
      enterWorkspace();
      return;
    }
    const session = await response.json();
    if (session.authenticated) {
      enterWorkspace();
      return;
    }
    loginGate.hidden = false;
    document.body.classList.remove('auth-pending');
    document.body.classList.add('auth-required');
    if (!session.configured) {
      loginMessage.textContent = 'The private workspace is locked until its Vercel access settings are configured.';
      loginForm.querySelectorAll('label, input, button').forEach((element) => { element.hidden = true; });
      loginError.textContent = 'Set APP_PASSWORD and APP_SESSION_SECRET in the Vercel production environment, then redeploy.';
    } else {
      loginPassword.focus();
    }
  } catch {
    loginGate.hidden = false;
    document.body.classList.remove('auth-pending');
    document.body.classList.add('auth-required');
    loginMessage.textContent = 'Could not verify the private workspace. Refresh the page or check the app setup.';
    loginForm.querySelectorAll('label, input, button').forEach((element) => { element.hidden = true; });
  }
}

initializeAppAccess();
const connectionResult = new URLSearchParams(window.location.search).get('connection');
if (['linkedin', 'x', 'instagram', 'facebook', 'tiktok', 'youtube'].includes(connectionResult)) {
  const displayName = connectionResult === 'x' ? 'X' : connectionResult[0].toUpperCase() + connectionResult.slice(1);
  showToast(`${displayName} connected.`);
}
if (connectionResult) window.history.replaceState({}, '', window.location.pathname + window.location.hash);
document.getElementById('language-picker').addEventListener('change', (event) => {
  interfaceLanguage = event.target.value === 'am' ? 'am' : 'en';
  localStorage.setItem('allpost-language', interfaceLanguage);
  applyLanguage();
});
applyLanguage();

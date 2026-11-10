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

const platformCopy = {
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
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  modal.classList.add('open');
  document.getElementById('modal-action').focus();
}

function selectedRows() {
  return rows.filter((row) => row.querySelector('input').checked);
}

function updateSelected() {
  const linkedin = rows.find((row) => row.dataset.channel === 'linkedin');
  document.getElementById('select-all').textContent = linkedin.querySelector('input').checked ? 'Deselect LinkedIn' : 'Select LinkedIn';
  const names = selectedRows().map((row) => row.querySelector('.channel-info strong').textContent);
  document.getElementById('publish-label').textContent = names.length ? `Post to ${names.join(' + ')}` : 'Choose a channel';
  updateMediaOptions();
}

function updateMediaOptions() {
  const selected = selectedRows().map((row) => row.dataset.channel);
  document.getElementById('media-options').hidden = !selected.some((channel) => ['instagram', 'tiktok', 'youtube'].includes(channel)) && !selectedMedia;
  document.getElementById('media-storage-note').hidden = mediaStorageConfigured || selectedMedia !== null;
  document.getElementById('tiktok-privacy-group').hidden = !selected.includes('tiktok');
  document.getElementById('youtube-options').hidden = !selected.includes('youtube');
}

function saveDraft(showConfirmation = false) {
  const draft = {
    text: textarea.value,
    channels: rows.filter((row) => row.querySelector('input').checked).map((row) => row.dataset.channel),
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
      if (row.dataset.connected !== 'true') {
        if (row.dataset.configured !== 'true') {
          const setupMessages = {
            linkedin: 'Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in Vercel, then enable Share on LinkedIn and OpenID Connect.',
            x: 'Add X_CLIENT_ID and X_CLIENT_SECRET in Vercel, enable OAuth 2.0 Web App access, and allow tweet.write plus offline.access.',
            instagram: 'Add META_APP_ID and META_APP_SECRET in Vercel. Instagram publishing requires a Professional account and approved Instagram Login permissions.',
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

document.getElementById('save-draft').addEventListener('click', () => saveDraft(true));
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
  const count = selectedRows().length;
  if (!count) return showToast('Choose at least one channel first.');
  if (!textarea.value.trim()) return openModal('Start with a thought.', 'Write a few words and your preview will come to life.');
  const selected = selectedRows().map((row) => row.dataset.channel);
  if (selected.some((channel) => ['instagram', 'tiktok', 'youtube'].includes(channel)) && !selectedMedia) {
    openModal('Add photo or video.', 'Instagram, TikTok, and YouTube need an uploaded media file.');
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
  const notConnected = selected.filter((channel) => rows.find((row) => row.dataset.channel === channel)?.dataset.connected !== 'true');
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
    for (const channel of selected) {
      try {
        const response = await fetch(`/api/publish/${channel}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: textarea.value,
            mediaUrl: selectedMedia?.url,
            mediaType: selectedMedia?.contentType,
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
  } catch (error) {
    openModal('Could not publish.', error.message);
  } finally {
    document.getElementById('tiktok-consent').checked = false;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
});
document.getElementById('schedule-button').addEventListener('click', () => {
  openModal('Scheduling comes next.', 'Your draft is saved on this device. Connect social accounts and add a server before scheduling live posts.');
});

function closeModal() {
  modal.classList.remove('open');
}
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-action').addEventListener('click', closeModal);
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
document.querySelectorAll('.nav-item:not(.active):not([href="#queue"])').forEach((item) => item.addEventListener('click', (event) => {
  event.preventDefault();
  showToast(`${item.textContent.trim()} is coming soon.`);
}));

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
  textarea.value = typeof saved === 'string' ? saved : saved.text || '';
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
    mediaStorageConfigured = Boolean(accounts.publicMediaConfigured);
    const statusFields = {
      linkedin: ['linkedin', 'linkedinConfigured'],
      x: ['x', 'xConfigured'],
      instagram: ['instagram', 'instagramConfigured'],
      tiktok: ['tiktok', 'tiktokConfigured'],
      youtube: ['youtube', 'youtubeConfigured'],
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
if (['linkedin', 'x', 'instagram', 'tiktok', 'youtube'].includes(connectionResult)) {
  const displayName = connectionResult === 'x' ? 'X' : connectionResult[0].toUpperCase() + connectionResult.slice(1);
  showToast(`${displayName} connected.`);
}
if (connectionResult) window.history.replaceState({}, '', window.location.pathname + window.location.hash);
document.querySelector('.today-label').textContent = new Intl.DateTimeFormat('en', {
  weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Africa/Addis_Ababa',
}).format(new Date());

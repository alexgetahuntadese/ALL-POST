const textarea = document.getElementById('post-text');
const rows = [...document.querySelectorAll('.channel-row')];
const tabs = [...document.querySelectorAll('.preview-tab')];
const toast = document.getElementById('toast');
const modal = document.getElementById('modal');
const emojiPicker = document.getElementById('emoji-picker');
const draftState = document.getElementById('draft-state');
let activePreview = 'instagram';
let toastTimer;
let saveTimer;

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
  const count = selectedRows().length;
  document.getElementById('selected-count').textContent = count;
  document.getElementById('select-all').textContent = count === rows.length ? 'Deselect all' : 'Select all';
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
      openModal(`${name} connection is not set up yet.`, 'Secure account sign-in and publishing are not active in this prototype. Your post stays saved on this device.');
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
  const select = selectedRows().length !== rows.length;
  rows.forEach((row) => {
    row.querySelector('input').checked = select;
    row.classList.toggle('selected', select);
  });
  updateSelected();
  saveDraft();
});

tabs.forEach((tab) => tab.addEventListener('click', () => {
  tabs.forEach((item) => item.classList.toggle('active', item === tab));
  activePreview = tab.dataset.preview;
  refreshPreview();
}));

document.getElementById('save-draft').addEventListener('click', () => saveDraft(true));
document.getElementById('publish-button').addEventListener('click', () => {
  const count = selectedRows().length;
  if (!count) return showToast('Choose at least one channel first.');
  if (!textarea.value.trim()) return openModal('Start with a thought.', 'Write a few words and your preview will come to life.');
  openModal('Your post is ready to review.', `You selected ${count} channel${count === 1 ? '' : 's'}. Connect social accounts to publish from ALL-POST.`);
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
document.getElementById('image-input').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return showToast('Choose an image file.');
  if (file.size > 5 * 1024 * 1024) return showToast('Choose an image smaller than 5 MB.');
  const reader = new FileReader();
  reader.onload = () => {
    const preview = document.getElementById('preview-image');
    preview.style.backgroundImage = `linear-gradient(0deg,rgba(20,35,26,.28),rgba(20,35,26,.05)),url("${reader.result}")`;
    preview.classList.add('has-upload');
    showToast('Image preview added.');
  };
  reader.readAsDataURL(file);
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
    const checked = saved.channels.includes(row.dataset.channel);
    row.querySelector('input').checked = checked;
    row.classList.toggle('selected', checked);
  });
}
updateSelected();
refreshPreview();
document.querySelector('.today-label').textContent = new Intl.DateTimeFormat('en', {
  weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Africa/Addis_Ababa',
}).format(new Date());

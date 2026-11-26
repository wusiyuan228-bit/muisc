import { activeLineAt, lineEnd, formatTime, annotatedCharacters } from './shared/lyrics.js';

const $ = selector => document.querySelector(selector);
const audio = $('#audio');
const staticMode = document.querySelector('meta[name="ting-mode"]')?.content === 'static';
let staticLibrary;
const icons = {
  play: '<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  library: '<rect x="4" y="4" width="5" height="16" rx="1"/><path d="M13 4v16M17 5l4 14"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  sliders: '<path d="M4 7h6m4 0h6M4 17h10m4 0h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  share: '<path d="M12 15V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  heart: '<path d="M20.8 5.7a5.5 5.5 0 0 0-8 .1L12 6.6l-.8-.8a5.5 5.5 0 0 0-8 .1c-2.1 2.5-1.5 5.4.6 7.5L12 21l8.2-7.6c2.1-2.1 2.7-5 .6-7.7Z" transform="translate(2 1) scale(.83)"/>',
  languages: '<path d="M3 5h11M8 3v2M5 5c0 5 3 8 7 10M12 5c0 5-3 8-8 10M14 21l4-11 4 11m-6.5-4h5"/>',
  repeat: '<path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3"/>',
  headphones: '<path d="M4 15v-4a8 8 0 0 1 16 0v4"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>',
  follow: '<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/><circle cx="12" cy="12" r="3"/>',
  pointer: '<path d="m5 3 3 17 4-6 6-3Z"/>',
  previous: '<path d="M5 5v14"/><path d="m19 5-10 7 10 7Z" fill="currentColor" stroke="none"/>',
  next: '<path d="M19 5v14"/><path d="m5 5 10 7-10 7Z" fill="currentColor" stroke="none"/>',
  restart: '<path d="M4 4v6h6M4.5 10a8 8 0 1 1-.3 5"/>',
  speed: '<path d="M4.5 18a9 9 0 1 1 15 0M12 13l4-5"/><circle cx="12" cy="13" r="1.5"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-6 5H2v6h3l6 5ZM16 9l6 6m0-6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  music: '<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>',
  lyrics: '<path d="M14 2H5v20h14V7Zm0 0v5h5M8 11h8M8 15h8M8 19h5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.music}</svg>`;
function paintIcons(root = document) { root.querySelectorAll('i[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
function setIcon(button, name) { const el = button.querySelector('i'); el.dataset.icon = name; el.innerHTML = icon(name); }
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function saved(key, fallback) { try { return JSON.parse(localStorage.getItem(`ting:${key}`)) ?? fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(`ting:${key}`, JSON.stringify(value)); } catch { /* Storage may be disabled in private browsing. */ } }
const savedFavorites = saved('favorites', []);
const state = {
  songs: [], current: null, active: -1, loop: -1, follow: true, loading: false,
  pinyin: saved('pinyin', true) !== false, meaning: saved('meaning', false) === true,
  favorites: new Set(Array.isArray(savedFavorites) ? savedFavorites : []),
  request: 0, editor: null, animation: 0, toastTimer: null,
};

function toast(message) {
  clearTimeout(state.toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  state.toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}
async function api(endpoint, options = {}) {
  if (staticMode) {
    if (options.method && options.method !== 'GET') throw new Error('Bản công khai chỉ hỗ trợ nghe nhạc.');
    if (endpoint === '/api/session') return { authenticated: false };
    if (endpoint !== '/api/songs' && !endpoint.startsWith('/api/songs/')) throw new Error('Chức năng này không khả dụng trên trang tĩnh.');
    if (!staticLibrary) {
      const response = await fetch(new URL('./songs.json', import.meta.url), { cache: 'no-cache' });
      if (!response.ok) throw new Error('Không thể tải danh sách bài hát.');
      const songs = await response.json();
      if (!Array.isArray(songs)) throw new Error('Danh sách bài hát không hợp lệ.');
      staticLibrary = songs;
    }
    if (endpoint === '/api/songs') return staticLibrary;
    const id = decodeURIComponent(endpoint.slice('/api/songs/'.length));
    const song = staticLibrary.find(item => item.id === id);
    if (!song) throw new Error('Không tìm thấy bài hát.');
    return song;
  }
  const response = await fetch(endpoint, { ...options, headers: { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && endpoint !== '/api/login') {
      $('#admin-content').hidden = true;
      $('#admin-login').hidden = false;
    }
    throw new Error(result.error || `Yêu cầu không thành công (${response.status}). Vui lòng thử lại.`);
  }
  return result;
}

function renderSongList() {
  const query = $('#search').value.trim().toLowerCase();
  $('#song-count').textContent = state.songs.length;
  const filtered = state.songs.filter(song => `${song.title} ${song.artist}`.toLowerCase().includes(query));
  $('#song-list').innerHTML = filtered.length ? filtered.map(song => `<button class="song-item ${state.current?.id === song.id ? 'active' : ''}" data-song="${escapeHtml(song.id)}" aria-label="Nghe ${escapeHtml(song.title)}" ${state.current?.id === song.id ? 'aria-current="true"' : ''}><span class="song-item-text"><strong lang="zh-CN">${escapeHtml(song.title)}</strong><small>${escapeHtml(song.artist)}</small></span><i data-icon="${state.current?.id === song.id ? 'music' : 'play'}"></i></button>`).join('') : '<p class="small muted">Không tìm thấy bài hát.</p>';
  paintIcons($('#song-list'));
}
function renderLyrics() {
  $('#lyrics-lines').innerHTML = state.current?.lyrics.length ? state.current.lyrics.map((line, index) => {
    const words = annotatedCharacters(line.text, line.reading).map(({ char, pinyin }) => pinyin ? `<ruby>${escapeHtml(char)}<rt lang="zh-Latn">${escapeHtml(pinyin)}</rt></ruby>` : `<span class="punctuation">${escapeHtml(char)}</span>`).join('');
    return `<button class="lyric-line" type="button" data-line="${index}" aria-label="${escapeHtml(line.text || 'Nhạc dạo')} · ${formatTime(line.time)}"><span class="line-chinese" lang="zh-CN">${words || '<span class="instrumental" lang="vi">Nhạc dạo</span>'}</span>${line.translation ? `<span class="lyric-meaning" lang="vi">${escapeHtml(line.translation)}</span>` : ''}</button>`;
  }).join('') : '<div class="empty-state">Chưa có bài hát.<br>Thêm nhạc trong phần quản lý để bắt đầu.</div>';
  applyLyricOptions();
  state.active = -2;
  syncPlayback(true);
}
function applyLyricOptions() {
  $('#lyrics-lines').classList.toggle('hide-pinyin', !state.pinyin);
  $('#lyrics-lines').classList.toggle('hide-meaning', !state.meaning);
  for (const [name, enabled] of [['pinyin', state.pinyin], ['meaning', state.meaning]]) {
    const button = $(`#${name}-toggle`);
    button.classList.toggle('active', enabled);
    button.setAttribute('aria-pressed', String(enabled));
  }
}
function centerLine(smooth = true) {
  const line = $(`.lyric-line[data-line="${state.active}"]`);
  const scroller = $('#lyrics-scroll');
  if (!line) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  scroller.scrollTo({ top: Math.max(0, line.offsetTop - scroller.clientHeight / 2 + line.clientHeight / 2), behavior: smooth && !reducedMotion ? 'smooth' : 'instant' });
}
function setFollow(follow) {
  state.follow = follow;
  $('#follow-button').classList.toggle('active', follow);
  $('#follow-button').setAttribute('aria-pressed', String(follow));
  $('#recenter-button').hidden = follow;
  if (follow) centerLine();
}
function syncPlayback(force = false) {
  const duration = Number.isFinite(audio.duration) ? audio.duration : state.current?.duration || 0;
  const time = audio.currentTime || 0;
  $('#current-time').textContent = formatTime(time);
  $('#duration').textContent = formatTime(duration);
  $('#seek').disabled = !state.current || !(Number.isFinite(audio.duration) && audio.duration > 0);
  const percent = duration ? Math.min(1, time / duration) : 0;
  $('#seek').value = Math.round(percent * 1000);
  $('#seek').style.setProperty('--progress', `${percent * 100}%`);
  $('#seek').setAttribute('aria-valuetext', `${formatTime(time)} trên ${formatTime(duration)}`);
  if (!state.current) { $('#line-position').textContent = '00 / 00'; return; }
  const current = activeLineAt(state.current.lyrics, time);
  if (state.active !== current || force) {
    $('.lyric-line.active')?.classList.remove('active');
    document.querySelector('.lyric-line[aria-current]')?.removeAttribute('aria-current');
    state.active = current;
    const line = $(`.lyric-line[data-line="${current}"]`);
    line?.classList.add('active');
    line?.setAttribute('aria-current', 'true');
    $('#line-position').textContent = `${String(current + 1).padStart(2, '0')} / ${String(state.current.lyrics.length).padStart(2, '0')}`;
    if (state.follow) centerLine(!force);
  }
}
function loopTick() {
  if (state.loop >= 0 && state.current && !audio.seeking && Number.isFinite(audio.duration)) {
    const line = state.current.lyrics[state.loop];
    const end = Math.min(audio.duration, lineEnd(state.current.lyrics, state.loop, audio.duration));
    if (line && end > line.time && audio.currentTime >= end - 0.025) audio.currentTime = line.time;
  }
}
function animate() {
  if (audio.paused) return;
  loopTick();
  state.animation = requestAnimationFrame(animate);
}
function refreshPlayButtons() {
  const playing = !audio.paused;
  const button = $('#play-button');
  setIcon(button, playing ? 'pause' : 'play');
  button.setAttribute('aria-label', playing ? 'Tạm dừng' : 'Phát nhạc');
  button.disabled = state.loading || !state.current;
}
async function play() {
  if (!state.current || state.loading) return;
  try { await audio.play(); }
  catch (error) { if (error.name !== 'AbortError') toast('Không thể phát nhạc. Hãy thử lại hoặc kiểm tra tệp âm thanh.'); }
}
function togglePlay() {
  if (audio.paused) {
    if (audio.ended) audio.currentTime = state.loop >= 0 ? state.current.lyrics[state.loop].time : 0;
    void play();
  } else audio.pause();
}
function setLoop(enabled) {
  if (!state.current) return;
  if (enabled) {
    const candidate = Math.max(0, state.active);
    const index = state.current.lyrics[candidate]?.text ? candidate : state.current.lyrics.findIndex(line => line.text && line.time >= audio.currentTime);
    if (index < 0) { toast('Hãy chọn một câu hát trước.'); return; }
    const start = state.current.lyrics[index].time;
    if (Number.isFinite(audio.duration) && start >= audio.duration) { toast('Thời gian của câu hát vượt quá độ dài bài nhạc.'); return; }
    state.loop = index;
    audio.currentTime = start;
    syncPlayback();
  } else state.loop = -1;
  $('#loop-button').setAttribute('aria-pressed', String(state.loop >= 0));
  $('#repeat-badge').hidden = state.loop < 0;
}
function seekTo(time) {
  if (!state.current) return;
  const maximum = Number.isFinite(audio.duration) ? audio.duration : Infinity;
  audio.currentTime = Math.max(0, Math.min(maximum, time));
  if (state.loop >= 0) state.loop = Math.max(0, activeLineAt(state.current.lyrics, audio.currentTime));
  syncPlayback();
}
function selectLine(index, shouldPlay = true) {
  const line = state.current?.lyrics[index];
  if (!line) return;
  if (Number.isFinite(audio.duration) && line.time >= audio.duration) { toast('Thời gian của câu hát không khớp với bài nhạc. Hãy kiểm tra tệp LRC.'); return; }
  seekTo(line.time);
  setFollow(true);
  if (shouldPlay) void play();
}
function updateFavorite() { $('#favorite-button').setAttribute('aria-pressed', String(state.favorites.has(state.current?.id))); }
async function selectSong(id, autoplay = false) {
  const request = ++state.request;
  state.loading = true;
  audio.pause();
  refreshPlayButtons();
  try {
    const song = await api(`/api/songs/${encodeURIComponent(id)}`);
    if (request !== state.request) return;
    state.current = song;
    state.loading = false;
    state.loop = -1;
    setLoop(false);
    state.follow = true;
    audio.src = song.audio;
    audio.load();
    audio.playbackRate = Number($('#speed').value);
    audio.preservesPitch = true;
    $('#song-title').textContent = song.title;
    $('#song-artist').textContent = song.artist;
    document.title = `${song.title} — 听见 TING`;
    $('#page-error').hidden = true;
    const url = new URL(location.href);
    url.searchParams.set('song', song.id);
    history.replaceState(null, '', url);
    renderSongList();
    renderLyrics();
    setFollow(true);
    updateFavorite();
    refreshPlayButtons();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: song.title, artist: song.artist, album: '听见 TING', artwork: [{ src: new URL('./cover.svg', import.meta.url).href, sizes: '700x700', type: 'image/svg+xml' }] });
    }
    if (autoplay) await play();
  } catch (error) {
    if (request !== state.request) return;
    state.loading = false;
    refreshPlayButtons();
    $('#page-error').hidden = false;
    $('#page-error').textContent = 'Không thể tải bài hát. Hãy kiểm tra kết nối và thử lại.';
  }
}
async function refreshLibrary(preferredId) {
  state.songs = await api('/api/songs');
  renderSongList();
  const id = preferredId || state.current?.id || new URL(location.href).searchParams.get('song');
  const next = state.songs.find(song => song.id === id) || state.songs[0];
  if (next && (next.id !== state.current?.id || preferredId)) await selectSong(next.id);
  if (!next) {
    ++state.request;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    state.current = null;
    state.loading = false;
    state.loop = -1;
    $('#song-title').textContent = 'Chưa có bài hát';
    $('#song-artist').textContent = 'Thêm nhạc để bắt đầu';
    $('#loop-button').setAttribute('aria-pressed', 'false');
    $('#repeat-badge').hidden = true;
    renderLyrics();
    refreshPlayButtons();
  }
}

function adminMessage(message, success = false) {
  $('#admin-message').textContent = message;
  $('#admin-message').classList.toggle('success', success);
}
function renderAdminList() {
  $('#admin-song-list').innerHTML = state.songs.map(song => `<div class="admin-song-row"><div><strong>${escapeHtml(song.title)}</strong><small>${escapeHtml(song.artist)} · ${song.lineCount} 行${song.demo ? ' · 示例歌曲' : ''}</small></div><div><button class="text-button" data-edit="${escapeHtml(song.id)}">校正拼音</button>${!song.demo ? `<button class="danger-button" data-delete="${escapeHtml(song.id)}">删除</button>` : ''}</div></div>`).join('') || '<p class="muted small">还没有歌曲，请先上传。</p>';
}
function setAdminTab(tab) {
  for (const name of ['upload', 'edit']) {
    $(`#${name}-tab`).classList.toggle('active', name === tab);
    $(`#${name}-pane`).hidden = name !== tab;
  }
  $('#lyric-edit-form').hidden = true;
  $('#admin-song-list').hidden = false;
  state.editor = null;
  adminMessage('');
  renderAdminList();
}
async function openAdmin() {
  adminMessage('');
  $('#admin-dialog').showModal();
  try {
    const session = await api('/api/session');
    $('#admin-login').hidden = session.authenticated;
    $('#admin-content').hidden = !session.authenticated;
    if (session.authenticated) setAdminTab('upload');
    else $('#admin-password').focus();
  } catch (error) { adminMessage(error.message); }
}
async function editSong(id) {
  try {
    state.editor = await api(`/api/songs/${encodeURIComponent(id)}`);
    $('#admin-song-list').hidden = true;
    $('#lyric-edit-form').hidden = false;
    $('#editor-title').textContent = state.editor.title;
    $('#editor-lines').innerHTML = state.editor.lyrics.map((line, i) => `<div class="editor-row"><div><time>${formatTime(line.time)}</time>${escapeHtml(line.text || '间奏')}</div><label>带声调拼音<input data-reading="${i}" value="${escapeHtml(line.reading)}" aria-label="第 ${i + 1} 行拼音" maxlength="4000" ${line.reading ? 'required' : ''}></label><label>越南语释义（选填）<input data-translation="${i}" value="${escapeHtml(line.translation)}" aria-label="第 ${i + 1} 行越南语释义" maxlength="2000"></label></div>`).join('');
    $('#editor-lines').scrollTop = 0;
    adminMessage('');
  } catch (error) { adminMessage(error.message); }
}
async function busy(form, callback) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try { await callback(); } catch (error) { adminMessage(error.message); }
  finally { button.disabled = false; }
}

paintIcons();
applyLyricOptions();
if (staticMode) {
  $('#manage-button').hidden = true;
  $('#admin-dialog').hidden = true;
}
const initialVolume = Number(saved('volume', 0.8));
audio.volume = Number.isFinite(initialVolume) ? Math.max(0, Math.min(1, initialVolume)) : 0.8;
$('#volume').value = audio.volume;
$('#volume').style.setProperty('--progress', `${audio.volume * 100}%`);
const initialSpeed = String(saved('speed', '1'));
$('#speed').value = ['0.5', '0.75', '0.9', '1', '1.25'].includes(initialSpeed) ? initialSpeed : '1';
refreshPlayButtons();

$('#play-button').addEventListener('click', togglePlay);
$('#song-list').addEventListener('click', event => {
  const button = event.target.closest('[data-song]');
  if (button) { $('#library-dialog').close(); void selectSong(button.dataset.song, true); }
});
$('#search').addEventListener('input', renderSongList);
$('#lyrics-lines').addEventListener('click', event => {
  const button = event.target.closest('[data-line]');
  if (button) selectLine(Number(button.dataset.line));
});
$('#loop-button').addEventListener('click', () => setLoop(state.loop < 0));
$('#prev-line').addEventListener('click', () => selectLine(Math.max(0, state.active - 1)));
$('#next-line').addEventListener('click', () => selectLine(Math.min((state.current?.lyrics.length || 1) - 1, state.active + 1)));
$('#restart-button').addEventListener('click', () => { $('#library-dialog').close(); setLoop(false); seekTo(0); setFollow(true); void play(); });
$('#seek').addEventListener('input', event => { if (Number.isFinite(audio.duration)) seekTo(Number(event.target.value) / 1000 * audio.duration); });
$('#speed').addEventListener('change', event => { audio.playbackRate = Number(event.target.value); audio.preservesPitch = true; save('speed', event.target.value); });
function refreshVolume() {
  const muted = audio.muted || audio.volume === 0;
  $('#mute-button').setAttribute('aria-pressed', String(muted));
  setIcon($('#mute-button'), muted ? 'muted' : 'volume');
  $('#volume').style.setProperty('--progress', `${audio.muted ? 0 : audio.volume * 100}%`);
}
$('#volume').addEventListener('input', event => { audio.volume = Number(event.target.value); audio.muted = false; save('volume', audio.volume); refreshVolume(); });
$('#mute-button').addEventListener('click', () => { audio.muted = !audio.muted; refreshVolume(); });
refreshVolume();
for (const name of ['pinyin', 'meaning']) $(`#${name}-toggle`).addEventListener('click', () => {
  state[name] = !state[name];
  save(name, state[name]);
  applyLyricOptions();
  if (state.follow) centerLine();
  if (name === 'meaning' && state.meaning && !state.current?.lyrics.some(line => line.translation)) toast('Chưa có bản dịch. Có thể thêm nghĩa tiếng Việt trong phần quản lý.');
});
$('#follow-button').addEventListener('click', () => setFollow(!state.follow));
$('#recenter-button').addEventListener('click', () => setFollow(true));
$('#lyrics-scroll').addEventListener('wheel', () => setFollow(false), { passive: true });
$('#lyrics-scroll').addEventListener('touchmove', () => setFollow(false), { passive: true });
$('#lyrics-scroll').addEventListener('keydown', event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) setFollow(false); });
$('#favorite-button').addEventListener('click', () => {
  if (!state.current) return;
  const id = state.current.id;
  if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
  save('favorites', [...state.favorites]);
  updateFavorite();
  toast(state.favorites.has(id) ? 'Đã thêm vào mục yêu thích trên thiết bị này.' : 'Đã bỏ yêu thích.');
});

for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => $(`#${button.dataset.close}`).close());
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
$('#help-button').addEventListener('click', () => { $('#library-dialog').close(); $('#help-dialog').showModal(); });
$('#library-button').addEventListener('click', () => $('#library-dialog').showModal());
$('#manage-button').addEventListener('click', () => { $('#library-dialog').close(); void openAdmin(); });
$('#share-button').addEventListener('click', () => {
  if (!state.current) { toast('Hãy chọn một bài hát trước.'); return; }
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('song', state.current.id);
  $('#share-link').value = url.href;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  $('#share-note').textContent = local ? 'Đây là bản xem thử trên máy của bạn. Bạn bè chưa thể mở liên kết này. Cần đưa ứng dụng lên máy chủ HTTPS trước khi chia sẻ.' : 'Gửi bài hát này cho bạn bè. Họ có thể mở bằng trình duyệt, không cần cài ứng dụng. Hãy kiểm tra rằng máy chủ có thể truy cập từ mạng của họ.';
  $('#share-dialog').showModal();
});
$('#copy-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#share-link').value); toast('Đã sao chép liên kết.'); }
  catch { $('#share-link').focus(); $('#share-link').select(); toast('Hãy chọn và sao chép liên kết ở trên.'); }
});

$('#login-form').addEventListener('submit', event => {
  event.preventDefault();
  void busy(event.currentTarget, async () => {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('#admin-password').value }) });
    $('#admin-password').value = '';
    $('#admin-login').hidden = true;
    $('#admin-content').hidden = false;
    setAdminTab('upload');
  });
});
$('#logout-button').addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST' });
    $('#admin-content').hidden = true;
    $('#admin-login').hidden = false;
    $('#lyric-edit-form').reset();
    state.editor = null;
    adminMessage('已退出管理后台。', true);
  } catch (error) { adminMessage(error.message); }
});
$('#upload-tab').addEventListener('click', () => setAdminTab('upload'));
$('#edit-tab').addEventListener('click', () => setAdminTab('edit'));
$('#editor-back').addEventListener('click', () => setAdminTab('edit'));
$('#upload-audio').addEventListener('change', event => {
  const file = event.target.files[0];
  if (file && !$('#upload-title').value) $('#upload-title').value = file.name.replace(/\.mp3$/i, '').split(' - ').at(-1).slice(0, 100);
});
$('#upload-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  void busy(form, async () => {
    const data = new FormData(form);
    if (data.get('audio').size > 30 * 1024 * 1024 || data.get('lyrics').size > 1024 * 1024) throw new Error('MP3 最大 30 MB，LRC 最大 1 MB。');
    adminMessage('正在上传和生成拼音，请稍候…', true);
    const song = await api('/api/songs', { method: 'POST', body: data });
    form.reset();
    await refreshLibrary(song.id);
    setAdminTab('edit');
    await editSong(song.id);
    adminMessage('上传成功，文件已保存在服务器。建议检查多音字后再分享。', true);
  });
});
$('#admin-song-list').addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit]');
  if (edit) { await editSong(edit.dataset.edit); return; }
  const remove = event.target.closest('[data-delete]');
  if (!remove) return;
  const song = state.songs.find(item => item.id === remove.dataset.delete);
  if (!song || !confirm(`确定删除「${song.title}」及其已上传的音频吗？此操作无法撤销。`)) return;
  remove.disabled = true;
  try {
    await api(`/api/songs/${encodeURIComponent(song.id)}`, { method: 'DELETE' });
    await refreshLibrary();
    renderAdminList();
    adminMessage('歌曲已删除。', true);
  } catch (error) { remove.disabled = false; adminMessage(error.message); }
});
$('#lyric-edit-form').addEventListener('submit', event => {
  event.preventDefault();
  void busy(event.currentTarget, async () => {
    if (!state.editor) return;
    const lyrics = state.editor.lyrics.map((line, i) => ({ id: line.id, reading: $(`[data-reading="${i}"]`).value, translation: $(`[data-translation="${i}"]`).value }));
    const song = await api(`/api/songs/${encodeURIComponent(state.editor.id)}/lyrics`, { method: 'PUT', body: JSON.stringify({ lyrics }) });
    state.editor = song;
    if (state.current?.id === song.id) { state.current.lyrics = song.lyrics; renderLyrics(); }
    adminMessage('拼音与释义已保存，朋友刷新页面即可看到。', true);
  });
});

audio.addEventListener('loadedmetadata', () => syncPlayback(true));
audio.addEventListener('durationchange', () => syncPlayback());
audio.addEventListener('timeupdate', () => { loopTick(); syncPlayback(); });
audio.addEventListener('seeked', () => syncPlayback());
audio.addEventListener('play', () => { refreshPlayButtons(); cancelAnimationFrame(state.animation); animate(); });
audio.addEventListener('pause', () => { refreshPlayButtons(); cancelAnimationFrame(state.animation); });
audio.addEventListener('ended', () => {
  if (state.loop >= 0 && state.current) { audio.currentTime = state.current.lyrics[state.loop].time; void play(); }
  else refreshPlayButtons();
});
audio.addEventListener('error', () => {
  if (!audio.getAttribute('src')) return;
  $('#page-error').hidden = false;
  $('#page-error').textContent = 'Không thể tải âm thanh. Vui lòng kiểm tra tệp nhạc và kết nối.';
  refreshPlayButtons();
});
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]') || event.target.closest('input, textarea, select, button, a, [contenteditable]')) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
  if (event.code === 'ArrowRight') { event.preventDefault(); seekTo(audio.currentTime + 5); }
  if (event.code === 'ArrowLeft') { event.preventDefault(); seekTo(audio.currentTime - 5); }
});
if ('mediaSession' in navigator) {
  for (const [action, handler] of [['play', play], ['pause', () => audio.pause()], ['seekbackward', () => seekTo(audio.currentTime - 5)], ['seekforward', () => seekTo(audio.currentTime + 5)], ['previoustrack', () => selectLine(Math.max(0, state.active - 1))], ['nexttrack', () => selectLine(state.active + 1)]]) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Not all media actions are supported by every browser. */ }
  }
}
window.addEventListener('resize', () => { if (state.follow) centerLine(false); });
refreshLibrary().catch(() => {
  $('#page-error').hidden = false;
  $('#page-error').textContent = 'Không thể kết nối với thư viện nhạc. Hãy kiểm tra kết nối và tải lại trang.';
  $('#song-list').innerHTML = '<p class="small muted">Mất kết nối. Vui lòng thử lại.</p>';
  $('#lyrics-lines').innerHTML = '<div class="empty-state">Vui lòng kiểm tra máy chủ và tải lại trang.</div>';
});

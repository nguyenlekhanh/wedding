const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Realtime SSE Connection
class WeddingRealtime {
  constructor() {
    this.handlers = new Map();
    this.connect();
  }
  connect() {
    this.es = new EventSource('/api/events');
    this.es.onmessage = e => this.dispatch('message', e);
    this.es.onerror = () => {
      setTimeout(() => this.connect(), 3000);
    };
  }
  addEventListener(event, fn) {
    this.es.addEventListener(event, fn);
  }
  dispatch(event, data) {
    const list = this.handlers.get(event) || [];
    for (const fn of list) fn(data);
  }
}

// 1. Viewport Fit
function fit() {
  const s = Math.min(innerWidth / 1080, innerHeight / 1920);
  const frame = $('#frame');
  if (frame) {
    frame.style.transform = `scale(${s})`;
    frame.style.left = `${(innerWidth - 1080 * s) / 2}px`;
    frame.style.top = `${(innerHeight - 1920 * s) / 2}px`;
  }
}
window.addEventListener('resize', fit);
window.addEventListener('load', fit);
try { new ResizeObserver(fit).observe(document.documentElement); } catch (e) {}
fit();

// ========================================================
// YOUTUBE BACKGROUND MUSIC PLAYER (NHẠC NỀN CƯỚI YOUTUBE)
// ========================================================
let ytPlayer = null;
let isYtReady = false;
let loadedVideoId = '';   // video the player is actually carrying
let lastBgmConfig = null; // newest snapshot, applied as soon as the player is ready
let playerError = null;
let ytPlayerState = null;

// Safe accessor: this module runs before `currentState` is initialised, so the
// player bootstrap must never touch it directly (TDZ ReferenceError).
function currentBgmConfig() {
  try {
    return (currentState && currentState.config && currentState.config.bgm) || {};
  } catch (e) {
    return {};
  }
}

// Creates the real YouTube player exactly once. Returns true when a player
// object exists (ready or still booting), false when it must be retried.
function initYtPlayer() {
  if (ytPlayer) return true;

  const slot = document.getElementById('yt-player-slot');
  if (!slot || !window.YT || typeof window.YT.Player !== 'function') return false;

  // A failed construction leaves a half-built <iframe> behind. The IFrame API
  // only accepts a container element, so that leftover must be replaced.
  const existing = document.getElementById('yt-bgm-iframe');
  if (existing && existing.tagName === 'IFRAME') existing.remove();
  if (!document.getElementById('yt-bgm-iframe')) {
    const container = document.createElement('div');
    container.id = 'yt-bgm-iframe';
    slot.append(container);
  }

  // No invented fallback video: an unconfigured track list starts silent.
  const initial = currentBgmConfig();
  const initialVideoId = String(initial.youtubeId || '');
  const playerVars = { autoplay: 1, loop: 1, controls: 0, disablekb: 1, modestbranding: 1 };
  const options = { height: '100', width: '100', playerVars };
  // The IFrame API throws "Invalid video id" when videoId exists but is empty,
  // so the key is only added when there is a real track to carry.
  if (initialVideoId) {
    options.videoId = initialVideoId;
    playerVars.playlist = initialVideoId;
    loadedVideoId = initialVideoId;
  }
  try {
    ytPlayer = new YT.Player('yt-bgm-iframe', Object.assign(options, {
      events: {
        onReady: (event) => {
          isYtReady = true;
          playerError = null;
          try { ytPlayerState = event.target.getPlayerState(); } catch (e) {}
          const bgm = currentBgmConfig();
          const volume = Number(bgm.volume);
          event.target.setVolume(Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 50);
          // A snapshot that arrived while the player was booting must not be lost.
          updateBgmState(lastBgmConfig || bgm);
          console.log('[BGM] player ready', (lastBgmConfig || bgm).youtubeId || '(no track configured)');
        },
        onStateChange: (event) => {
          ytPlayerState = event.data;
          const names = { '-1': 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' };
          console.log('[BGM] state', event.data, names[event.data] || '');
        },
        onError: (err) => {
          const code = err && err.data !== undefined ? err.data : null;
          const reasons = {
            2: 'invalid parameter',
            5: 'HTML5 player error',
            100: 'video not found',
            101: 'embedding disabled by the video owner',
            150: 'embedding disabled by the video owner'
          };
          playerError = code === null ? String(err && err.message || err) : code;
          console.warn(`[BGM] YouTube player error ${code}${reasons[code] ? ' — ' + reasons[code] : ''}`);
        }
      }
    }));
    return true;
  } catch (e) {
    playerError = String(e && e.message || e);
    console.warn('[BGM] could not initialize the YouTube player:', e && e.message || e);
    ytPlayer = null;
    isYtReady = false;
    return false;
  }
}

window.onYouTubeIframeAPIReady = initYtPlayer;

// The IFrame API script sits in <head> and can become ready BEFORE this module
// runs, in which case the callback above never fires and no player exists (no
// music, nothing to duck). Try immediately and keep a short bounded poll.
(function bootYtPlayer() {
  // Deferred on purpose: the rest of this module (state, ducking) is not
  // initialised yet while the module body is still evaluating.
  setTimeout(() => {
    if (initYtPlayer()) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (initYtPlayer() || tries > 120) clearInterval(timer);
    }, 250);
  }, 0);
})();

function updateBgmState(bgmConfig) {
  if (!bgmConfig) return;
  lastBgmConfig = bgmConfig;

  const titleEl = document.getElementById('bgm-title-text');
  if (titleEl && bgmConfig.title) titleEl.textContent = bgmConfig.title;

  // Not ready yet: onReady applies the latest snapshot, nothing is dropped.
  if (!isYtReady || !ytPlayer || typeof ytPlayer.loadVideoById !== 'function') return;

  try {
    const videoId = String(bgmConfig.youtubeId || '');
    if (videoId && videoId !== loadedVideoId) {
      // Switching tracks reuses this single player (never a second one).
      loadedVideoId = videoId;
      playerError = null;
      ytPlayer.loadVideoById({ videoId, suggestedQuality: 'small' });
      // A switch must not break ducking: re-assert the mixer's volume.
      bgmDucker.sync(Number(bgmConfig.volume));
    }
    if (bgmConfig.volume !== undefined) {
      // The ducking controller owns the volume: while the MC speaks this keeps
      // the ducked level (never 0), otherwise it follows the admin's slider.
      bgmDucker.sync(Number(bgmConfig.volume));
    }
    if (bgmConfig.enabled === false || bgmConfig.playing === false) {
      ytPlayer.pauseVideo();
    } else if (videoId) {
      ytPlayer.playVideo();
    }
  } catch (e) {
    console.warn('[BGM] could not apply the background music state:', e && e.message || e);
  }
}

// User interaction gesture to unlock browser audio restrictions
window.addEventListener('pointerdown', () => {
  if (isYtReady && ytPlayer && currentState?.config?.bgm?.enabled !== false && currentState?.config?.bgm?.playing !== false) {
    try { ytPlayer.playVideo(); } catch (e) {}
  }
}, { once: true, passive: true });

// Audio Synthesizer (Sound Effects)
let audioCtx = null;
function getAudio() {
  if (!audioCtx) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (Context) audioCtx = new Context();
  }
  if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}
window.addEventListener('pointerdown', getAudio, { once: true, passive: true });
window.addEventListener('keydown', getAudio, { once: true });

// Sound 1: Clinking glasses (leng keng)
function playClink() {
  const ctx = getAudio();
  if (!ctx) return;
  const t = ctx.currentTime;
  [2100, 3200, 4400].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.18 / (idx + 1), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8 + idx * 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1);
  });
}

// Sound 2: Wedding Bell (chuông hỷ)
function playWeddingBell() {
  const ctx = getAudio();
  if (!ctx) return;
  const t = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + idx * 0.08);
    osc.stop(t + 3);
  });
}

// Sound 3: Cheerful Fanfare
function playFanfare() {
  const ctx = getAudio();
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = [440, 554, 659, 880, 1108];
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t + idx * 0.10);
    gain.gain.setValueAtTime(0.11, t + idx * 0.10);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + idx * 0.10 + 0.7);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + idx * 0.10);
    osc.stop(t + idx * 0.10 + 0.8);
  });
}

// Voice Synthesizer - FALLBACK MC voice.
// Kokoro is the primary voice; this only runs when the server reports that the
// local engine is unavailable (tts-fallback) or the engine is explicitly 'browser'.
let cachedVoices = [];
function refreshVoices() {
  try { cachedVoices = speechSynthesis.getVoices() || []; } catch (e) { cachedVoices = []; }
}
if ('speechSynthesis' in window) {
  refreshVoices();
  try { speechSynthesis.addEventListener('voiceschanged', refreshVoices); } catch (e) {}
}

function pickEnglishVoice() {
  if (!cachedVoices.length) refreshVoices();
  return cachedVoices.find(v => v.lang && v.lang.toLowerCase().startsWith('en') && /natural|neural|aria|jenny|samantha|zira|female/i.test(v.name))
    || cachedVoices.find(v => v.lang && v.lang.toLowerCase().startsWith('en'))
    || null;
}

async function speakThankYou(text) {
  if (!('speechSynthesis' in window)) return;
  const cfg = currentState?.config || {};
  if (cfg.speech === false) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickEnglishVoice();
    if (voice) u.voice = voice;
    u.rate = Number(cfg.voiceRate) || 0.98;
    // Pitch is clamped to neutral: the old 1.25 was the main cause of the
    // "chipmunk" sound. Kokoro has no pitch control at all, so keep parity.
    u.pitch = 1.0;
    u.volume = Number(cfg.ttsVolume ?? cfg.volume) || 0.95;
    u.onerror = (e) => console.warn('[MC] browser speech error:', e?.error || e);
    speechSynthesis.speak(u);
  } catch (e) {}
}

// State management
let currentState = null;
const guestNodes = new Map();

// 24 Banquet Seats matching TikTok Live Demo (Image 4):
// Left side: 12 seats, Right side: 12 seats, Center red carpet clear for walking
const banquetTables = [
  // Left side corridor (12 seats: rows from top/back to bottom/front)
  { x: 100, y: 1200, scale: 0.58 },
  { x: 210, y: 1200, scale: 0.58 },
  { x: 320, y: 1210, scale: 0.58 },

  { x: 95,  y: 1330, scale: 0.68 },
  { x: 205, y: 1330, scale: 0.68 },
  { x: 315, y: 1340, scale: 0.68 },

  { x: 90,  y: 1470, scale: 0.78 },
  { x: 200, y: 1470, scale: 0.78 },
  { x: 310, y: 1480, scale: 0.78 },

  { x: 85,  y: 1620, scale: 0.88 },
  { x: 195, y: 1620, scale: 0.88 },
  { x: 305, y: 1630, scale: 0.88 },

  // Right side corridor (12 seats: rows from top/back to bottom/front)
  { x: 760, y: 1210, scale: 0.58 },
  { x: 870, y: 1200, scale: 0.58 },
  { x: 980, y: 1200, scale: 0.58 },

  { x: 765, y: 1340, scale: 0.68 },
  { x: 875, y: 1330, scale: 0.68 },
  { x: 985, y: 1330, scale: 0.68 },

  { x: 770, y: 1480, scale: 0.78 },
  { x: 880, y: 1470, scale: 0.78 },
  { x: 990, y: 1470, scale: 0.78 },

  { x: 775, y: 1630, scale: 0.88 },
  { x: 885, y: 1620, scale: 0.88 },
  { x: 995, y: 1620, scale: 0.88 }
];

const guestSprites = [
  '/assets/guest_1.png',
  '/assets/guest_2.png',
  '/assets/guest_3.png',
  '/assets/guest_4.png',
  '/assets/guest_5.png',
  '/assets/guest_6.png'
];

const guestAvatars = ['👰', '🤵', '🌸', '💐', '🎉', '🥂'];

// Render Guests with Golden Pill Badge and Status Tags
function renderGuests(people = []) {
  const container = $('#guests-container');
  if (!container) return;

  const currentIds = new Set(people.map(p => p.id));
  for (const [id, node] of guestNodes) {
    if (!currentIds.has(id)) {
      node.remove();
      guestNodes.delete(id);
    }
  }

  people.forEach((p, index) => {
    let node = guestNodes.get(p.id);
    const spriteIdx = p.sprite !== undefined ? p.sprite : (index % guestSprites.length);

    if (!node) {
      node = document.createElement('div');
      node.className = 'wedding-guest';
      node.dataset.id = p.id;
      node.style.setProperty('--delay', `${(index * 0.28) % 3}s`);

      const sprite = document.createElement('div');
      sprite.className = 'guest-sprite';
      sprite.style.backgroundImage = `url('${guestSprites[spriteIdx]}')`;

      const badge = document.createElement('div');
      badge.className = 'guest-name-badge';

      const av = document.createElement('span');
      av.className = 'badge-av';
      av.textContent = guestAvatars[spriteIdx] || '😊';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'badge-name';
      nameSpan.textContent = p.name;

      const statusTag = document.createElement('span');
      statusTag.className = 'guest-status-tag';
      statusTag.textContent = p.statusTag || '💍 Sending love';

      badge.append(av, nameSpan, statusTag);
      node.append(sprite, badge);
      container.append(node);
      guestNodes.set(p.id, node);
    } else {
      const nameSpan = node.querySelector('.badge-name');
      if (nameSpan) nameSpan.textContent = p.name;
      const statusTag = node.querySelector('.guest-status-tag');
      if (statusTag && p.statusTag) statusTag.textContent = p.statusTag;
    }

    // Position guest at 24 predetermined seats
    const seatIdx = (p.table !== undefined ? p.table : index) % banquetTables.length;
    const seat = banquetTables[seatIdx];

    node.style.left = `${seat.x - 67}px`;
    node.style.top = `${seat.y - 145}px`;
    node.style.setProperty('--scale', seat.scale);
    node.style.transform = `scale(${seat.scale})`;
    node.style.zIndex = String(Math.round(seat.y / 10));
  });
}

// Render Top Donors Registry
function renderRegistry(scores = {}) {
  const list = $('#registry-list');
  if (!list) return;
  list.replaceChildren();

  const sorted = Object.values(scores).sort((a, b) => b.total - a.total).slice(0, 5);
  const ranks = ['👑', '🥈', '🥉', '🌸', '💐'];

  if (!sorted.length) {
    const empty = document.createElement('div');
    empty.style.color = '#c9b294';
    empty.style.fontSize = '12px';
    empty.style.textAlign = 'center';
    empty.style.padding = '8px 0';
    empty.textContent = 'Waiting for the first gift...';
    list.append(empty);
    return;
  }

  sorted.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'registry-item';

    const rankSpan = document.createElement('span');
    rankSpan.className = 'reg-rank';
    rankSpan.textContent = ranks[idx] || (idx + 1);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'reg-name';
    nameSpan.textContent = item.name;

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'reg-score';
    scoreSpan.textContent = `💌 ${(item.total >= 1000000 ? (item.total / 1000000).toFixed(1) + 'M' : (item.total >= 1000 ? (item.total / 1000).toFixed(0) + 'K' : item.total))}`;

    row.append(rankSpan, nameSpan, scoreSpan);
    list.append(row);
  });
}

// Render Full State
function renderState(state) {
  currentState = state;
  const cfg = state.config || {};
  const stats = state.stats || {};
  const goals = state.goals || {};

  // Turning the MC off must also silence anything already queued.
  if (cfg.speech === false) clearMcQueue();

  // Couple names
  if ($('#groom-name')) $('#groom-name').textContent = cfg.groom || 'Tuấn Anh';
  if ($('#bride-name')) $('#bride-name').textContent = cfg.bride || 'Mai Vy';
  if ($('#wedding-title')) $('#wedding-title').textContent = cfg.title || 'WEDDING LIVE';

  // Stats
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  if ($('#stat-guests')) $('#stat-guests').textContent = plural(stats.guests || 119, 'guest', 'guests');
  if ($('#stat-outside')) $('#stat-outside').textContent = `+${stats.outside || 21} online`;
  if ($('#stat-envelopes')) $('#stat-envelopes').textContent = plural(stats.envelopes || 588, 'envelope', 'envelopes');
  if ($('#stat-wishes')) $('#stat-wishes').textContent = plural(stats.wishes || 175, 'wish', 'wishes');

  // Goals
  if (goals.rose) {
    const pct = Math.min(100, Math.round((goals.rose.current / goals.rose.target) * 100));
    if ($('#goal-rose-fill')) $('#goal-rose-fill').style.width = `${pct}%`;
    if ($('#goal-rose-num')) $('#goal-rose-num').textContent = `${goals.rose.current}/${goals.rose.target}`;
  }
  if (goals.cake) {
    const pct = Math.min(100, Math.round((goals.cake.current / goals.cake.target) * 100));
    if ($('#goal-cake-fill')) $('#goal-cake-fill').style.width = `${pct}%`;
    const curK = (goals.cake.current / 1000).toFixed(1) + 'K';
    const tgtK = (goals.cake.target / 1000).toFixed(0) + 'K';
    if ($('#goal-cake-num')) $('#goal-cake-num').textContent = `${curK}/${tgtK}`;
  }

  // Update BGM
  if (cfg.bgm) {
    updateBgmState(cfg.bgm);
  }

  // Aisle dancers only receive their dashboard settings here; the dancing itself
  // is pure CSS and runs from the moment the layer is attached.
  document.dispatchEvent(new CustomEvent('wedding:dancers', { detail: cfg.dancers || {} }));

  // Stage lighting is CSS-only too: this only forwards the operator's settings.
  document.dispatchEvent(new CustomEvent('wedding:lighting', { detail: cfg.stageLighting || {} }));

  // Simulated guests keep their own layer and animation state; forward the list.
  document.dispatchEvent(new CustomEvent('wedding:guest-arrivals', { detail: state.simulatedGuests || [] }));

  renderGuests(state.people || []);
  renderRegistry(state.scores || {});
}

// ========================================================
// UNIFIED CEREMONY BANNER & RITUAL CELEBRATIONS
// ========================================================
let ceremonyTimer = null;
function showCeremonyBanner(title, subtitle, type = 'gold', durationMs = 5500) {
  const banner = $('#ceremony-alert-banner');
  const tEl = $('#ceremony-title');
  const sEl = $('#ceremony-subtitle');
  if (!banner || !tEl) return;

  tEl.textContent = title;
  if (sEl) sEl.textContent = subtitle;
  banner.className = `ceremony-alert type-${type}`;
  banner.hidden = false;

  clearTimeout(ceremonyTimer);
  ceremonyTimer = setTimeout(() => {
    banner.hidden = true;
  }, durationMs);
}

// 1. Nghi thức Hôn nhau
let kissTimeout = null;
function triggerKiss() {
  const sprite = $('#couple-sprite');
  if (sprite) {
    sprite.classList.remove('couple-idle');
    sprite.classList.add('couple-kissing');
    clearTimeout(kissTimeout);
    kissTimeout = setTimeout(() => {
      sprite.classList.remove('couple-kissing');
      sprite.classList.add('couple-idle');
    }, 4500);
  }
  showCeremonyBanner('💋 THE BRIDE AND GROOM SHARE A KISS! 💕', 'A love sealed for a lifetime — forever and always!', 'kiss');
  spawnHearts(20);
  playWeddingBell();
  showToast('💋 The bride and groom just kissed — true love on full display! 💕');
}

// 2. Nghi thức Cụng ly 1 2 3 DZÔ!
function triggerCheers(initiator = '') {
  playClink();
  $$('.wedding-guest').forEach(g => {
    g.classList.add('cheering');
    setTimeout(() => g.classList.remove('cheering'), 2500);
  });
  showCeremonyBanner('🍻 CHEEEEEEERS! THE WHOLE HALL RAISES A GLASS! 🥂', `${initiator ? initiator + ' says: ' : ''}Bottoms up — a hundred years of happiness to the bride and groom!`, 'cheers');
  showToast(`🥂 ${initiator ? initiator + ' says: ' : ''} CHEEEEEERS! Raise your glass to the bride and groom! 🍻`);
}

// 3. Nghi thức Khách cùng nhảy múa
function triggerDance() {
  playFanfare();
  $$('.wedding-guest').forEach(g => {
    g.classList.add('dancing');
    setTimeout(() => g.classList.remove('dancing'), 4500);
  });
  showCeremonyBanner('💃 THE WHOLE HALL HITS THE DANCE FLOOR! 🎉', 'Move to the music and celebrate this glorious day!', 'dance');
  showToast('💃 The wedding hall is dancing — what a party! 🎉');
}

// 4. Nghi thức Cắt bánh cưới
function triggerCake() {
  playFanfare();
  spawnHearts(16);
  const sprite = $('#couple-sprite');
  if (sprite) {
    sprite.classList.add('couple-kissing');
    setTimeout(() => sprite.classList.remove('couple-kissing'), 3200);
  }
  showCeremonyBanner('🎂 THE WEDDING CAKE CUTTING CEREMONY! 💕', 'The bride and groom cut the cake — a sweet start to a hundred years!', 'cake');
  showToast(`🎂 The cake is cut — sweet wishes for a hundred years of happiness! 💕`);
}

// 5. Nghi thức Rót tháp sâm panh
function triggerChampagne() {
  playClink();
  spawnHearts(16);
  showCeremonyBanner('🍾 POURING THE CHAMPAGNE TOWER! 🥂', 'Overflowing with love — a hundred years of happiness!', 'champagne');
  showToast(`🍾 The champagne tower is flowing with love! 🥂`);
}

// 6. Nghi thức Mưa hoa hồng rực rỡ
function triggerPetal() {
  playWeddingBell();
  spawnPetalsBurst(45);
  showCeremonyBanner('🌹 A SHOWER OF ROSES FOR THE HAPPY COUPLE! 🌸', 'Petals blanket the red carpet to bless the newlyweds!', 'petal');
  showToast('🌹 Roses rain over the wedding hall! 💕');
}

// 7. Nghi thức Cướp Chú Rể (Đấu giá kết hôn)
function triggerMarry(newGroom, prevGroom, joke = '') {
  showCeremonyBanner(`👑 CONGRATULATIONS, NEW GROOM: ${newGroom.toUpperCase()}! 💍`, `${prevGroom ? 'Officially taking over from ' + prevGroom + ' as the new groom!' : 'Officially the groom standing beside the bride!'}`, 'marry', 7000);

  if ($('#groom-name')) $('#groom-name').textContent = newGroom;

  // Flash Crown
  const crown = $('#groom-status-tag');
  if (crown) {
    crown.classList.add('crown-flash');
    setTimeout(() => crown.classList.remove('crown-flash'), 6000);
  }

  playFanfare();
  playWeddingBell();
  triggerKiss();
  spawnHearts(20);
  showToast(`🎉 WEDDING BELLS! ${newGroom} has won the bride's hand! Congratulations to the new groom! 👑💕`);
}

// Show Chat Bubble
function showChatBubble(personId, comment) {
  const node = guestNodes.get(personId);
  if (!node) return;

  node.querySelector('.wedding-chat-bubble')?.remove();
  const bubble = document.createElement('div');
  bubble.className = 'wedding-chat-bubble';
  // Viewer comments are shown verbatim: the original Unicode text is never rewritten,
  // transliterated or sent to any external service.
  bubble.textContent = comment;
  node.append(bubble);

  // Optional translation adapter - disabled by default and offline by design.
  // Define `window.WEDDING_TRANSLATE_COMMENT = async (text) => translatedText`
  // before this script loads to render an English line under the original comment.
  const translate = window.WEDDING_TRANSLATE_COMMENT;
  if (typeof translate === 'function') {
    try {
      Promise.resolve(translate(comment, { personId })).then(translated => {
        if (typeof translated !== 'string' || !translated.trim() || translated === comment) return;
        if (!bubble.isConnected) return;
        const line = document.createElement('span');
        line.className = 'chat-bubble-translation';
        line.textContent = translated;
        bubble.append(line);
      }).catch(() => {});
    } catch (e) {}
  }

  setTimeout(() => bubble.remove(), 4200);
}

// Show Toast
function showToast(text, avatar = '👰') {
  const toast = $('#footer-toast');
  const txt = $('#toast-text');
  const av = $('#toast-avatar');
  if (toast && txt) {
    txt.textContent = text;
    if (av) av.textContent = avatar;
    toast.style.animation = 'none';
    void toast.offsetWidth;
    toast.style.animation = 'toast-glow 3s infinite alternate';
  }
}

// Particle System: Rose Petals Falling (Periodic)
function spawnPetals() {
  if (currentState?.config?.showRosePetals === false) return;
  const layer = $('#petals');
  if (!layer || layer.childElementCount > 30) return;

  const count = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'falling-rose-petal';
    p.style.left = `${30 + Math.random() * 1020}px`;
    const dur = 7 + Math.random() * 5;
    p.style.animationDuration = `${dur}s`;
    p.style.setProperty('--drift', `${(Math.random() - 0.5) * 240}px`);
    p.style.setProperty('--turn', `${(Math.random() - 0.5) * 600}deg`);
    layer.append(p);
    setTimeout(() => p.remove(), dur * 1000);
  }
}
setInterval(spawnPetals, 1800);

// Particle System: Petals Burst (For Ritual: Mưa Hoa Hồng)
function spawnPetalsBurst(count = 40) {
  const layer = $('#petals');
  if (!layer) return;

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'falling-rose-petal';
    p.style.left = `${20 + Math.random() * 1040}px`;
    const dur = 4 + Math.random() * 4;
    p.style.animationDuration = `${dur}s`;
    p.style.animationDelay = `${(i * 0.04)}s`;
    p.style.setProperty('--drift', `${(Math.random() - 0.5) * 300}px`);
    p.style.setProperty('--turn', `${(Math.random() - 0.5) * 720}deg`);
    layer.append(p);
    setTimeout(() => p.remove(), (dur + 1) * 1000);
  }
}

// Particle System: Flying Hearts
function spawnHearts(count = 8) {
  const layer = $('#hearts-layer');
  if (!layer) return;
  const hearts = ['💕', '💖', '💗', '💓', '💘', '💍'];
  for (let i = 0; i < count; i++) {
    const h = document.createElement('div');
    h.className = 'flying-heart';
    h.textContent = hearts[Math.floor(Math.random() * hearts.length)];
    h.style.left = `${360 + Math.random() * 360}px`;
    h.style.top = `${820 + (Math.random() - 0.5) * 80}px`;
    h.style.animationDelay = `${i * 0.08}s`;
    layer.append(h);
    setTimeout(() => h.remove(), 2600);
  }
}

// Particle System: Iridescent Wedding Bubbles Floating Up
function spawnBubbles() {
  if (currentState?.config?.showBubbles === false) return;
  const layer = $('#bubbles-layer');
  if (!layer || layer.childElementCount > 12) return;

  const b = document.createElement('div');
  b.className = 'floating-bubble';
  const size = 22 + Math.floor(Math.random() * 32);
  b.style.width = `${size}px`;
  b.style.height = `${size}px`;
  b.style.left = `${60 + Math.random() * 960}px`;
  const dur = 6 + Math.random() * 4;
  b.style.animationDuration = `${dur}s`;
  b.style.setProperty('--drift', `${(Math.random() - 0.5) * 150}px`);
  layer.append(b);
  setTimeout(() => b.remove(), dur * 1000);
}
setInterval(spawnBubbles, 950);

// Ambient Guest Random Chat
const ambientLines = [
  'A hundred years of happiness! 💕',
  'CHEEEEEEERS! 🍻',
  'Kiss! Kiss! Kiss! 💋',
  'The bride looks absolutely stunning! ✨',
  'The groom is looking sharp! 🤵',
  'Eat up, everyone — the food is amazing! 🍗',
  'Wishing a love like theirs for myself! 💍',
  'Raise a glass to the young couple! 🥂',
  'Cutest couple on the internet! 💖'
];

setInterval(() => {
  if (guestNodes.size === 0) return;
  const ids = Array.from(guestNodes.keys());
  const randId = ids[Math.floor(Math.random() * ids.length)];
  const randLine = ambientLines[Math.floor(Math.random() * ambientLines.length)];
  showChatBubble(randId, randLine);
}, 5800);

// Ceremonial Walk on Red Carpet
let isOfferingBusy = false;
const offeringQueue = [];

function queueOffering(event) {
  offeringQueue.push(event);
  processOfferingQueue();
}

async function processOfferingQueue() {
  if (isOfferingBusy || !offeringQueue.length) return;
  isOfferingBusy = true;
  const item = offeringQueue.shift();

  const actor = $('#procession-actor');
  if (!actor) { isOfferingBusy = false; return; }

  // Set actor visual
  const sprite = actor.querySelector('.actor-sprite');
  const giftName = actor.querySelector('.actor-gift-name');
  const actorName = actor.querySelector('.actor-name');

  if (sprite) sprite.style.backgroundImage = "url('/assets/guest_2.png')";
  if (giftName) giftName.textContent = `${item.gift} ×${item.count}`;
  if (actorName) actorName.textContent = item.name;

  // Waypoints from bottom of red carpet to stage
  const start = { x: 540, y: 1980, scale: 0.95 };
  const mid1 = { x: 540, y: 1680, scale: 0.82 };
  const mid2 = { x: 540, y: 1440, scale: 0.70 };
  const altar = { x: 540, y: 1210, scale: 0.58 };

  actor.style.left = `${start.x - 65}px`;
  actor.style.top = `${start.y - 165}px`;
  actor.style.transform = `scale(${start.scale})`;
  actor.hidden = false;
  actor.classList.add('walking');

  // Animate walk up
  const walkAnim = actor.animate([
    { left: `${start.x - 65}px`, top: `${start.y - 165}px`, transform: `scale(${start.scale})` },
    { left: `${mid1.x - 65}px`, top: `${mid1.y - 165}px`, transform: `scale(${mid1.scale})` },
    { left: `${mid2.x - 65}px`, top: `${mid2.y - 165}px`, transform: `scale(${mid2.scale})` },
    { left: `${altar.x - 65}px`, top: `${altar.y - 165}px`, transform: `scale(${altar.scale})` }
  ], { duration: 3800, easing: 'ease-in-out', fill: 'forwards' });

  await walkAnim.finished;
  actor.classList.remove('walking');

  // Arrived at stage: Present gift
  playWeddingBell();
  triggerKiss();

  if (item.becameGroom) {
    triggerMarry(item.name, item.previousGroom, item.funnyMessage);
  }

  // Show celebration card
  const card = $('#celebration-card');
  const donorEl = $('#celeb-donor');
  const giftEl = $('#celeb-gift');
  const wishEl = $('#celeb-wish');

  if (donorEl) donorEl.textContent = item.name;
  if (giftEl) giftEl.textContent = `A gift of ${item.gift} ×${item.count}`;
  const wishes = currentState?.config?.wishes || ['Wishing you a hundred years of happiness!'];
  const wish = wishes[Math.floor(Math.random() * wishes.length)];
  if (wishEl) wishEl.textContent = `"${wish}"`;

  card?.classList.add('show');
  showToast(`💌 ${item.name} just sent ${item.gift} ×${item.count}! A hundred years of happiness! 💕`);

  // MC voice announcement is produced by the server (Kokoro) and arrives over SSE
  // as a `tts` event, so the audio is a real media element (OBS-capturable) instead
  // of Web Speech. If the server cannot synthesise, it sends `tts-fallback` and the
  // browser voice in speakThankYou() takes over.
  const cfg = currentState?.config || {};
  if (cfg.speech === false) {
    clearMcQueue();
  }

  await new Promise(r => setTimeout(r, 4800));
  card?.classList.remove('show');

  // Walk return down the red carpet
  actor.classList.add('walking');
  const retAnim = actor.animate([
    { left: `${altar.x - 65}px`, top: `${altar.y - 165}px`, transform: `scale(${altar.scale})` },
    { left: `${mid2.x - 65}px`, top: `${mid2.y - 165}px`, transform: `scale(${mid2.scale})` },
    { left: `${start.x - 65}px`, top: `${start.y - 165}px`, transform: `scale(${start.scale})` }
  ], { duration: 2800, easing: 'ease-in-out', fill: 'forwards' });

  await retAnim.finished;
  actor.classList.remove('walking');
  actor.hidden = true;

  isOfferingBusy = false;
  if (offeringQueue.length) {
    setTimeout(processOfferingQueue, 400);
  }
}

// ========================================================
// MC VOICE PLAYBACK (Kokoro WAV)
// Priority queue + BGM ducking + graceful failure.
// ========================================================
const mcQueue = [];
let mcCurrent = null;

function mcEl() { return document.getElementById('mc-audio'); }
function mcIsSpeaking() { return !!mcCurrent; }

function mcVolume() {
  const v = Number(currentState?.config?.ttsVolume ?? currentState?.config?.volume ?? 0.95);
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.95));
}

// BGM ducking: the MC talks OVER the music.
// A single controller owns the YouTube volume: it eases from the admin's level
// (e.g. 20) down to the configured duck level (default 12) and back to the
// exact previous value. Consecutive lines do not re-fade, a paused/disabled MC
// restores immediately, and nothing in this path ever pauses, stops, mutes or
// reloads the player — only setVolume() is used.
import { createBgmDucker } from '/mc-duck.js';

function mcDuckSettings() {
  const overrides = window.__MC_DUCK__ || {};
  const enabled = overrides.enabled !== false && currentState?.config?.ttsDuckBgm !== false;
  const level = Number(overrides.volume);
  return { enabled, volume: Number.isFinite(level) ? level : 12 };
}

function bgmAdminVolume() {
  const v = Number(currentState?.config?.bgm?.volume);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 20;
}

const bgmDucker = createBgmDucker({
  getVolume: () => {
    try {
      return (isYtReady && ytPlayer && ytPlayer.getVolume) ? ytPlayer.getVolume() : null;
    } catch (e) {
      return null;
    }
  },
  // Volume only. Music is never paused, stopped, muted or reloaded here.
  setVolume: value => {
    if (!isYtReady || !ytPlayer || typeof ytPlayer.setVolume !== 'function') return;
    try { ytPlayer.setVolume(value); } catch (e) {}
  },
  getAdminVolume: bgmAdminVolume,
  getSettings: mcDuckSettings
});

function duckBgm(ducked) {
  if (ducked) bgmDucker.duck();
  else bgmDucker.restore();
}

function clearMcQueue() {
  mcQueue.length = 0;
  const el = mcEl();
  if (mcCurrent) {
    mcCurrent.finished = true;
    clearTimeout(mcCurrent.watchdog);
    mcCurrent = null;
  }
  try { el.pause(); } catch (e) {}
  duckBgm(false);
}

// The AI MC actor asks for silence when the operator pauses or disables it.
window.addEventListener('wedding:clear-mc', () => clearMcQueue());

function playNextMc() {
  if (mcCurrent) return;
  const item = mcQueue.shift();
  if (!item) { duckBgm(false); return; }

  const el = mcEl();
  if (!el) return;

  const entry = { item, finished: false };
  mcCurrent = entry;

  const done = () => {
    if (entry.finished) return;
    entry.finished = true;
    clearTimeout(entry.watchdog);
    if (mcCurrent === entry) mcCurrent = null;
    if (mcCurrent) return;            // a pre-empting line already owns the element
    if (mcQueue.length) playNextMc();
    else duckBgm(false);
  };

  el.onended = done;
  el.onerror = () => { console.warn('[MC] audio failed:', item.url); done(); };
  el.volume = mcVolume();
  el.src = item.url;
  duckBgm(true);

  // Watchdog: never let a stuck element silence the MC forever.
  const guardMs = Math.max(2000, Number(item.durationMs) || 9000) + 3000;
  entry.watchdog = setTimeout(done, guardMs);

  const p = el.play();
  if (p && typeof p.catch === 'function') {
    p.catch(err => { console.warn('[MC] playback blocked:', err && err.message); done(); });
  }
}

function enqueueMcSpeech(item) {
  if (!item || !item.url) return;
  if (item.id && (mcQueue.some(q => q.id === item.id) || (mcCurrent && mcCurrent.item.id === item.id))) return;

  mcQueue.push(item);
  // Highest priority first; equal priority keeps arrival order.
  mcQueue.sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));

  if (mcCurrent) {
    const incoming = Number(item.priority) || 0;
    const playing = Number(mcCurrent.item.priority) || 0;
    if (incoming <= playing) return;   // important line keeps playing; this one waits

    // Pre-empt: stop the lower-priority line, drop it from the element.
    const el = mcEl();
    const prev = mcCurrent;
    prev.finished = true;
    clearTimeout(prev.watchdog);
    mcCurrent = null;
    try { el.pause(); } catch (e) {}
  }

  playNextMc();
}

// Read-only diagnostics for the operator (and for automated checks).
// Mirrors the queue + BGM duck state without changing any behaviour.
window.__weddingMC = () => {
  const el = mcEl();
  let bgmVolume = null;
  try { bgmVolume = (isYtReady && ytPlayer && ytPlayer.getVolume) ? ytPlayer.getVolume() : null; } catch (e) {}
  return {
    speaking: !!mcCurrent,
    playingId: mcCurrent ? mcCurrent.item.id : null,
    playingPriority: mcCurrent ? mcCurrent.item.priority : null,
    queued: mcQueue.map(q => ({ id: q.id, priority: q.priority, kind: q.kind || null })),
    element: el ? {
      src: el.currentSrc || el.src,
      currentTime: Number(el.currentTime.toFixed(2)),
      duration: Number.isFinite(el.duration) ? Number(el.duration.toFixed(2)) : null,
      paused: el.paused,
      volume: el.volume
    } : null,
    bgmVolume,
    youtubeReady: isYtReady,
    // BGM diagnostics (the operator and the automated checks read these).
    youtubeApiLoaded: typeof window.YT !== 'undefined' && !!window.YT && typeof window.YT.Player === 'function',
    playerState: ytPlayerState,
    playerError,
    activeTrack: Number(currentState?.config?.bgm?.activeTrack) || 1,
    videoId: loadedVideoId || String(currentState?.config?.bgm?.youtubeId || ''),
    configuredVolume: Number.isFinite(Number(currentState?.config?.bgm?.volume)) ? Number(currentState.config.bgm.volume) : 50,
    actualVolume: bgmVolume,
    bgmPlaying: isYtReady && ytPlayerState === 1,
    duckEnabled: currentState?.config?.ttsDuckBgm !== false,
    duck: bgmDucker.state()
  };
};

// Connect SSE events
const realtime = new WeddingRealtime();

realtime.addEventListener('state', e => {
  try {
    const data = JSON.parse(e.data);
    renderState(data);
  } catch (err) {}
});

realtime.addEventListener('bgm', e => {
  try {
    const data = JSON.parse(e.data);
    updateBgmState(data);
  } catch (err) {}
});

realtime.addEventListener('activity', e => {
  try {
    const d = JSON.parse(e.data);
    if (d.type === 'chat') {
      showChatBubble(d.id, d.comment);
      if (d.triggeredAction === 'kiss') triggerKiss();
      else if (d.triggeredAction === 'cheers') triggerCheers(d.name);
      else if (d.triggeredAction === 'dance') triggerDance();
      else if (d.triggeredAction === 'cake') triggerCake();
      else if (d.triggeredAction === 'champagne') triggerChampagne();
      else if (d.triggeredAction === 'petal') triggerPetal();
    }
  } catch (err) {}
});

realtime.addEventListener('action', e => {
  try {
    const d = JSON.parse(e.data);
    if (d.action === 'marry') triggerMarry(d.initiator || d.newGroom, d.previousGroom, d.text);
    else if (d.action === 'kiss') triggerKiss();
    else if (d.action === 'cheers') triggerCheers(d.initiator);
    else if (d.action === 'dance') triggerDance();
    else if (d.action === 'cake') triggerCake();
    else if (d.action === 'champagne') triggerChampagne();
    else if (d.action === 'petal') triggerPetal();
  } catch (err) {}
});

realtime.addEventListener('focus', e => {
  try {
    const d = JSON.parse(e.data);
    queueOffering(d);
  } catch (err) {}
});

// Admin guest simulator: spawn / reset events for the guest-arrivals module.
realtime.addEventListener('guest-arrival', e => {
  try {
    document.dispatchEvent(new CustomEvent('wedding:guest-arrival', { detail: JSON.parse(e.data) }));
  } catch (err) {}
});

realtime.addEventListener('guest-leaving', e => {
  try {
    document.dispatchEvent(new CustomEvent('wedding:guest-leaving', { detail: JSON.parse(e.data) }));
  } catch (err) {}
});

realtime.addEventListener('guest-arrivals-reset', () => {
  document.dispatchEvent(new CustomEvent('wedding:guest-arrivals-reset'));
});

// Kokoro MC audio is ready (server-generated WAV)
realtime.addEventListener('tts', e => {
  try {
    const d = JSON.parse(e.data);
    enqueueMcSpeech(d);
  } catch (err) {}
});

// Kokoro unavailable / engine set to 'browser': use the browser voice
realtime.addEventListener('tts-fallback', e => {
  try {
    const d = JSON.parse(e.data);
    if (d && d.text) speakThankYou(d.text);
  } catch (err) {}
});

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const EventEmitter = require('node:events');
const { TtsService } = require('./tts/tts-service.cjs');

// AI provider manager. .env is read first and never overrides real env vars, so
// the existing REACTIVE_AI_* / LLM_SECRETS_MASTER_KEY values keep working as-is.
const { loadEnvFile } = require('./ai/env.cjs');
loadEnvFile();
const { manager: ai, AiError: AiManagerError, CODE: AI_CODE } = require('./ai/index.cjs');

const PORT = Number(process.env.PORT) || 3003;
const STATE_FILE = path.join(__dirname, 'wedding_state.json');

// ---------------------------------------------------------------
// LOCAL MC VOICE (Kokoro-82M). Runs in its own worker thread, offline.
// ---------------------------------------------------------------
const tts = new TtsService({
  cacheDir: path.join(__dirname, 'tts', 'cache'),
  modelDir: path.join(__dirname, 'tts', 'models')
});

// Default initial state with Marriage Auction & Funny Teasing Voice
const defaultState = {
  config: {
    groom: "Tuấn Anh",
    bride: "Mai Vy",
    title: "WEDDING LIVE",
    slogan: "A Hundred Years of Happiness",
    date: "2026-11-03",
    showRosePetals: true,
    showHearts: true,
    showFireworks: true,
    showBubbles: true,
    speech: true,
    ttsEngine: "kokoro",      // 'kokoro' = local Kokoro-82M | 'browser' = Web Speech fallback
    ttsVoice: "af_heart",     // Kokoro voice id
    ttsSpeed: 0.98,           // natural, unhurried MC pace
    ttsVolume: 0.95,          // overlay audio element volume
    ttsDuckBgm: true,         // lower the YouTube BGM while the MC speaks
    voice: "en-US-AriaNeural",
    speechMode: "browser",
    volume: 0.95,
    voicePitch: 1.0,          // browser fallback only: no pitch distortion
    voiceRate: 0.98,
    soundEffects: true,
    enableMarryAuction: true,
    minCoinsToMarry: 10,
    funnyVoiceEnabled: true,
    bgm: {
      enabled: true,
      youtubeUrl: "https://www.youtube.com/watch?v=w4Z01V4uFz8",
      youtubeId: "w4Z01V4uFz8",
      title: "Romantic Wedding Instrumental (Piano & Violin)",
      volume: 50,
      playing: true
    },
    thanksTemplate: "Thank you {name} for the {count} {gift} for bride {bride} and groom {groom}! Wishing you and your family good health and every happiness!",
    funnyJokes: [
      "Oh wow, can you believe it! Big spender {name} just sent {count} {gift}! Handsome and generous — no wonder the bride is swooning!",
      "Goodness me! Thank you {name}! With gifts like this, the newlyweds will be counting envelopes all night long!",
      "You went all out, {name}! {count} {gift} — absolute legend! Enjoy the feast, and may love find you next year!",
      "Pure class, everyone! {name} just sent {count} {gift}! Truly deserves a queue of admirers!",
      "Thank you so much, {name}! If you are drunk on love, stay till the end — the party is just getting started!",
      "What a moment! {name} just showed up with the most amazing gift! A hundred percent toast to {name}!"
    ],
    marryJokes: [
      "Wedding alert, everyone! {name} just sent {count} {gift} and officially stole the groom away! Congratulations to the new groom!",
      "Oh my word! {name} dropped a huge gift and took over as groom — mission accomplished! Raise a glass to the new groom!",
      "Breaking news at the wedding! {name} is now the handsome groom standing beside the bride! A hundred years of happiness, and a baby boy soon!"
    ],
    wishes: [
      "Wishing you a hundred years of happiness, till your hair turns silver!",
      "May the bride and groom share deep love and welcome a baby soon!",
      "May the happy couple stay in harmony and watch their family flourish!",
      "Congratulations on this joyful day — may good fortune and blessings fill your home!"
    ],
    giftSlots: [
      { id: 'rose', name: 'Wedding Envelope', coins: 1, action: 'envelope', prayer: 'A wedding envelope gift' },
      { id: 'peach', name: 'Gift of Gold', coins: 5, action: 'gold', prayer: 'One tael of gold' },
      { id: 'clarinet', name: 'Join the Dance', coins: 10, action: 'dance', prayer: 'A round of dancing' },
      { id: 'beer', name: 'Buy a Round', coins: 1, action: 'cheers', prayer: 'A table of drinks' },
      { id: 'ring', name: 'Become the Groom / Exchange Rings', coins: 10, action: 'ring', prayer: 'Exchange the wedding rings' }
    ]
  },
  stats: {
    guests: 119,
    outside: 21,
    envelopes: 588,
    wishes: 175
  },
  goals: {
    rose: { current: 1670, target: 2532, label: 'Rose rain' },
    cake: { current: 60300, target: 100000, label: 'Cake cutting' }
  },
  people: [
    // Phía bên trái (12 khách ngồi 4 hàng)
    { id: 'guest-1', name: 'Ibeth', avatar: '', sprite: 4, table: 0, seat: 0, statusTag: '💍 Sending love' },
    { id: 'guest-2', name: 'Daniel ', avatar: '', sprite: 1, table: 1, seat: 1, statusTag: '🍗 Feasting' },
    { id: 'guest-3', name: 'Jamie', avatar: '', sprite: 2, table: 2, seat: 2, statusTag: '🍻 Bottoms up' },
    { id: 'guest-4', name: 'Ashley', avatar: '', sprite: 5, table: 3, seat: 0, statusTag: '💃 Dancing' },
    { id: 'guest-5', name: 'Alex', avatar: '', sprite: 3, table: 4, seat: 1, statusTag: '👀 Here for the drama' },
    { id: 'guest-6', name: 'Oliver', avatar: '', sprite: 0, table: 5, seat: 2, statusTag: '🥂 Cheers' },
    { id: 'guest-7', name: 'Casey', avatar: '', sprite: 4, table: 6, seat: 0, statusTag: '✨ Perfect pair' },
    { id: 'guest-8', name: 'Riley', avatar: '', sprite: 5, table: 7, seat: 1, statusTag: '💖 Blessings' },
    { id: 'guest-9', name: 'Samuel', avatar: '', sprite: 2, table: 8, seat: 2, statusTag: '🍻 100% Cheers' },
    { id: 'guest-10', name: 'Morgan', avatar: '', sprite: 3, table: 9, seat: 0, statusTag: '🌸 So sweet' },
    { id: 'guest-11', name: 'Quinn', avatar: '', sprite: 4, table: 10, seat: 1, statusTag: '👰 Catching the bouquet' },
    { id: 'guest-12', name: 'Alex', avatar: '', sprite: 0, table: 11, seat: 2, statusTag: '🎉 So happy' },

    // Phía bên phải (12 khách ngồi 4 hàng)
    { id: 'guest-13', name: 'Paul', avatar: '', sprite: 1, table: 12, seat: 0, statusTag: '🍾 Popping bottles' },
    { id: 'guest-14', name: 'Alexander', avatar: '', sprite: 5, table: 13, seat: 1, statusTag: '💍 Sending love' },
    { id: 'guest-15', name: 'Charles', avatar: '', sprite: 2, table: 14, seat: 2, statusTag: '🍻 1 2 3 Cheers' },
    { id: 'guest-16', name: 'Alex', avatar: '', sprite: 4, table: 15, seat: 0, statusTag: '✨ Hundred-year wishes' },
    { id: 'guest-17', name: 'Oliver', avatar: '', sprite: 0, table: 16, seat: 1, statusTag: '🍗 Chicken feast' },
    { id: 'guest-18', name: 'Paul', avatar: '', sprite: 3, table: 17, seat: 2, statusTag: '💖 Gorgeous' },
    { id: 'guest-19', name: 'Alexander', avatar: '', sprite: 1, table: 18, seat: 0, statusTag: '💃 Dancing all night' },
    { id: 'guest-20', name: 'Samuel', avatar: '', sprite: 2, table: 19, seat: 1, statusTag: '👑 Next in line' },
    { id: 'guest-21', name: 'Morgan', avatar: '', sprite: 5, table: 20, seat: 2, statusTag: '💐 Waiting for the bouquet' },
    { id: 'guest-22', name: 'Hải Đăng', avatar: '', sprite: 0, table: 21, seat: 0, statusTag: '🍻 Drink it all' },
    { id: 'guest-23', name: 'Trúc Ly', avatar: '', sprite: 4, table: 22, seat: 1, statusTag: '🎉 Absolutely radiant' },
    { id: 'guest-24', name: 'Đức Quân', avatar: '', sprite: 1, table: 23, seat: 2, statusTag: '👑 Big Spender' }
  ],
  scores: {
    'donor-1': { id: 'donor-1', name: 'Sam', total: 7400000, avatar: '' },
    'donor-2': { id: 'donor-2', name: 'Casey', total: 360000, avatar: '' },
    'donor-3': { id: 'donor-3', name: 'Ibeth', total: 120000, avatar: '' },
    'donor-4': { id: 'donor-4', name: 'Quinn', total: 60200, avatar: '' },
    'donor-5': { id: 'donor-5', name: 'Taylor', total: 60000, avatar: '' }
  },
  recentGivers: [
    { id: 'donor-1', name: 'Sam', gift: 'Diamond Ring', count: 1, diamonds: 500 },
    { id: 'donor-2', name: 'Taylor', gift: 'Gift of Gold', count: 5, diamonds: 25 }
  ],
  status: {
    state: 'offline', // 'offline' | 'connecting' | 'waiting' | 'connected' | 'error'
    message: 'Chưa kết nối. Hãy mở TikFinity Desktop trên máy này.',
    username: '',
    roomId: '',
    mode: 'tikfinity'
  }
};

// Load saved state or default
let state = { ...defaultState };
try {
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    state = {
      ...defaultState,
      ...parsed,
      config: { ...defaultState.config, ...(parsed.config || {}) },
      stats: { ...defaultState.stats, ...(parsed.stats || {}) },
      goals: { ...defaultState.goals, ...(parsed.goals || {}) },
      scores: { ...defaultState.scores, ...(parsed.scores || {}) },
      status: { ...defaultState.status, ...(parsed.status || {}) }
    };
    if (parsed.people && Array.isArray(parsed.people) && parsed.people.length > 0) {
      state.people = parsed.people;
    }
  }
} catch (e) {
  console.error("Error loading wedding state, using default:", e.message);
}

function persistState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error("Failed to persist wedding state:", e.message);
  }
}

// SSE Clients for Realtime sync
const clients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch (e) {
      clients.delete(client);
    }
  }
}

// ---------------------------------------------------------------
// MC ANNOUNCEMENTS
// Priority: crown transfer (10) > gift thank-you (5) > ambient (1).
// Generation never blocks this thread: the worker does the inference.
// ---------------------------------------------------------------
const SPEECH_PRIORITY = { marry: 10, gift: 5, ambient: 1 };

function announce(text, priority = SPEECH_PRIORITY.gift, meta = {}) {
  if (state.config.speech === false) return null;
  const clean = tts.normalize(text);
  if (!clean) return null;

  // Explicit opt-out: let the overlay use the browser voice instead.
  if ((state.config.ttsEngine || 'kokoro') === 'browser') {
    broadcast('tts-fallback', { text: clean, priority, ...meta });
    return null;
  }

  const id = `mc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return tts.speak({
    text: clean,
    voice: state.config.ttsVoice || 'af_heart',
    speed: Number(state.config.ttsSpeed) || Number(state.config.voiceRate) || 0.98
  }).then((result) => {
    broadcast('tts', {
      id,
      url: result.url,
      text: clean,
      priority,
      durationMs: result.durationMs,
      cached: result.cached,
      ...meta
    });
    return result;
  }).catch((err) => {
    // Kokoro is verified first; if it fails we still want the MC to be heard.
    console.error('[TTS] Kokoro failed, falling back to browser voice:', err.message);
    broadcast('tts-fallback', { text: clean, priority, error: err.message, ...meta });
    return null;
  });
}

// ---------------------------------------------------------------
// AI MC TEXT (opt-in; default off so the live flow stays byte-identical)
// ---------------------------------------------------------------
function aiMcSystemPrompt() {
  return [
    'You are a funny, warm wedding MC on a TikTok livestream.',
    'Answer in ENGLISH, because the TTS voice is English.',
    'At most 28 words, one natural exclamation, no quotation marks, no emoji, no hashtags.',
    'Address the guest by name.'
  ].join(' ');
}

function aiMcPrompt(ctx) {
  const lines = [
    'Bride: ' + (ctx.bride || ''),
    'Groom: ' + (ctx.groom || ''),
    'Guest: ' + ctx.name,
    'Gift: ' + ctx.count + ' x ' + ctx.gift
  ];
  if (ctx.becameGroom) {
    lines.push('The guest just outbid everyone and became the NEW GROOM (previous groom: ' + (ctx.previousGroom || 'unknown') + ').');
    lines.push('Announce the crown transfer with excitement.');
  } else {
    lines.push('Write a thank-you line for this gift.');
  }
  return lines.join('\n');
}

// ========================================================
// CORE EVENT PROCESSORS (Dùng chung cho TikFinity, Webhook, Demo)
// ========================================================

function processJoinEvent(user) {
  if (!user || !user.id || user.id === 'unknown') return;
  const id = 'tik-' + user.id;
  let person = state.people.find(p => p.id === id);
  if (!person) {
    const seatIdx = state.people.length;
    person = {
      id,
      name: user.name || 'Guest',
      avatar: user.avatar || '',
      sprite: Math.floor(Math.random() * 6),
      table: Math.floor(seatIdx / 2) % 6,
      seat: seatIdx % 2,
      statusTag: '✨ Guest'
    };
    state.people.push(person);
    state.stats.guests++;
  }
  broadcast('activity', { type: 'join', id, name: person.name, avatar: person.avatar });
  broadcast('state', state);
  persistState();
}

function processChatEvent(chat) {
  if (!chat || !chat.id || chat.id === 'unknown') return;
  const id = 'tik-' + chat.id;
  const name = chat.name || 'Guest';
  const comment = String(chat.comment || '').trim();
  if (!comment) return;

  let person = state.people.find(p => p.id === id);
  if (!person) {
    const seatIdx = state.people.length;
    person = {
      id,
      name,
      avatar: chat.avatar || '',
      sprite: Math.floor(Math.random() * 6),
      table: Math.floor(seatIdx / 2) % 6,
      seat: seatIdx % 2,
      statusTag: '✨ Guest'
    };
    state.people.push(person);
    state.stats.guests++;
  }
  state.stats.wishes++;

  // Check keywords for action triggers
  const lower = comment.toLowerCase();
  let triggeredAction = null;
  // Vietnamese triggers are kept unchanged; English aliases are added so the English
  // overlay guide works for an international audience. First match still wins.
  if (lower.includes('hôn') || lower.includes('hon') || lower.includes('kiss')) triggeredAction = 'kiss';
  else if (lower.includes('dzô') || lower.includes('dzo') || lower.includes('zô') || lower.includes('cụng ly') || lower.includes('cheer')) triggeredAction = 'cheers';
  else if (lower.includes('nhảy') || lower.includes('nhay') || lower.includes('quẩy') || lower.includes('dance')) triggeredAction = 'dance';
  else if (lower.includes('bánh') || lower.includes('banh') || lower.includes('cake')) triggeredAction = 'cake';
  else if (lower.includes('rượu') || lower.includes('ruou') || lower.includes('sâm panh') || lower.includes('champagne') || lower.includes('wine')) triggeredAction = 'champagne';
  else if (lower.includes('hoa') || lower.includes('canh hoa') || lower.includes('rose') || lower.includes('flower') || lower.includes('petal')) triggeredAction = 'petal';

  broadcast('activity', { type: 'chat', id, name, comment, avatar: person.avatar, triggeredAction });
  if (triggeredAction) {
    broadcast('action', { action: triggeredAction, initiator: name });
  }
  broadcast('state', state);
  persistState();
}

function processGiftEvent(giftData) {
  if (!giftData || !giftData.id || giftData.id === 'unknown') return null;
  const id = 'tik-' + giftData.id;
  const name = giftData.name || 'Gift Sender';
  const gift = giftData.gift || 'Wedding Gift';
  const count = Math.max(1, Number(giftData.count) || 1);
  const diamonds = Math.max(1, Number(giftData.diamonds) || 1);
  const totalCoins = count * diamonds;

  state.stats.envelopes += count;

  // Update goals
  if (/hoa|rose|flower/i.test(gift)) {
    state.goals.rose.current = Math.min(state.goals.rose.target * 2, state.goals.rose.current + count);
  }
  state.goals.cake.current = Math.min(state.goals.cake.target * 2, state.goals.cake.current + totalCoins * 100);

  // Update donor score
  if (!state.scores[id]) {
    state.scores[id] = { id, name, total: 0, avatar: giftData.avatar || '' };
  }
  state.scores[id].total += totalCoins;
  state.scores[id].name = name;

  // Ensure person exists in room
  let person = state.people.find(p => p.id === id);
  if (!person) {
    const seatIdx = state.people.length;
    person = {
      id,
      name,
      avatar: giftData.avatar || '',
      sprite: Math.floor(Math.random() * 6),
      table: Math.floor(seatIdx / 2) % 6,
      seat: seatIdx % 2,
      statusTag: '👑 Big Spender'
    };
    state.people.push(person);
    state.stats.guests++;
  } else {
    person.statusTag = '👑 Big Spender';
  }

  // Add to recent givers
  const giverRecord = { id, name, gift, count, diamonds, total: totalCoins };
  state.recentGivers = [giverRecord, ...state.recentGivers.filter(g => g.id !== id)].slice(0, 8);

  // MARRIAGE AUCTION LOGIC: If coins >= minCoinsToMarry (default 10 xu)
  const minMarry = Number(state.config.minCoinsToMarry) || 10;
  let becameGroom = false;
  const previousGroom = state.config.groom;
  let funnyMessage = '';

  if (state.config.enableMarryAuction !== false && totalCoins >= minMarry) {
    becameGroom = true;
    state.config.groom = name; // Donor becomes the Groom!
    const marryJokes = state.config.marryJokes || defaultState.config.marryJokes;
    const template = marryJokes[Math.floor(Math.random() * marryJokes.length)];
    funnyMessage = template
      .replace('{name}', name)
      .replace('{count}', count)
      .replace('{gift}', gift)
      .replace('{groom}', name)
      .replace('{bride}', state.config.bride);
  } else {
    const jokes = state.config.funnyJokes || defaultState.config.funnyJokes;
    const template = jokes[Math.floor(Math.random() * jokes.length)];
    funnyMessage = template
      .replace('{name}', name)
      .replace('{count}', count)
      .replace('{gift}', gift)
      .replace('{groom}', state.config.groom)
      .replace('{bride}', state.config.bride);
  }

  persistState();

  // Broadcast offering focus ceremony
  const offeringEvent = {
    id,
    name,
    gift,
    count,
    diamonds,
    total: totalCoins,
    avatar: giftData.avatar || '',
    prayer: (becameGroom ? `💍 ${name} is officially the new Groom!` : 'A hundred years of happy marriage'),
    becameGroom,
    previousGroom,
    isRobbed: becameGroom && previousGroom && previousGroom !== name,
    funnyMessage
  };

  broadcast('focus', offeringEvent);

  // MC voice: the crown announcement outranks an ordinary thank-you.
  // The scripted line is used unless the admin turned AI text on; the focus/state
  // SSE payloads above are untouched either way.
  const speechPriority = becameGroom ? SPEECH_PRIORITY.marry : SPEECH_PRIORITY.gift;
  const speechMeta = { kind: becameGroom ? 'marry' : 'gift', name, gift, count };
  const textTask = becameGroom ? 'marry_crown' : 'gift_thankyou';
  if (ai.isTextGenerationEnabled(textTask)) {
    const settings = ai.getTextSettings();
    const aiTimeout = Number(settings.timeoutMs) || 5000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), aiTimeout);
    ai.generateText({
      task: textTask,
      systemPrompt: aiMcSystemPrompt(),
      prompt: aiMcPrompt({
        name,
        gift,
        count,
        groom: state.config.groom,
        bride: state.config.bride,
        becameGroom,
        previousGroom
      }),
      timeout: aiTimeout,
      maxTokens: Number(settings.maxTokens) || 120,
      temperature: Number(settings.temperature) || 0.8,
      signal: controller.signal
    }).then((result) => {
      announce(result.text, speechPriority, { ...speechMeta, ai: true, providerId: result.providerId, model: result.model });
    }).catch(() => {
      // Any AI failure keeps the show running with the scripted line.
      announce(funnyMessage, speechPriority, speechMeta);
    }).finally(() => clearTimeout(timer));
  } else {
    announce(funnyMessage, speechPriority, speechMeta);
  }

  if (becameGroom) {
    broadcast('action', {
      action: 'marry',
      initiator: name,
      previousGroom,
      text: `🎉 CONGRATULATIONS ${name} — YOU ARE THE NEW GROOM! 💕`
    });
  } else if (/hoa|rose|flower/i.test(gift)) {
    broadcast('action', { action: 'petal', initiator: name });
  } else if (/bánh|cake/i.test(gift)) {
    broadcast('action', { action: 'cake', initiator: name });
  } else if (/rượu|champagne|wine/i.test(gift)) {
    broadcast('action', { action: 'champagne', initiator: name });
  }

  broadcast('state', state);
  return offeringEvent;
}

// ========================================================
// TIKFINITY DESKTOP WEBSOCKET CLIENT (1-Click như PhatMT)
// ========================================================

class TikFinityClient extends EventEmitter {
  constructor({ endpoint = 'ws://127.0.0.1:21213/' } = {}) {
    super();
    this.endpoint = endpoint;
    this.closed = false;
    this.socket = null;
    this.seen = new Set();
    this.roomId = '';
    this.hostId = '';
  }

  status(stateName, message) {
    if (stateName === 'connected') {
      message = this.hostId
        ? `Đã kết nối thành công @${this.hostId}${this.roomId ? ` · ID phòng: ${this.roomId}` : ''}`
        : (this.roomId ? `Đã kết nối thành công · ID phòng: ${this.roomId}` : 'Đã kết nối thành công TikFinity · Đang nhận dữ liệu LIVE');
    }
    this.emit('status', { state: stateName, message, username: this.hostId, roomId: this.roomId, mode: 'tikfinity' });
  }

  roomInfo(e) {
    const n = e.data || {};
    const r = n.roomInfo || n.room || e.roomInfo || {};
    const s = r.owner || n.host || {};
    const i = s.uniqueId || s.unique_id;
    const o = n.common?.roomId || n.common?.room_id || n.roomId || n.room_id || r.id || r.roomId;
    if (typeof i === 'string' && /^[\w.]{2,64}$/.test(i.replace(/^@/, ''))) {
      this.hostId = i.replace(/^@/, '');
    }
    if ((typeof o === 'string' || typeof o === 'number') && /^\d{5,30}$/.test(String(o))) {
      this.roomId = String(o);
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      let isConnected = false;
      let isSettled = false;
      let ws;

      const fail = (err) => {
        clearTimeout(timer);
        if (!isSettled) {
          isSettled = true;
          reject(err || new Error('Chưa kết nối được TikFinity Desktop. Hãy mở ứng dụng TikFinity Desktop và bấm Connect phòng LIVE trước.'));
        }
      };

      try {
        ws = new WebSocket(this.endpoint);
      } catch (err) {
        return fail(err);
      }
      this.socket = ws;

      const timer = setTimeout(() => {
        fail();
        try { ws.close(); } catch {}
      }, 7000);

      ws.addEventListener('open', () => {
        clearTimeout(timer);
        if (this.closed) {
          try { ws.close(); } catch {}
          fail();
          return;
        }
        isConnected = true;
        isSettled = true;
        this.status('waiting', 'Đã kết nối TikFinity! Đang chờ bình luận/quà từ phòng LIVE bạn chọn trong TikFinity.');
        resolve();
      });

      ws.addEventListener('message', async ({ data }) => {
        if (!this.closed) {
          try {
            const text = typeof data === 'string' ? data : (data.text ? await data.text() : data.toString());
            this.handleMessage(JSON.parse(text));
          } catch {}
        }
      });

      ws.addEventListener('error', () => {
        if (!isConnected) fail();
      });

      ws.addEventListener('close', () => {
        clearTimeout(timer);
        if (!this.closed) {
          if (isConnected) {
            this.emit('disconnected');
          } else {
            fail();
          }
        }
      });
    });
  }

  handleMessage(msg) {
    if (this.closed || !msg || typeof msg !== 'object') return;
    const n = msg.event;
    const r = msg.data;
    if (r) this.roomInfo(msg);
    if (!r || !['chat', 'gift', 'member', 'join', 'leave', 'memberLeave', 'userLeave'].includes(n)) return;

    const s = String(r.msgId || r.common?.msgId || '');
    const i = n + '|' + s;
    if (s && s !== '0') {
      if (this.seen.has(i)) return;
      this.seen.add(i);
      if (this.seen.size > 5000) {
        this.seen.delete(this.seen.values().next().value);
      }
    }

    if (['leave', 'memberLeave', 'userLeave'].includes(n)) {
      const u = this.parseUser(r);
      if (u.id !== 'unknown') this.emit('leave', u);
      return;
    }
    if (n === 'member' || n === 'join') {
      const u = this.parseUser(r);
      if (u.id === 'unknown') return;
      this.status('connected', `TikFinity đang gửi sự kiện: ${u.name} vào phòng`);
      this.emit('join', u);
      return;
    }
    if (n === 'chat') {
      const u = this.parseUser(r);
      const comment = String(r.comment || r.content || '').slice(0, 500);
      if (u.id === 'unknown' || !comment) return;
      this.status('connected', `TikFinity đang nhận bình luận LIVE`);
      this.emit('chat', { ...u, comment });
      return;
    }
    if (n === 'gift') {
      const g = this.parseGift(r);
      if (!g || g.id === 'unknown') return;
      this.status('connected', `TikFinity đang nhận quà LIVE: ${g.name} mừng ${g.gift}`);
      this.emit('gift', g);
    }
  }

  parseUser(t) {
    const e = t.user || t;
    const urls = e.profilePicture?.urls || e.profilePicture?.urlList || e.avatarThumb?.urlList || e.avatarLarge?.urlList || [];
    return {
      id: String(e.userId || e.idStr || e.id || e.uniqueId || e.displayId || 'unknown'),
      name: String(e.nickname || e.uniqueId || e.displayId || 'Guest').slice(0, 60),
      avatar: String(urls[0] || e.profilePictureUrl || '')
    };
  }

  parseGift(t) {
    const e = t.giftDetails || t.gift || {};
    const n = t.extendedGiftInfo || {};
    if (Number(e.giftType ?? e.type ?? t.giftType) === 1 && !t.repeatEnd) {
      return null;
    }
    return {
      ...this.parseUser(t),
      gift: String(e.giftName || e.name || n.name || t.giftName || `Gift ${t.giftId || ''}`),
      giftId: String(t.giftId || e.id || ''),
      count: Math.max(1, Number(t.repeatCount || t.count) || 1),
      diamonds: Math.max(1, Number(e.diamondCount ?? n.diamond_count ?? t.diamondCount ?? t.diamonds) || 1)
    };
  }

  async disconnect() {
    this.closed = true;
    const ws = this.socket;
    this.socket = null;
    if (ws && ws.readyState < 2) {
      try { ws.close(); } catch {}
    }
  }
}

let activeTikFinityClient = null;
let tikfinityReconnectTimer = null;
let userDisconnected = false;

async function disconnectTikFinity() {
  userDisconnected = true;
  clearTimeout(tikfinityReconnectTimer);
  tikfinityReconnectTimer = null;
  if (activeTikFinityClient) {
    const c = activeTikFinityClient;
    activeTikFinityClient = null;
    c.removeAllListeners();
    try { await c.disconnect(); } catch {}
  }
  state.status = { state: 'offline', message: 'Chưa kết nối. Hãy mở TikFinity Desktop trên máy này.', mode: 'tikfinity' };
  broadcast('status', state.status);
}

async function connectTikFinity() {
  userDisconnected = false;
  clearTimeout(tikfinityReconnectTimer);
  tikfinityReconnectTimer = null;
  if (activeTikFinityClient) {
    const c = activeTikFinityClient;
    activeTikFinityClient = null;
    c.removeAllListeners();
    try { await c.disconnect(); } catch {}
  }

  state.status = { state: 'connecting', message: 'Đang kết nối TikFinity Desktop (cổng 21213)...', mode: 'tikfinity' };
  broadcast('status', state.status);

  const client = new TikFinityClient({ endpoint: 'ws://127.0.0.1:21213/' });
  activeTikFinityClient = client;

  client.on('status', s => {
    state.status = s;
    broadcast('status', s);
  });

  client.on('chat', chat => {
    processChatEvent(chat);
  });

  client.on('gift', gift => {
    processGiftEvent(gift);
  });

  client.on('join', user => {
    processJoinEvent(user);
  });

  client.on('disconnected', () => {
    state.status = { state: 'offline', message: 'Mất kết nối TikFinity Desktop. Kiểm tra ứng dụng TikFinity Desktop trên máy.', mode: 'tikfinity' };
    broadcast('status', state.status);
    if (!userDisconnected) {
      // Tự động thử lại sau 6s
      tikfinityReconnectTimer = setTimeout(() => {
        if (!userDisconnected && !activeTikFinityClient) {
          connectTikFinity().catch(() => {});
        }
      }, 6000);
    }
  });

  await client.connect();
}

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon'
};

// ========================================================
// AI PROVIDER MANAGER API (/api/ai/*)
// Same-origin + rate limited. API keys never leave the server.
// ========================================================
const AI_RATE = new Map();

function clientIp(req) {
  return (req.socket && req.socket.remoteAddress) || 'local';
}

function aiRateAllow(req, bucket, limit) {
  const key = bucket + ':' + clientIp(req);
  const now = Date.now();
  const entry = AI_RATE.get(key);
  if (!entry || now > entry.reset) {
    AI_RATE.set(key, { count: 1, reset: now + 60000 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // curl / server-side callers send no Origin header
  try {
    return new URL(origin).host === String(req.headers.host || '');
  } catch {
    return false;
  }
}

function readBodyLimited(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new AiManagerError(AI_CODE.INVALID_REQUEST, 'dữ liệu gửi lên quá lớn'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function aiErrorStatus(code) {
  if (code === AI_CODE.CONFIG || code === AI_CODE.INVALID_REQUEST || code === AI_CODE.BLOCKED) return 400;
  if (code === AI_CODE.CANCELLED) return 499;
  if (code === AI_CODE.TIMEOUT) return 504;
  return 502;
}

async function handleAiRoutes(req, res, pathname, url) {
  if (!isSameOrigin(req)) {
    sendJson(res, 403, { ok: false, error: 'Yêu cầu khác nguồn đã bị từ chối.' });
    return true;
  }
  const write = req.method !== 'GET';
  // Generous enough for the dashboard (which saves several settings in a row)
  // but still a wall against a runaway loop or a hostile page.
  if (!aiRateAllow(req, write ? 'ai:write' : 'ai:read', write ? 120 : 600)) {
    sendJson(res, 429, { ok: false, error: 'Quá nhiều yêu cầu AI. Vui lòng thử lại sau 1 phút.' });
    return true;
  }

  try {
    if (pathname === '/api/ai/providers' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, ...ai.listProviders(), status: ai.getProviderStatus() });
      return true;
    }

    if (pathname === '/api/ai/providers' && req.method === 'POST') {
      const body = await readBodyLimited(req, 32 * 1024);
      sendJson(res, 200, { ok: true, provider: ai.addProvider(body) });
      return true;
    }

    const match = pathname.match(/^\/api\/ai\/providers\/([^/]+)(?:\/([a-z-]+))?$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const action = match[2] || '';

      if (!action && req.method === 'DELETE') {
        ai.removeProvider(id);
        sendJson(res, 200, { ok: true });
        return true;
      }
      if (!action && (req.method === 'PATCH' || req.method === 'PUT' || req.method === 'POST')) {
        const body = await readBodyLimited(req, 32 * 1024);
        sendJson(res, 200, { ok: true, provider: ai.updateProvider(id, body) });
        return true;
      }
      if (req.method === 'POST' && action === 'enable') {
        sendJson(res, 200, { ok: true, provider: ai.enableProvider(id) });
        return true;
      }
      if (req.method === 'POST' && action === 'disable') {
        sendJson(res, 200, { ok: true, provider: ai.disableProvider(id) });
        return true;
      }
      if (req.method === 'POST' && action === 'test-connection') {
        sendJson(res, 200, { ok: true, result: await ai.testConnection(id) });
        return true;
      }
      if (req.method === 'POST' && action === 'test-generation') {
        const body = await readBodyLimited(req, 32 * 1024);
        sendJson(res, 200, { ok: true, result: await ai.testGeneration(id, body) });
        return true;
      }
      if (req.method === 'GET' && action === 'models') {
        const refresh = url.searchParams.get('refresh') === '1';
        sendJson(res, 200, { ok: true, ...(await ai.listModels(id, { refresh })) });
        return true;
      }
      sendJson(res, 404, { ok: false, error: 'Không tìm thấy thao tác AI.' });
      return true;
    }

    if (pathname === '/api/ai/default' && req.method === 'POST') {
      const body = await readBodyLimited(req, 8 * 1024);
      sendJson(res, 200, { ok: true, ...ai.setDefaultProvider(body.providerId) });
      return true;
    }

    if (pathname === '/api/ai/fallback' && req.method === 'POST') {
      const body = await readBodyLimited(req, 8 * 1024);
      sendJson(res, 200, { ok: true, fallback: ai.updateFallback(body) });
      return true;
    }

    if (pathname === '/api/ai/text-settings' && req.method === 'POST') {
      const body = await readBodyLimited(req, 8 * 1024);
      sendJson(res, 200, { ok: true, text: ai.updateTextSettings(body) });
      return true;
    }

    if (pathname === '/api/ai/status' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, status: ai.getProviderStatus() });
      return true;
    }

    if (pathname === '/api/ai/usage' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, ...ai.getUsageStatistics() });
      return true;
    }

    if (pathname === '/api/ai/usage' && req.method === 'DELETE') {
      ai.clearUsage();
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (pathname === '/api/ai/generate' && req.method === 'POST') {
      const body = await readBodyLimited(req, 32 * 1024);
      const result = await ai.generateText({
        task: body.task,
        prompt: body.prompt,
        systemPrompt: body.systemPrompt,
        provider: body.provider,
        model: body.model,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        timeout: body.timeout,
        metadata: body.metadata
      });
      sendJson(res, 200, { ok: true, result });
      return true;
    }

    sendJson(res, 404, { ok: false, error: 'Không tìm thấy API AI.' });
    return true;
  } catch (err) {
    const code = err && err.code ? err.code : AI_CODE.UNKNOWN;
    sendJson(res, aiErrorStatus(code), {
      ok: false,
      code,
      error: err && err.message ? err.message : 'Lỗi không xác định',
      attempts: err && err.attempts ? err.attempts : undefined
    });
    return true;
  }
}

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Helper read JSON body
  const readJson = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { resolve({}); }
    });
  });

  // 0. AI Provider Manager API (same-origin, rate limited, keys stay server-side)
  if (pathname.startsWith('/api/ai/')) {
    if (await handleAiRoutes(req, res, pathname, url)) return;
  }

  // 1. SSE Events Stream
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
    res.write(`event: status\ndata: ${JSON.stringify(state.status || { state: 'offline', message: 'Chưa kết nối TikFinity' })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // 2. License Status
  if (pathname === '/api/license/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      valid: true,
      plan: 'pro',
      status: 'active',
      licenseKey: 'WEDDING-PRO-2026-VIP',
      expiresAt: '2099-12-31'
    }));
    return;
  }

  // 3. State API
  if (pathname === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
    return;
  }

  // 4. Update Config
  if (pathname === '/api/config' && req.method === 'POST') {
    const data = await readJson();
    // The dashboard historically posted { config: {...} }; that used to be stored
    // as a nested, dead state.config.config. Accept both shapes, store flat.
    const patch = (data && typeof data.config === 'object' && data.config !== null) ? data.config : data;
    state.config = {
      ...state.config,
      ...patch,
      bgm: { ...state.config.bgm, ...((patch && patch.bgm) || {}) }
    };
    persistState();
    broadcast('state', state);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, config: state.config }));
    return;
  }

  // 5. Trigger Action
  if (pathname === '/api/action' && req.method === 'POST') {
    const data = await readJson();
    broadcast('action', data);
    // A manually triggered crown transfer is announced at top priority.
    if (data && data.action === 'marry') {
      announce(data.text || 'A new groom has taken the crown!', SPEECH_PRIORITY.marry, { kind: 'marry' });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, action: data }));
    return;
  }

  // 6. Update BGM
  if (pathname === '/api/bgm' && req.method === 'POST') {
    const data = await readJson();
    if (!state.config.bgm) state.config.bgm = { ...defaultState.config.bgm };

    if (data.youtubeUrl !== undefined) {
      state.config.bgm.youtubeUrl = String(data.youtubeUrl);
      let vid = '';
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
      const match = state.config.bgm.youtubeUrl.match(regExp);
      if (match && match[2].length === 11) {
        vid = match[2];
      }
      state.config.bgm.youtubeId = vid;
    }
    if (data.title !== undefined) state.config.bgm.title = String(data.title);
    if (data.volume !== undefined) state.config.bgm.volume = Math.max(0, Math.min(100, Number(data.volume) || 50));
    if (data.playing !== undefined) state.config.bgm.playing = Boolean(data.playing);
    if (data.enabled !== undefined) state.config.bgm.enabled = Boolean(data.enabled);

    persistState();
    broadcast('state', state);
    broadcast('bgm', state.config.bgm);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, bgm: state.config.bgm }));
    return;
  }

  // 7. Demo / Test triggers
  if (pathname === '/api/demo' && req.method === 'POST') {
    const data = await readJson();
    if (data.type === 'chat') {
      const chatEvent = {
        id: data.id || ('demo-user-' + Date.now()),
        name: data.name || 'Guest',
        comment: data.comment || 'Happy hundred years to you both!',
        avatar: data.avatar || ''
      };
      processChatEvent(chatEvent);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, chat: chatEvent }));
      return;
    }

    if (data.type === 'gift') {
      const offeringEvent = processGiftEvent({
        id: data.id || ('demo-giver-' + Date.now()),
        name: data.name || 'Mystery Big Spender',
        gift: data.gift || 'Wedding Envelope',
        count: Math.max(1, Number(data.count) || 1),
        diamonds: Math.max(1, Number(data.diamonds) || 1),
        avatar: data.avatar || ''
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, offeringEvent, becameGroom: offeringEvent?.becameGroom }));
      return;
    }

    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown demo type' }));
    return;
  }

  // 8. TIKFINITY 1-CLICK CONNECT (Giống PhatMT)
  if (pathname === '/api/connect' && req.method === 'POST') {
    try {
      await connectTikFinity();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, status: state.status }));
    } catch (err) {
      state.status = { state: 'error', message: err.message || 'Lỗi kết nối TikFinity Desktop', mode: 'tikfinity' };
      broadcast('status', state.status);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message, status: state.status }));
    }
    return;
  }

  // 9. TIKFINITY DISCONNECT
  if (pathname === '/api/disconnect' && req.method === 'POST') {
    await disconnectTikFinity();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, status: state.status }));
    return;
  }

  // 10. TIKFINITY STATUS
  if (pathname === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state.status || { state: 'offline', message: 'Chưa kết nối TikFinity' }));
    return;
  }

  // 11. TikFinity Webhook (Phương án dự phòng)
  if (pathname === '/api/tikfinity' && req.method === 'POST') {
    const data = await readJson();
    if (data.event === 'chat' || data.comment) {
      processChatEvent({
        id: data.uniqueId || data.userId || data.name || 'guest',
        name: data.nickname || data.uniqueId || data.name || 'Guest',
        comment: data.comment || data.text || '',
        avatar: data.profilePictureUrl || data.avatar || ''
      });
    } else if (data.event === 'gift' || data.giftId || data.giftName) {
      processGiftEvent({
        id: data.uniqueId || data.userId || data.name || 'donor',
        name: data.nickname || data.uniqueId || data.name || 'Gift Sender',
        gift: data.giftName || data.gift || 'Wedding Gift',
        count: Number(data.repeatCount || data.count) || 1,
        diamonds: Number(data.diamondCount || data.diamonds) || 1,
        avatar: data.profilePictureUrl || data.avatar || ''
      });
    } else if (data.event === 'member' || data.event === 'join') {
      processJoinEvent({
        id: data.uniqueId || data.userId || data.name || 'guest',
        name: data.nickname || data.uniqueId || data.name || 'Guest',
        avatar: data.profilePictureUrl || data.avatar || ''
      });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // 12. Reset State
  if (pathname === '/api/reset' && req.method === 'POST') {
    state.people = [];
    state.scores = {};
    state.recentGivers = [];
    state.stats.guests = 1;
    state.stats.envelopes = 0;
    state.stats.wishes = 0;
    state.goals.rose.current = 0;
    state.goals.cake.current = 0;
    persistState();
    broadcast('state', state);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, state }));
    return;
  }

  // 13. Speech Proxy (Google Translate TTS / Server voice fallback)
  if (pathname === '/api/speech' && req.method === 'POST') {
    const data = await readJson();
    const text = String(data.text || '').trim();
    if (!text || text.length > 300) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Text length must be 1-300 chars' }));
      return;
    }
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=vi&client=tw-ob`;
    https.get(ttsUrl, (ttsRes) => {
      if (ttsRes.statusCode === 200) {
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=86400'
        });
        ttsRes.pipe(res);
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Google TTS failed' }));
      }
    }).on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // 13b. KOKORO TTS: status
  if (pathname === '/api/tts/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      ...tts.status(),
      voice: state.config.ttsVoice || 'af_heart',
      speed: Number(state.config.ttsSpeed) || 0.98,
      enabled: state.config.speech !== false,
      engineSelected: state.config.ttsEngine || 'kokoro'
    }));
    return;
  }

  // 13c. KOKORO TTS: preview (dashboard test button)
  if (pathname === '/api/tts/preview' && req.method === 'POST') {
    const data = await readJson();
    const text = tts.normalize(data.text || state.config.thanksTemplate || 'Welcome to the wedding!');
    const voice = data.voice || state.config.ttsVoice || 'af_heart';
    const speed = Number(data.speed) || Number(state.config.ttsSpeed) || 0.98;
    if (!text) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Nội dung đọc thử đang trống' }));
      return;
    }
    try {
      const result = await tts.speak({ text, voice, speed });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        url: result.url,
        text: result.text,
        voice,
        speed,
        cached: result.cached,
        durationMs: result.durationMs
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Không tạo được giọng đọc' }));
    }
    return;
  }

  // 13d. KOKORO TTS: generated WAV files (SHA-1 named, immutable)
  if (pathname.startsWith('/api/tts/audio/') && req.method === 'GET') {
    const name = path.basename(decodeURIComponent(pathname.slice('/api/tts/audio/'.length)));
    if (!/^[a-f0-9]{40}\.wav$/.test(name)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Tên tệp âm thanh không hợp lệ' }));
      return;
    }
    const file = path.join(__dirname, 'tts', 'cache', name);
    fs.stat(file, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Không tìm thấy tệp âm thanh' }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': stats.size,
        'Cache-Control': 'public, max-age=604800, immutable'
      });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }

  // 13e. KOKORO TTS: clear the audio cache
  if (pathname === '/api/tts/cache' && req.method === 'DELETE') {
    let removed = 0;
    try {
      for (const f of fs.readdirSync(path.join(__dirname, 'tts', 'cache'))) {
        if (f.endsWith('.wav')) {
          fs.unlinkSync(path.join(__dirname, 'tts', 'cache', f));
          removed++;
        }
      }
    } catch (e) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, removed }));
    return;
  }

  // 14. Serve Static Files from public/
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext.match(/\.(png|jpg|jpeg|webp|woff2?|mp3)$/) ? 'public, max-age=3600' : 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Tiệc Cưới Online Server running on http://localhost:${PORT}`);
  // Pre-load the Kokoro model in the worker so the first gift is not the slow one.
  setTimeout(() => {
    try { tts.warm(); } catch (e) { console.error('[TTS] warm-up failed:', e.message); }
  }, 2500);
});

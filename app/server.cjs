const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const EventEmitter = require('node:events');

const PORT = Number(process.env.PORT) || 3003;
const STATE_FILE = path.join(__dirname, 'wedding_state.json');

// Default initial state with Marriage Auction & Funny Teasing Voice
const defaultState = {
  config: {
    groom: "Tuấn Anh",
    bride: "Mai Vy",
    title: "TIỆC CƯỚI ONLINE",
    slogan: "Trăm Năm Hạnh Phúc",
    date: "2026-11-03",
    showRosePetals: true,
    showHearts: true,
    showFireworks: true,
    showBubbles: true,
    speech: true,
    voice: "vi-VN-HoaiMyNeural",
    speechMode: "browser",
    volume: 0.9,
    voicePitch: 1.25,
    voiceRate: 1.08,
    soundEffects: true,
    enableMarryAuction: true,
    minCoinsToMarry: 10,
    funnyVoiceEnabled: true,
    bgm: {
      enabled: true,
      youtubeUrl: "https://www.youtube.com/watch?v=w4Z01V4uFz8",
      youtubeId: "w4Z01V4uFz8",
      title: "Hòa Tấu Đám Cưới Lãng Mạn (Piano & Violin)",
      volume: 50,
      playing: true
    },
    thanksTemplate: "Cảm ơn bạn {name} đã mừng {count} {gift} cho cô dâu {bride} và chú rể {groom}! Chúc bạn và gia đình dồi dào sức khỏe, vạn sự như ý!",
    funnyJokes: [
      "Úi giời ơi tin được không! Đại gia {name} vừa mừng hẳn {count} {gift}! Đẹp trai nhiều tiền thế này bảo sao cô dâu mê tít!",
      "U là trời! Cảm ơn bạn {name} nha! Mừng cưới xịn xò thế này thì tối nay cô dâu chú rể đếm tiền mỏi tay luôn rồi!",
      "Bạn {name} chơi lớn quá! Mừng {count} {gift} chất lừ! Chúc bạn ăn cỗ no say, sớm tìm được người yêu để năm sau tới lượt mình nha!",
      "Đẳng cấp thực sự bà con ơi! Bạn {name} vừa mừng {count} {gift}! Xứng đáng có mười người yêu xếp hàng tỏ tình!",
      "Cảm ơn bạn {name} nhiều nha! Say rượu thì về chứ say tình là ở lại chung vui tới bến luôn nhé!",
      "Quá đã luôn bà con ơi! Bạn {name} vừa lên đồ mừng quà cực đỉnh! Cạn ly một trăm phần trăm vì bạn {name} nào!"
    ],
    marryJokes: [
      "Báo động hỷ sự bà con ơi! Bạn {name} vừa mừng {count} {gift} và chính thức cướp được chú rể về dinh rồi nha! Chúc mừng tân lang mới!",
      "Trời ơi đất hỡi! Bạn {name} vừa ra tay tặng quà khủng, soán ngôi chú rể thành công mỹ mãn! Cạn ly chúc mừng tân lang!",
      "Tin chấn động hôn trường! Bạn {name} vừa chính thức trở thành chú rể đẹp trai bên cạnh cô dâu! Chúc hai bạn trăm năm hạnh phúc, sớm sinh quý tử nha!"
    ],
    wishes: [
      "Chúc hai bạn trăm năm hạnh phúc, đầu bạc răng long!",
      "Chúc tân lang tân nương tình nồng ý thắm, sớm sinh quý tử!",
      "Chúc đôi uyên ương hòa thuận gắn bó, gia đình hưng thịnh!",
      "Chúc mừng ngày vui đại hỷ, vạn sự cát tường, phúc lộc viên mãn!"
    ],
    giftSlots: [
      { id: 'rose', name: 'Mừng Phong Bì', coins: 1, action: 'envelope', prayer: 'Mừng phong bì cưới' },
      { id: 'peach', name: 'Mừng Chỉ Vàng', coins: 5, action: 'gold', prayer: 'Mừng 1 chỉ vàng' },
      { id: 'clarinet', name: 'Góp Vui Nhảy Múa', coins: 10, action: 'dance', prayer: 'Góp vui điệu nhảy' },
      { id: 'beer', name: 'Đãi Rượu Bàn', coins: 1, action: 'cheers', prayer: 'Đãi 1 bàn rượu' },
      { id: 'ring', name: 'Làm Chú Rể / Trao Nhẫn', coins: 10, action: 'ring', prayer: 'Trao nhẫn cưới' }
    ]
  },
  stats: {
    guests: 119,
    outside: 21,
    envelopes: 588,
    wishes: 175
  },
  goals: {
    rose: { current: 1670, target: 2532, label: 'Mưa hoa hồng' },
    cake: { current: 60300, target: 100000, label: 'Cắt bánh cưới' }
  },
  people: [
    // Phía bên trái (12 khách ngồi 4 hàng)
    { id: 'guest-1', name: 'Minh Thư', avatar: '', sprite: 4, table: 0, seat: 0, statusTag: '💍 Xin vía' },
    { id: 'guest-2', name: 'Nhà Đẹp Huy', avatar: '', sprite: 1, table: 1, seat: 1, statusTag: '🍗 Ăn cỗ' },
    { id: 'guest-3', name: 'Jamie', avatar: '', sprite: 2, table: 2, seat: 2, statusTag: '🍻 Cạn ly' },
    { id: 'guest-4', name: 'Linh', avatar: '', sprite: 5, table: 3, seat: 0, statusTag: '💃 Quẩy' },
    { id: 'guest-5', name: 'Em Bông', avatar: '', sprite: 3, table: 4, seat: 1, statusTag: '👀 Hóng biến' },
    { id: 'guest-6', name: 'Quang Nhật', avatar: '', sprite: 0, table: 5, seat: 2, statusTag: '🥂 Cụng ly' },
    { id: 'guest-7', name: 'Ánh Ngọc', avatar: '', sprite: 4, table: 6, seat: 0, statusTag: '✨ Đẹp đôi' },
    { id: 'guest-8', name: 'Mymy', avatar: '', sprite: 5, table: 7, seat: 1, statusTag: '💖 Chúc phúc' },
    { id: 'guest-9', name: 'Thanh Tùng', avatar: '', sprite: 2, table: 8, seat: 2, statusTag: '🍻 Dzô 100%' },
    { id: 'guest-10', name: 'Tuệ An', avatar: '', sprite: 3, table: 9, seat: 0, statusTag: '🌸 Ngọt ngào' },
    { id: 'guest-11', name: 'Mai Linh', avatar: '', sprite: 4, table: 10, seat: 1, statusTag: '👰 Bắt hoa' },
    { id: 'guest-12', name: 'Hồng Hạnh', avatar: '', sprite: 0, table: 11, seat: 2, statusTag: '🎉 Vui quá' },

    // Phía bên phải (12 khách ngồi 4 hàng)
    { id: 'guest-13', name: 'Quốc Bảo', avatar: '', sprite: 1, table: 12, seat: 0, statusTag: '🍾 Khui rượu' },
    { id: 'guest-14', name: 'Khánh Vy', avatar: '', sprite: 5, table: 13, seat: 1, statusTag: '💍 Xin vía' },
    { id: 'guest-15', name: 'Văn Đức', avatar: '', sprite: 2, table: 14, seat: 2, statusTag: '🍻 1 2 3 Dzô' },
    { id: 'guest-16', name: 'Hoàng Yến', avatar: '', sprite: 4, table: 15, seat: 0, statusTag: '✨ Chúc trăm năm' },
    { id: 'guest-17', name: 'Tấn Phát', avatar: '', sprite: 0, table: 16, seat: 1, statusTag: '🍗 Gà luộc' },
    { id: 'guest-18', name: 'Ngọc Trân', avatar: '', sprite: 3, table: 17, seat: 2, statusTag: '💖 Xinh gái' },
    { id: 'guest-19', name: 'Gia Hưng', avatar: '', sprite: 1, table: 18, seat: 0, statusTag: '💃 Nhảy bung nóc' },
    { id: 'guest-20', name: 'Bảo Nam', avatar: '', sprite: 2, table: 19, seat: 1, statusTag: '👑 Sắp tới lượt' },
    { id: 'guest-21', name: 'Diệu Nhi', avatar: '', sprite: 5, table: 20, seat: 2, statusTag: '💐 Chờ bắt hoa' },
    { id: 'guest-22', name: 'Hải Đăng', avatar: '', sprite: 0, table: 21, seat: 0, statusTag: '🍻 Uống cạn' },
    { id: 'guest-23', name: 'Trúc Ly', avatar: '', sprite: 4, table: 22, seat: 1, statusTag: '🎉 Quá rực rỡ' },
    { id: 'guest-24', name: 'Đức Quân', avatar: '', sprite: 1, table: 23, seat: 2, statusTag: '👑 Đại gia' }
  ],
  scores: {
    'donor-1': { id: 'donor-1', name: 'HOÀNG LONG', total: 7400000, avatar: '' },
    'donor-2': { id: 'donor-2', name: 'Xoan Nguyễn', total: 360000, avatar: '' },
    'donor-3': { id: 'donor-3', name: 'Minh Thư', total: 120000, avatar: '' },
    'donor-4': { id: 'donor-4', name: 'Vũ Hằng', total: 60200, avatar: '' },
    'donor-5': { id: 'donor-5', name: 'Phương Thảo', total: 60000, avatar: '' }
  },
  recentGivers: [
    { id: 'donor-1', name: 'HOÀNG LONG', gift: 'Nhẫn Kim Cương', count: 1, diamonds: 500 },
    { id: 'donor-2', name: 'Xoan Nguyễn', gift: 'Mừng Chỉ Vàng', count: 5, diamonds: 25 }
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
      name: user.name || 'Khách Quý',
      avatar: user.avatar || '',
      sprite: Math.floor(Math.random() * 6),
      table: Math.floor(seatIdx / 2) % 6,
      seat: seatIdx % 2,
      statusTag: '✨ Khách quý'
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
  const name = chat.name || 'Khách Mời';
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
      statusTag: '✨ Khách quý'
    };
    state.people.push(person);
    state.stats.guests++;
  }
  state.stats.wishes++;

  // Check keywords for action triggers
  const lower = comment.toLowerCase();
  let triggeredAction = null;
  if (lower.includes('hôn') || lower.includes('hon')) triggeredAction = 'kiss';
  else if (lower.includes('dzô') || lower.includes('dzo') || lower.includes('zô') || lower.includes('cụng ly')) triggeredAction = 'cheers';
  else if (lower.includes('nhảy') || lower.includes('nhay') || lower.includes('quẩy')) triggeredAction = 'dance';
  else if (lower.includes('bánh') || lower.includes('banh')) triggeredAction = 'cake';
  else if (lower.includes('rượu') || lower.includes('ruou') || lower.includes('sâm panh')) triggeredAction = 'champagne';
  else if (lower.includes('hoa') || lower.includes('canh hoa')) triggeredAction = 'petal';

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
  const name = giftData.name || 'Người Tặng';
  const gift = giftData.gift || 'Mừng Cưới';
  const count = Math.max(1, Number(giftData.count) || 1);
  const diamonds = Math.max(1, Number(giftData.diamonds) || 1);
  const totalCoins = count * diamonds;

  state.stats.envelopes += count;

  // Update goals
  if (/hoa|rose/i.test(gift)) {
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
      statusTag: '👑 Đại gia'
    };
    state.people.push(person);
    state.stats.guests++;
  } else {
    person.statusTag = '👑 Đại gia';
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
    prayer: (becameGroom ? `💍 ${name} chính thức làm Chú Rể mới!` : 'Mừng hạnh phúc trăm năm'),
    becameGroom,
    previousGroom,
    isRobbed: becameGroom && previousGroom && previousGroom !== name,
    funnyMessage
  };

  broadcast('focus', offeringEvent);
  if (becameGroom) {
    broadcast('action', {
      action: 'marry',
      initiator: name,
      previousGroom,
      text: `🎉 CHÚC MỪNG ${name} ĐÃ ĐẮT GIÁ LÀM CHÚ RỂ MỚI! 💕`
    });
  } else if (/hoa|rose/i.test(gift)) {
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
      name: String(e.nickname || e.uniqueId || e.displayId || 'Khách Mời').slice(0, 60),
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
      gift: String(e.giftName || e.name || n.name || t.giftName || `Quà ${t.giftId || ''}`),
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
    state.config = {
      ...state.config,
      ...data,
      bgm: { ...state.config.bgm, ...(data.bgm || {}) }
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
        name: data.name || 'Khách Mời',
        comment: data.comment || 'Chúc mừng hai bạn trăm năm hạnh phúc!',
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
        name: data.name || 'Đại Gia Giấu Tên',
        gift: data.gift || 'Mừng Phong Bì',
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
        name: data.nickname || data.uniqueId || data.name || 'Khách Mời',
        comment: data.comment || data.text || '',
        avatar: data.profilePictureUrl || data.avatar || ''
      });
    } else if (data.event === 'gift' || data.giftId || data.giftName) {
      processGiftEvent({
        id: data.uniqueId || data.userId || data.name || 'donor',
        name: data.nickname || data.uniqueId || data.name || 'Người Tặng',
        gift: data.giftName || data.gift || 'Mừng Cưới',
        count: Number(data.repeatCount || data.count) || 1,
        diamonds: Number(data.diamondCount || data.diamonds) || 1,
        avatar: data.profilePictureUrl || data.avatar || ''
      });
    } else if (data.event === 'member' || data.event === 'join') {
      processJoinEvent({
        id: data.uniqueId || data.userId || data.name || 'guest',
        name: data.nickname || data.uniqueId || data.name || 'Khách Quý',
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
});

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Live Clock
function updateClock() {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const clock = $('#live-clock');
  if (clock) clock.textContent = `🕒 ${timeStr}`;
}
setInterval(updateClock, 1000);
updateClock();

// Tab Navigation
$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    $$('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const target = $(`#${btn.dataset.tab}`);
    if (target) target.classList.add('active');
  });
});

// Copy Live Link
$('#btn-copy-link')?.addEventListener('click', () => {
  const url = `${location.origin}/overlay.html`;
  navigator.clipboard.writeText(url).then(() => {
    alert(`Đã sao chép link màn hình LIVE:\n${url}\n\nDán link này vào OBS Browser Source hoặc TikTok Live Studio!`);
  }).catch(() => {
    prompt('Link màn hình LIVE cho OBS / TikTok Studio:', url);
  });
});

// Copy Webhook Link
$('#btn-copy-webhook')?.addEventListener('click', () => {
  const url = `${location.origin}/api/tikfinity`;
  navigator.clipboard.writeText(url).then(() => {
    alert(`Đã sao chép Webhook URL:\n${url}`);
  });
});

// Refresh Preview Iframe
$('#btn-refresh-preview')?.addEventListener('click', () => {
  const iframe = $('#preview-iframe');
  if (iframe) iframe.src = `/overlay.html?v=${Date.now()}`;
});

// 1-Click Interactive Actions
async function sendAction(action) {
  try {
    await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
  } catch (e) {
    console.error('Action error:', e);
  }
}

$('#btn-action-steal-groom')?.addEventListener('click', () => sendAction('steal_groom'));
$('#btn-action-kiss')?.addEventListener('click', () => sendAction('kiss'));
$('#btn-action-cake')?.addEventListener('click', () => sendAction('cake'));
$('#btn-action-champagne')?.addEventListener('click', () => sendAction('champagne'));
$('#btn-action-cheers')?.addEventListener('click', () => sendAction('cheers'));
$('#btn-action-dance')?.addEventListener('click', () => sendAction('dance'));
$('#btn-action-petal')?.addEventListener('click', () => sendAction('petal'));

// Demo Simulator: Comments
$('#btn-send-sim-comment')?.addEventListener('click', async () => {
  const input = $('#sim-comment-input');
  const comment = input?.value?.trim() || 'Chúc mừng trăm năm hạnh phúc! 🎉';
  const names = ['Quinn', 'Sam', 'Ibeth', 'Taylor', 'Daniel', 'Casey', 'Michael'];
  const name = names[Math.floor(Math.random() * names.length)];

  await fetch('/api/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'comment', name, comment })
  });
});

// Quick Keyword Tags
$$('.tag-btn').forEach(tag => {
  tag.addEventListener('click', () => {
    const input = $('#sim-comment-input');
    if (input) input.value = tag.dataset.cmt;
    $('#btn-send-sim-comment')?.click();
  });
});

// Demo Simulator: Gifts
$$('.btn-gift').forEach(btn => {
  btn.addEventListener('click', async () => {
    const gift = btn.dataset.gift;
    const count = Number(btn.dataset.count) || 1;
    const diamonds = Number(btn.dataset.coins) || 1;
    const donors = ['Quinn', 'Daniel', 'Sam', 'Taylor', 'Michael', 'Casey'];
    const name = donors[Math.floor(Math.random() * donors.length)];

    await fetch('/api/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'gift', name, gift, count, diamonds })
    });
  });
});

// Save Couple Info
$('#btn-save-couple')?.addEventListener('click', async () => {
  const groom = $('#cfg-groom')?.value?.trim() || 'Sam';
  const bride = $('#cfg-bride')?.value?.trim() || 'Jennifer';
  const title = $('#cfg-title')?.value?.trim() || 'WEDDING ONLINE';
  const slogan = $('#cfg-slogan')?.value?.trim() || 'A Lifetime of Happiness';
  const date = $('#cfg-date')?.value || '2026-11-03';
  const enableMarryAuction = $('#cfg-marry-auction')?.value === 'true';
  const minCoinsToMarry = Number($('#cfg-min-marry')?.value) || 10;

  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: { groom, bride, title, slogan, date, enableMarryAuction, minCoinsToMarry } })
  });
  alert('Đã lưu thông tin Cô dâu, Chú rể & Đấu giá kết hôn thành công!');
});

// Save Goals
$('#btn-save-goals')?.addEventListener('click', async () => {
  const roseTarget = Number($('#cfg-goal-rose')?.value) || 2532;
  const cakeTarget = Number($('#cfg-goal-cake')?.value) || 100000;

  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goals: {
        rose: { target: roseTarget },
        cake: { target: cakeTarget }
      }
    })
  });
  alert('Đã lưu mục tiêu quà tặng thành công!');
});

// Save Voice Settings (Kokoro + browser fallback).
// Payload is sent flat so the server stores it on config itself (the old nested
// { config: {...} } shape was being written to a dead state.config.config).
$('#btn-save-voice')?.addEventListener('click', async () => {
  const speech = $('#cfg-speech-enabled')?.value === 'true';
  const funnyVoiceEnabled = $('#cfg-funny-voice')?.value === 'true';
  const voicePitch = Number($('#cfg-voice-pitch')?.value) || 1.0;
  const speed = Number($('#cfg-voice-rate')?.value) || 0.98;
  const volume = Number($('#cfg-volume')?.value) || 0.95;
  const ttsVoice = $('#cfg-tts-voice')?.value || 'af_heart';
  const thanksTemplate = $('#cfg-thanks-template')?.value?.trim();

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        speech,
        funnyVoiceEnabled,
        voicePitch,
        voiceRate: speed,
        ttsSpeed: speed,
        volume,
        ttsVolume: volume,
        ttsVoice,
        thanksTemplate
      })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    alert('Đã lưu cấu hình giọng đọc AI MC thành công!');
  } catch (err) {
    alert('Lưu cấu hình giọng đọc thất bại: ' + err.message);
  }
});

// Giọng trình duyệt dự phòng (chỉ dùng khi Kokoro lỗi hoặc bị tắt)
function speakWithBrowser(text) {
  if (!('speechSynthesis' in window)) {
    alert('Trình duyệt không hỗ trợ Web Speech');
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices() || [];
  const en = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en')) || voices[0];
  if (en) u.voice = en;
  u.pitch = 1.0;
  u.rate = Number($('#cfg-voice-rate')?.value) || 0.98;
  speechSynthesis.speak(u);
}

// Test Voice - dùng đúng giọng/tốc độ/âm lượng sẽ dùng khi LIVE
$('#btn-test-voice')?.addEventListener('click', async () => {
  const tpl = $('#cfg-thanks-template')?.value || 'Thank you {name} for the wedding gift!';
  const groom = $('#cfg-groom')?.value || 'the groom';
  const bride = $('#cfg-bride')?.value || 'the bride';
  const text = tpl
    .replace('{name}', 'Ibeth')
    .replace('{gift}', 'Wedding Envelope')
    .replace('{count}', '1')
    .replace('{groom}', groom)
    .replace('{bride}', bride);

  const btn = $('#btn-test-voice');
  const label = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang tạo giọng...'; }

  try {
    const res = await fetch('/api/tts/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: $('#cfg-tts-voice')?.value || 'af_heart',
        speed: Number($('#cfg-voice-rate')?.value) || 0.98
      })
    });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || ('HTTP ' + res.status));
    const audio = new Audio(data.url);
    audio.volume = Number($('#cfg-volume')?.value) || 0.95;
    await audio.play();
  } catch (err) {
    speakWithBrowser(text);
    alert('Không tạo được giọng Kokoro (' + err.message + ').\nĐã đọc thử bằng giọng trình duyệt để bạn vẫn nghe được mẫu câu.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
});

// ========================================================
// KOKORO TTS PANEL (chèn bằng JS để index.html giữ nguyên)
// ========================================================
let currentTtsVoice = 'af_heart';

async function refreshTtsStatus() {
  const line = document.getElementById('tts-status-line');
  const sel = document.getElementById('cfg-tts-voice');
  try {
    const res = await fetch('/api/tts/status');
    const st = await res.json();
    if (sel && !sel.options.length && Array.isArray(st.voices)) {
      sel.innerHTML = st.voices
        .map(v => `<option value="${v.id}">${v.label}</option>`)
        .join('');
      sel.value = currentTtsVoice || 'af_heart';
    }
    if (line) {
      const cache = st.cache ? `${st.cache.files} tệp` : '0 tệp';
      const stateText = st.ready
        ? '✅ Sẵn sàng'
        : (st.loading ? '⏳ Đang nạp mô hình...' : (st.error ? '❌ Lỗi' : '💤 Chưa nạp'));
      line.textContent = `Kokoro: ${stateText} · Mô hình: ${st.model} (${st.dtype}) · Cache: ${cache}`
        + (st.lastLatencyMs ? ` · Lần tạo gần nhất: ${st.lastLatencyMs} ms` : '')
        + (st.error ? ` · ${st.error}` : '');
    }
  } catch (err) {
    if (line) line.textContent = '❌ Không đọc được trạng thái TTS (server chưa chạy?)';
  }
}

function initTtsUi() {
  const card = document.querySelector('#tab-voice .card-panel');
  if (!card) return;

  // The old pitch slider only ever made the browser voice sound worse, and Kokoro
  // has no pitch control, so the control is retired rather than left lying.
  const pitch = document.getElementById('cfg-voice-pitch');
  if (pitch) {
    const group = pitch.closest('.form-group');
    if (group) group.style.display = 'none';
  }

  if (!document.getElementById('tts-kokoro-block')) {
    const block = document.createElement('div');
    block.id = 'tts-kokoro-block';
    block.className = 'form-grid';
    block.style.marginTop = '14px';
    block.innerHTML = `
      <div class="form-group full-width">
        <label>Giọng MC Kokoro (AI chạy offline trên máy):</label>
        <select id="cfg-tts-voice"></select>
        <small class="hint-text" id="tts-status-line">Đang kiểm tra trạng thái TTS...</small>
      </div>
    `;
    const footer = card.querySelector('.panel-footer');
    if (footer) card.insertBefore(block, footer);
    else card.append(block);
  }

  refreshTtsStatus();
  setInterval(refreshTtsStatus, 5000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTtsUi);
else initTtsUi();

// Reset Session
$('#btn-reset-session')?.addEventListener('click', async () => {
  if (!confirm('Bạn có chắc muốn xóa dữ liệu khách mời và sổ mừng cưới để bắt đầu phiên LIVE mới?')) return;
  await fetch('/api/reset', { method: 'POST' });
  alert('Đã thiết lập lại phiên LIVE mới thành công!');
});

// BGM YouTube Controls — five independent tracks sharing one overlay player
const BGM_TRACK_COUNT = 5;
let lastBgmState = null;

function bgmRow(index) {
  return {
    name: $(`#cfg-bgm-name-${index}`),
    url: $(`#cfg-bgm-url-${index}`),
    status: $(`#bgm-status-${index}`),
    row: document.querySelector(`.bgm-track-row[data-track="${index}"]`)
  };
}

async function bgmRequest(payload) {
  const res = await fetch('/api/bgm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function renderBgm(bgm) {
  if (!bgm) return;
  lastBgmState = bgm;
  const tracks = Array.isArray(bgm.tracks) ? bgm.tracks : [];
  tracks.forEach((track, idx) => {
    const index = idx + 1;
    const row = bgmRow(index);
    if (row.name && document.activeElement !== row.name) row.name.value = track.name || '';
    if (row.url && document.activeElement !== row.url) row.url.value = track.url || '';
    const playing = bgm.playing !== false && Number(bgm.activeTrack) === index && !!track.videoId;
    if (row.status) {
      row.status.textContent = playing
        ? '🔴 Đang phát'
        : (track.videoId ? '⚪ Sẵn sàng' : '⚪ Chưa có link');
    }
    row.row?.classList.toggle('is-playing', playing);
  });
  if ($('#cfg-bgm-volume') && bgm.volume !== undefined) $('#cfg-bgm-volume').value = bgm.volume;
  if ($('#cfg-bgm-playing')) $('#cfg-bgm-playing').value = String(bgm.playing !== false);
}

async function saveBgmTrack(index, extra = {}) {
  const row = bgmRow(index);
  try {
    const data = await bgmRequest(Object.assign({
      trackIndex: index,
      name: row.name?.value?.trim() ?? '',
      url: row.url?.value?.trim() ?? ''
    }, extra));
    renderBgm(data.bgm);
    return data.bgm;
  } catch (e) {
    alert(`Bài số ${index}: ${e.message}`);
    return null;
  }
}

for (let i = 1; i <= BGM_TRACK_COUNT; i += 1) {
  $(`#btn-bgm-save-${i}`)?.addEventListener('click', async () => {
    const bgm = await saveBgmTrack(i);
    if (bgm) alert(`Đã lưu bài số ${i}.`);
  });
  $(`#btn-bgm-play-${i}`)?.addEventListener('click', async () => {
    const bgm = await saveBgmTrack(i, { play: i });
    if (bgm) alert(`Đang phát bài số ${i}: ${bgm.title}`);
  });
}

$('#btn-bgm-stop')?.addEventListener('click', async () => {
  try {
    const data = await bgmRequest({ stop: true });
    renderBgm(data.bgm);
  } catch (e) {
    alert(e.message);
  }
});

$('#btn-save-bgm')?.addEventListener('click', async () => {
  try {
    const data = await bgmRequest({ volume: Number($('#cfg-bgm-volume')?.value) || 50 });
    renderBgm(data.bgm);
    alert('Đã lưu âm lượng nhạc nền.');
  } catch (e) {
    alert(e.message);
  }
});

$('#cfg-bgm-volume')?.addEventListener('change', () => {
  const volume = Number($('#cfg-bgm-volume')?.value) || 50;
  bgmRequest({ volume }).then(data => renderBgm(data.bgm)).catch(() => {});
});

$('#cfg-bgm-playing')?.addEventListener('change', async () => {
  const playing = $('#cfg-bgm-playing')?.value === 'true';
  try {
    const data = await bgmRequest(playing
      ? { play: Number(lastBgmState?.activeTrack) || 1 }
      : { stop: true });
    renderBgm(data.bgm);
  } catch (e) {
    alert(e.message);
  }
});

// Wedding dancers — two permanent aisle characters (Vietnamese labels on purpose)
function renderDancers(dancers) {
  if (!dancers) return;
  const setValue = (selector, value) => {
    const el = $(selector);
    if (el && document.activeElement !== el) el.value = String(value);
  };
  setValue('#cfg-dancers-enabled', dancers.enabled !== false);
  setValue('#cfg-dancers-left', dancers.left !== false);
  setValue('#cfg-dancers-right', dancers.right !== false);
  setValue('#cfg-dancers-speed', dancers.speed ?? 1);
  setValue('#cfg-dancers-scale', dancers.scale ?? 1);
  setValue('#cfg-dancers-intensity', dancers.intensity ?? 1);

  const status = $('#dancers-status');
  if (status) {
    status.textContent = dancers.enabled === false
      ? 'Vũ công đang tắt.'
      : `Đang bật • trái: ${dancers.left === false ? 'ẩn' : 'hiện'} • phải: ${dancers.right === false ? 'ẩn' : 'hiện'} • tốc độ ${Number(dancers.speed || 1).toFixed(1)}× • cỡ ${Number(dancers.scale || 1).toFixed(2)}× • lực ${Number(dancers.intensity || 1).toFixed(1)}×`;
  }
}

$('#btn-save-dancers')?.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/dancers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: $('#cfg-dancers-enabled')?.value === 'true',
        left: $('#cfg-dancers-left')?.value === 'true',
        right: $('#cfg-dancers-right')?.value === 'true',
        speed: Number($('#cfg-dancers-speed')?.value) || 1,
        scale: Number($('#cfg-dancers-scale')?.value) || 1,
        intensity: Number($('#cfg-dancers-intensity')?.value) || 1
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    renderDancers(data.dancers);
    alert('Đã lưu cài đặt vũ công!');
  } catch (e) {
    alert('Lỗi: ' + e.message);
  }
});

// Stage lighting — continuous ambience settings (Vietnamese labels on purpose)
function renderStageLighting(lighting) {
  if (!lighting) return;
  const setValue = (selector, value) => {
    const el = $(selector);
    if (el && document.activeElement !== el) el.value = String(value);
  };
  setValue('#cfg-sl-enabled', lighting.enabled !== false);
  setValue('#cfg-sl-intensity', lighting.intensity ?? 65);
  setValue('#cfg-sl-color-speed', lighting.colorSpeed ?? 1);
  setValue('#cfg-sl-spot-speed', lighting.spotSpeed ?? 1);
  setValue('#cfg-sl-brightness', lighting.spotBrightness ?? 60);
  setValue('#cfg-sl-spot-count', lighting.spotCount ?? 3);
  setValue('#cfg-sl-beams', lighting.beams !== false);
  setValue('#cfg-sl-floor', lighting.floor !== false);
  setValue('#cfg-sl-sparkles', lighting.sparkles !== false);
  setValue('#cfg-sl-lowperf', lighting.lowPerf === true);

  const status = $('#sl-status');
  if (status) {
    status.textContent = lighting.enabled === false
      ? 'Đèn sân khấu đang tắt.'
      : `Đang bật • cường độ ${lighting.intensity ?? 65}% • ${lighting.spotCount ?? 3} spotlight • đổi màu ${Number(lighting.colorSpeed || 1).toFixed(1)}× • quét ${Number(lighting.spotSpeed || 1).toFixed(1)}×${lighting.lowPerf === true ? ' • chế độ máy yếu' : ''}`;
  }
}

function stageLightingPayload() {
  return {
    enabled: $('#cfg-sl-enabled')?.value === 'true',
    intensity: Number($('#cfg-sl-intensity')?.value) || 0,
    colorSpeed: Number($('#cfg-sl-color-speed')?.value) || 1,
    spotSpeed: Number($('#cfg-sl-spot-speed')?.value) || 1,
    spotBrightness: Number($('#cfg-sl-brightness')?.value) || 0,
    spotCount: Number($('#cfg-sl-spot-count')?.value) || 3,
    beams: $('#cfg-sl-beams')?.value === 'true',
    floor: $('#cfg-sl-floor')?.value === 'true',
    sparkles: $('#cfg-sl-sparkles')?.value === 'true',
    lowPerf: $('#cfg-sl-lowperf')?.value === 'true'
  };
}

async function saveStageLighting(payload) {
  try {
    const res = await fetch('/api/stage-lighting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    renderStageLighting(data.stageLighting);
    return data.stageLighting;
  } catch (e) {
    alert('Lỗi: ' + e.message);
    return null;
  }
}

$('#btn-save-sl')?.addEventListener('click', async () => {
  const saved = await saveStageLighting(stageLightingPayload());
  if (saved) alert('Đã lưu cài đặt ánh sáng sân khấu!');
});

$('#btn-reset-sl')?.addEventListener('click', async () => {
  const saved = await saveStageLighting({
    enabled: true, intensity: 65, colorSpeed: 1, spotSpeed: 1, spotBrightness: 60,
    spotCount: 3, beams: true, floor: true, sparkles: true, lowPerf: false
  });
  if (saved) alert('Đã khôi phục cài đặt ánh sáng mặc định!');
});

// Render State into Admin Panel
function renderAdminState(state) {
  const cfg = state.config || {};
  const stats = state.stats || {};
  const goals = state.goals || {};
  const scores = state.scores || {};

  // Stat cards
  if ($('#card-guests')) $('#card-guests').textContent = stats.guests || 0;
  if ($('#card-envelopes')) $('#card-envelopes').textContent = stats.envelopes || 0;
  if ($('#card-wishes')) $('#card-wishes').textContent = stats.wishes || 0;

  const topDonors = Object.values(scores).sort((a, b) => b.total - a.total);
  if ($('#card-top-giver')) {
    $('#card-top-giver').textContent = topDonors[0]?.name || 'Chưa có';
  }

  // Registry table
  const tbody = $('#table-registry tbody');
  if (tbody) {
    tbody.replaceChildren();
    if (!topDonors.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="4" style="text-align:center;color:#9e97a4;">Chưa có dữ liệu người mừng cưới</td>';
      tbody.append(tr);
    } else {
      topDonors.forEach((d, idx) => {
        const tr = document.createElement('tr');
        const rankBadge = idx === 0 ? '👑 TOP 1' : (idx === 1 ? '🥈 TOP 2' : (idx === 2 ? '🥉 TOP 3' : `#${idx + 1}`));
        tr.innerHTML = `
          <td><b>${rankBadge}</b></td>
          <td><b>${d.name}</b></td>
          <td style="color:#ffd87d;font-weight:700;">💌 ${d.total.toLocaleString('vi-VN')} xu</td>
          <td>Mừng cưới</td>
        `;
        tbody.append(tr);
      });
    }
  }

  // Populate form fields if not focused
  if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    if ($('#cfg-groom') && cfg.groom) $('#cfg-groom').value = cfg.groom;
    if ($('#cfg-bride') && cfg.bride) $('#cfg-bride').value = cfg.bride;
    if ($('#cfg-title') && cfg.title) $('#cfg-title').value = cfg.title;
    if ($('#cfg-slogan') && cfg.slogan) $('#cfg-slogan').value = cfg.slogan;
    if ($('#cfg-date') && cfg.date) $('#cfg-date').value = cfg.date;
    if ($('#cfg-marry-auction')) $('#cfg-marry-auction').value = String(cfg.enableMarryAuction !== false);
    if ($('#cfg-min-marry')) $('#cfg-min-marry').value = cfg.minCoinsToMarry || 10;
    if ($('#cfg-speech-enabled')) $('#cfg-speech-enabled').value = String(cfg.speech !== false);
    if ($('#cfg-funny-voice')) $('#cfg-funny-voice').value = String(cfg.funnyVoiceEnabled !== false);
    if ($('#cfg-voice-pitch')) $('#cfg-voice-pitch').value = cfg.voicePitch || 1.25;
    if ($('#cfg-voice-rate')) $('#cfg-voice-rate').value = cfg.voiceRate || 1.08;
    if ($('#cfg-volume')) $('#cfg-volume').value = cfg.volume || 0.95;
    if ($('#cfg-goal-rose') && goals.rose) $('#cfg-goal-rose').value = goals.rose.target;
    if ($('#cfg-goal-cake') && goals.cake) $('#cfg-goal-cake').value = goals.cake.target;
    if ($('#cfg-thanks-template') && cfg.thanksTemplate) $('#cfg-thanks-template').value = cfg.thanksTemplate;
    if (cfg.ttsVoice) currentTtsVoice = cfg.ttsVoice;
    if ($('#cfg-tts-voice') && cfg.ttsVoice) $('#cfg-tts-voice').value = cfg.ttsVoice;
    if (cfg.bgm) renderBgm(cfg.bgm);
    if (cfg.dancers) renderDancers(cfg.dancers);
    if (cfg.stageLighting) renderStageLighting(cfg.stageLighting);
  }
}

// Connect to SSE for Admin
const es = new EventSource('/api/events');
es.addEventListener('state', e => {
  try {
    const data = JSON.parse(e.data);
    renderAdminState(data);
    if (data.status) updateConnectionStatus(data.status);
  } catch (err) {}
});

es.addEventListener('status', e => {
  try {
    const data = JSON.parse(e.data);
    updateConnectionStatus(data);
  } catch (err) {}
});

// Update TikFinity Connection Status UI
function updateConnectionStatus(s) {
  if (!s) return;
  const stateLabels = {
    offline: 'Chưa kết nối TikFinity',
    connecting: 'Đang kết nối TikFinity…',
    waiting: 'Chờ dữ liệu LIVE…',
    connected: 'Đã kết nối TikFinity',
    retry: 'Đang kết nối lại…',
    error: 'Lỗi kết nối TikFinity'
  };

  const pill = $('#status');
  const globalPill = $('#global-status');
  const stateClass = s.state || 'offline';
  const label = s.username ? `Đã kết nối @${s.username}` : (stateLabels[s.state] || s.state);

  [pill, globalPill].forEach(el => {
    if (!el) return;
    el.className = 'status-pill ' + stateClass;
    el.textContent = label;
  });

  const msg = s.message || (s.state === 'connected' ? 'Đang nhận dữ liệu trực tiếp từ TikTok LIVE.' : 'Hãy mở ứng dụng TikFinity Desktop và kết nối phòng LIVE trước.');
  if ($('#connection-message')) {
    $('#connection-message').textContent = msg;
  }
  if ($('#tab-status-desc')) {
    $('#tab-status-desc').textContent = `${label} · ${msg}`;
  }

  const dot = $('#notice-dot');
  if (dot) {
    if (s.state === 'connected') dot.style.background = '#34c759';
    else if (['connecting', 'waiting', 'retry'].includes(s.state)) dot.style.background = '#ffd60a';
    else if (s.state === 'error') dot.style.background = '#ff453a';
    else dot.style.background = '#888';
  }

  const connectBtn = $('#connect');
  const disconnectBtn = $('#disconnect');
  if (connectBtn) {
    connectBtn.disabled = ['connecting', 'connected', 'waiting'].includes(s.state);
  }
  if (disconnectBtn) {
    disconnectBtn.disabled = s.state === 'offline';
  }
}

// TikFinity 1-Click Connect Handlers
$('#connect')?.addEventListener('click', async () => {
  const btn = $('#connect');
  btn.disabled = true;
  updateConnectionStatus({ state: 'connecting', message: 'Đang kết nối tới TikFinity Desktop...' });
  try {
    const res = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'tikfinity' })
    });
    const data = await res.json();
    if (!data.ok) {
      alert(`⚠️ ${data.error || 'Không thể kết nối TikFinity Desktop!'}\n\nCách xử lý:\n1. Mở app TikFinity Desktop trên máy tính.\n2. Nhập username TikTok và bấm Connect.\n3. Sau đó bấm lại nút Kết nối TikFinity.`);
      updateConnectionStatus({ state: 'error', message: data.error });
    }
  } catch (err) {
    alert('⚠️ Lỗi gửi yêu cầu kết nối TikFinity!');
    updateConnectionStatus({ state: 'error', message: err.message });
  }
});

$('#disconnect')?.addEventListener('click', async () => {
  try {
    await fetch('/api/disconnect', { method: 'POST' });
    updateConnectionStatus({ state: 'offline', message: 'Đã ngắt kết nối TikFinity Desktop.' });
  } catch (err) {}
});

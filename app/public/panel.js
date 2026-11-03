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
  const names = ['Ngọc Hân', 'Hoàng Long', 'Minh Thư', 'Tuệ An', 'Anh Dũng', 'Kim Ngân', 'Thanh Tùng'];
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
    const donors = ['Phương Thảo', 'Văn Hùng', 'Hoàng Long', 'Hồng Hạnh', 'Thành Đạt', 'Mai Linh'];
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
  const groom = $('#cfg-groom')?.value?.trim() || 'Tuấn Anh';
  const bride = $('#cfg-bride')?.value?.trim() || 'Mai Vy';
  const title = $('#cfg-title')?.value?.trim() || 'TIỆC CƯỚI ONLINE';
  const slogan = $('#cfg-slogan')?.value?.trim() || 'Trăm Năm Hạnh Phúc';
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

// Save Voice Settings
$('#btn-save-voice')?.addEventListener('click', async () => {
  const speech = $('#cfg-speech-enabled')?.value === 'true';
  const funnyVoiceEnabled = $('#cfg-funny-voice')?.value === 'true';
  const voicePitch = Number($('#cfg-voice-pitch')?.value) || 1.25;
  const voiceRate = Number($('#cfg-voice-rate')?.value) || 1.08;
  const volume = Number($('#cfg-volume')?.value) || 0.95;
  const thanksTemplate = $('#cfg-thanks-template')?.value?.trim();

  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: { speech, funnyVoiceEnabled, voicePitch, voiceRate, volume, thanksTemplate } })
  });
  alert('Đã lưu cấu hình giọng đọc AI MC thành công!');
});

// Test Voice
$('#btn-test-voice')?.addEventListener('click', () => {
  const tpl = $('#cfg-thanks-template')?.value || 'Cảm ơn bạn {name} đã mừng cưới!';
  const groom = $('#cfg-groom')?.value || 'chú rể';
  const bride = $('#cfg-bride')?.value || 'cô dâu';
  const text = tpl
    .replace('{name}', 'Đại gia Hoàng Long')
    .replace('{gift}', 'nhẫn cưới hỷ sự')
    .replace('{count}', '1')
    .replace('{groom}', groom)
    .replace('{bride}', bride);

  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const vi = voices.find(v => (v.name.includes('HoaiMy') || v.lang.startsWith('vi')) && (v.name.includes('Female') || v.name.includes('HoaiMy') || !v.name.includes('Nam'))) || voices.find(v => v.lang.toLowerCase().startsWith('vi')) || voices[0];
    if (vi) u.voice = vi;
    u.pitch = Number($('#cfg-voice-pitch')?.value) || 1.25;
    u.rate = Number($('#cfg-voice-rate')?.value) || 1.08;
    speechSynthesis.speak(u);
  } else {
    alert('Trình duyệt không hỗ trợ Web Speech');
  }
});

// Reset Session
$('#btn-reset-session')?.addEventListener('click', async () => {
  if (!confirm('Bạn có chắc muốn xóa dữ liệu khách mời và sổ mừng cưới để bắt đầu phiên LIVE mới?')) return;
  await fetch('/api/reset', { method: 'POST' });
  alert('Đã thiết lập lại phiên LIVE mới thành công!');
});

// BGM YouTube Controls
async function saveBgm(customPayload = {}) {
  const youtubeUrl = $('#cfg-bgm-url')?.value?.trim();
  const title = $('#cfg-bgm-title')?.value?.trim() || 'Nhạc Đám Cưới Lãng Mạn';
  const volume = Number($('#cfg-bgm-volume')?.value) || 50;
  const playing = $('#cfg-bgm-playing')?.value === 'true';

  const payload = Object.assign({
    youtubeUrl,
    title,
    volume,
    playing,
    enabled: true
  }, customPayload);

  try {
    const res = await fetch('/api/bgm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (e) {
    console.error('Save BGM error:', e);
  }
}

$('#btn-apply-bgm')?.addEventListener('click', async () => {
  await saveBgm({ playing: true });
  alert('Đã cập nhật và phát nhạc nền cưới trên màn hình LIVE thành công!');
});

$('#btn-save-bgm')?.addEventListener('click', async () => {
  await saveBgm();
  alert('Đã lưu cấu hình nhạc nền YouTube thành công!');
});

$('#btn-toggle-bgm')?.addEventListener('click', async () => {
  const currentSelect = $('#cfg-bgm-playing');
  const nowPlaying = currentSelect?.value === 'true';
  const newPlaying = !nowPlaying;
  if (currentSelect) currentSelect.value = String(newPlaying);
  await saveBgm({ playing: newPlaying });
  alert(newPlaying ? 'Đã bật nhạc nền! 🎵' : 'Đã tạm dừng nhạc nền! ⏸️');
});

// Preset Playlist Buttons
$$('.bgm-preset-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const url = btn.dataset.url;
    const title = btn.dataset.title;
    if ($('#cfg-bgm-url')) $('#cfg-bgm-url').value = url;
    if ($('#cfg-bgm-title')) $('#cfg-bgm-title').value = title;
    await saveBgm({ youtubeUrl: url, title, playing: true });
    alert(`Đang phát: ${title}! 🎵`);
  });
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
    if (cfg.bgm) {
      if ($('#cfg-bgm-url') && cfg.bgm.youtubeUrl) $('#cfg-bgm-url').value = cfg.bgm.youtubeUrl;
      if ($('#cfg-bgm-title') && cfg.bgm.title) $('#cfg-bgm-title').value = cfg.bgm.title;
      if ($('#cfg-bgm-volume') && cfg.bgm.volume !== undefined) $('#cfg-bgm-volume').value = cfg.bgm.volume;
      if ($('#cfg-bgm-playing') && cfg.bgm.playing !== undefined) $('#cfg-bgm-playing').value = String(cfg.bgm.playing);
    }
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

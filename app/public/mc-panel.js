/**
 * Dashboard panel: 🎤 AI Wedding MC.
 * Talks only to /api/mc/* (and reuses /api/tts/* for the voice preview).
 */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var section = null;
  var state = { data: null, voices: [], poll: null, busy: false };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  async function api(path, opts) {
    opts = opts || {};
    var res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    });
    var data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    return data;
  }

  function markup() {
    return [
      '<div class="section-heading">',
      '  <small>NGƯỜI DẪN CHƯƠNG TRÌNH ẢO • SÂN KHẤU LIVE</small>',
      '  <h2>🎤 AI Wedding MC</h2>',
      '  <p>MC ảo đứng trên sân khấu, tự chào khách, cảm ơn quà, dẫn nghi thức và giữ nhịp livestream. Dùng chung bộ AI Provider và giọng Kokoro hiện có.</p>',
      '</div>',

      '<div class="card-panel">',
      '  <div class="panel-header">',
      '    <h3>Trạng Thái MC</h3>',
      '    <small id="mc-status-pill" class="mc-pill off">Đang tải…</small>',
      '  </div>',
      '  <div class="ai-kpi-grid">',
      '    <div class="ai-kpi"><b id="mc-kpi-spoken">0</b><span>Câu đã đọc</span></div>',
      '    <div class="ai-kpi"><b id="mc-kpi-ai">0</b><span>AI tạo</span></div>',
      '    <div class="ai-kpi"><b id="mc-kpi-fallback">0</b><span>Dùng mẫu câu</span></div>',
      '    <div class="ai-kpi"><b id="mc-kpi-suppressed">0</b><span>Đã chặn trùng</span></div>',
      '  </div>',
      '  <div class="form-grid">',
      '    <div class="form-group"><label>Bật MC:</label><select id="mc-enabled"><option value="true">Bật</option><option value="false">Tắt</option></select></div>',
      '    <div class="form-group"><label>Tạm dừng (im lặng ngay):</label><select id="mc-paused"><option value="false">Đang hoạt động</option><option value="true">Tạm dừng</option></select></div>',
      '    <div class="form-group"><label>Dòng vừa đọc:</label><input type="text" id="mc-last-line" readonly placeholder="—"></div>',
      '    <div class="form-group"><label>Lỗi gần nhất:</label><input type="text" id="mc-last-error" readonly placeholder="Không có lỗi"></div>',
      '  </div>',
      '  <div class="panel-footer">',
      '    <button class="btn btn-secondary" id="mc-btn-pause">⏸️ Tạm dừng MC</button>',
      '    <button class="btn btn-secondary" id="mc-btn-resume">▶️ Tiếp tục MC</button>',
      '    <button class="btn btn-secondary" id="mc-btn-refresh">🔄 Làm mới trạng thái</button>',
      '  </div>',
      '</div>',

      '<div class="card-panel">',
      '  <div class="panel-header"><h3>Nhân Vật Trên Sân Khấu</h3><small>2D nhẹ, an toàn cho OBS Browser Source</small></div>',
      '  <div class="form-grid">',
      '    <div class="form-group"><label>Mẫu MC:</label><select id="mc-preset"><option value="female">Nữ MC</option><option value="male">Nam MC</option></select></div>',
      '    <div class="form-group"><label>Trang phục:</label><select id="mc-style"><option value="dress">Váy dạ hội</option><option value="suit">Vest</option></select></div>',
      '    <div class="form-group"><label>Phụ kiện:</label><select id="mc-accessory"><option value="veil">Khăn voan / trang sức</option><option value="bowtie">Nơ cổ</option><option value="none">Không</option></select></div>',
      '    <div class="form-group"><label>Màu da:</label><input type="color" id="mc-skin" value="#f2c6a4"></div>',
      '    <div class="form-group"><label>Màu tóc:</label><input type="color" id="mc-hair" value="#3a2318"></div>',
      '    <div class="form-group"><label>Màu trang phục:</label><input type="color" id="mc-outfit" value="#a51f3c"></div>',
      '  </div>',
      '</div>',

      '<div class="card-panel">',
      '  <div class="panel-header"><h3>Giọng Nói & Bộ Não AI</h3><small>Dùng chung Kokoro + AI Provider Manager</small></div>',
      '  <div class="form-grid">',
      '    <div class="form-group"><label>Giọng đọc (Kokoro):</label><select id="mc-voice"><option value="">Theo cài đặt chung</option></select></div>',
      '    <div class="form-group"><label>Tốc độ đọc:</label><input type="number" id="mc-speed" min="0.7" max="1.5" step="0.02" value="0.98"></div>',
      '    <div class="form-group"><label>Nhà cung cấp AI:</label><select id="mc-provider"><option value="">Theo mặc định hệ thống</option></select></div>',
      '    <div class="form-group"><label>Model (trống = model của nhà cung cấp):</label><input type="text" id="mc-model" list="mc-model-list" placeholder="openrouter/free"><datalist id="mc-model-list"></datalist></div>',
      '    <div class="form-group"><label>Tính cách:</label><select id="mc-personality">',
      '      <option value="playful">Duyên dáng, vui tươi</option>',
      '      <option value="elegant">Trang trọng, lịch thiệp</option>',
      '      <option value="funny">Hài hước, tếu táo</option>',
      '      <option value="formal">Nghiêm túc, ngắn gọn</option>',
      '    </select></div>',
      '    <div class="form-group"><label>Ngôn ngữ nói:</label><select id="mc-language"><option value="en">Tiếng Anh</option><option value="vi">Tiếng Việt</option></select></div>',
      '    <div class="form-group"><label>Tần suất nói (0.3–2):</label><input type="number" id="mc-frequency" min="0.3" max="2" step="0.1" value="1"></div>',
      '    <div class="form-group"><label>Độ dài tối đa (ký tự):</label><input type="number" id="mc-maxchars" min="60" max="320" step="10" value="180"></div>',
      '  </div>',
      '  <div class="panel-footer">',
      '    <button class="btn btn-secondary" id="mc-btn-models">📚 Tải danh sách model</button>',
      '    <button class="btn btn-secondary" id="mc-btn-testai">🧠 Thử tạo lời thoại</button>',
      '    <button class="btn btn-secondary" id="mc-btn-testvoice">🔊 Thử giọng đọc</button>',
      '  </div>',
      '  <div id="mc-test-result" class="ai-note"></div>',
      '</div>',

      '<div class="card-panel">',
      '  <div class="panel-header"><h3>Hành Vi & Chống Spam</h3><small>Giữ MC không nói quá nhiều trên LIVE</small></div>',
      '  <div class="form-grid">',
      '    <div class="form-group"><label>Tự chào khách mới:</label><select id="mc-auto-welcome"><option value="true">Bật</option><option value="false">Tắt</option></select></div>',
      '    <div class="form-group"><label>Tự cảm ơn quà:</label><select id="mc-auto-gift"><option value="true">Bật</option><option value="false">Tắt</option></select></div>',
      '    <div class="form-group"><label>Tự dẫn nghi thức:</label><select id="mc-auto-ceremony"><option value="true">Bật</option><option value="false">Tắt</option></select></div>',
      '    <div class="form-group"><label>Trả lời bình luận:</label><select id="mc-auto-interaction"><option value="true">Bật (có giới hạn)</option><option value="false">Tắt</option></select></div>',
      '    <div class="form-group"><label>Giữ nhịp khi vắng khách:</label><select id="mc-idle"><option value="true">Bật</option><option value="false">Tắt</option></select></div>',
      '    <div class="form-group"><label>Khoảng lặng giữa các câu (giây):</label><input type="number" id="mc-cooldown" min="1.5" max="120" step="0.5" value="6"></div>',
      '    <div class="form-group"><label>Gộp quà liên tiếp trong (giây):</label><input type="number" id="mc-merge" min="0.5" max="15" step="0.5" value="2.5"></div>',
      '    <div class="form-group"><label>Chu kỳ giữ nhịp (giây):</label><input type="number" id="mc-idle-interval" min="15" max="600" step="5" value="45"></div>',
      '  </div>',
      '  <div class="form-grid mc-priority-grid">',
      '    <div class="form-group"><label>Ưu tiên — chào khách:</label><input type="number" id="mc-p-welcome" min="1" max="10" value="6"></div>',
      '    <div class="form-group"><label>Ưu tiên — quà:</label><input type="number" id="mc-p-gift" min="1" max="10" value="5"></div>',
      '    <div class="form-group"><label>Ưu tiên — nghi thức:</label><input type="number" id="mc-p-ceremony" min="1" max="10" value="10"></div>',
      '    <div class="form-group"><label>Ưu tiên — bình luận:</label><input type="number" id="mc-p-interaction" min="1" max="10" value="3"></div>',
      '    <div class="form-group"><label>Ưu tiên — giữ nhịp:</label><input type="number" id="mc-p-idle" min="1" max="10" value="1"></div>',
      '    <div class="form-group"><label>Ưu tiên — thông báo tay:</label><input type="number" id="mc-p-manual" min="1" max="10" value="8"></div>',
      '  </div>',
      '  <div class="panel-footer">',
      '    <button class="btn btn-primary" id="mc-btn-save">💾 Lưu cấu hình MC</button>',
      '  </div>',
      '</div>',

      '<div class="card-panel">',
      '  <div class="panel-header"><h3>Thông Báo Thủ Công</h3><small>Đọc ngay qua đúng hàng đợi Kokoro</small></div>',
      '  <div class="form-group"><label>Nội dung MC sẽ nói:</label>',
      '    <textarea id="mc-say-text" rows="3" maxlength="240" placeholder="Kính mời cả hội trường nâng ly chúc mừng cô dâu chú rể!"></textarea>',
      '  </div>',
      '  <div class="panel-footer">',
      '    <button class="btn btn-primary" id="mc-btn-say">📣 Đọc thông báo</button>',
      '    <button class="btn btn-secondary" id="mc-btn-welcome">👋 Chào khách ngay</button>',
      '    <button class="btn btn-secondary" id="mc-btn-farewell">🌙 Tạm biệt cả nhà</button>',
      '  </div>',
      '  <p class="ai-note">AI chỉ tạo lời thoại. Nội dung do AI sinh ra không bao giờ kích hoạt hành động hệ thống, không tự đọc số xu quà tặng và bị giới hạn độ dài trước khi đưa vào Kokoro.</p>',
      '</div>'
    ].join('');
  }

  function bind() {
    $('#mc-btn-save').addEventListener('click', save);
    $('#mc-btn-pause').addEventListener('click', function () { act('/api/mc/pause'); });
    $('#mc-btn-resume').addEventListener('click', function () { act('/api/mc/resume'); });
    $('#mc-btn-refresh').addEventListener('click', load);
    $('#mc-btn-say').addEventListener('click', say);
    $('#mc-btn-welcome').addEventListener('click', function () { act('/api/mc/welcome', { method: 'POST' }, 'Đã gửi lời chào.'); });
    $('#mc-btn-farewell').addEventListener('click', function () { act('/api/mc/farewell', { method: 'POST' }, 'Đã gửi lời tạm biệt.'); });
    $('#mc-btn-testai').addEventListener('click', testAi);
    $('#mc-btn-testvoice').addEventListener('click', testVoice);
    $('#mc-btn-models').addEventListener('click', loadModels);

    $('#mc-preset').addEventListener('change', function () {
      var male = $('#mc-preset').value === 'male';
      $('#mc-style').value = male ? 'suit' : 'dress';
    });

    ['#mc-enabled', '#mc-paused'].forEach(function (sel) {
      $(sel).addEventListener('change', function () {
        var patch = {};
        patch[sel === '#mc-enabled' ? 'enabled' : 'paused'] = $(sel).value === 'true';
        apply(patch).catch(function (e) { notice('Lỗi: ' + e.message); });
      });
    });
  }

  function notice(text) {
    var el = $('#mc-test-result');
    if (el) el.textContent = text;
  }

  function fill(d) {
    var c = d.config || {};
    var a = c.actor || {};
    $('#mc-enabled').value = String(!!c.enabled);
    $('#mc-paused').value = String(!!c.paused);
    $('#mc-preset').value = a.preset || 'female';
    $('#mc-style').value = a.style || 'dress';
    $('#mc-accessory').value = a.accessory || 'veil';
    $('#mc-skin').value = a.skin || '#f2c6a4';
    $('#mc-hair').value = a.hair || '#3a2318';
    $('#mc-outfit').value = a.outfit || '#a51f3c';
    $('#mc-speed').value = c.speed || 0.98;
    $('#mc-model').value = c.model || '';
    $('#mc-personality').value = c.personality || 'playful';
    $('#mc-language').value = c.language || 'en';
    $('#mc-frequency').value = c.frequency || 1;
    $('#mc-maxchars').value = c.maxChars || 180;
    $('#mc-auto-welcome').value = String(c.autoWelcome !== false);
    $('#mc-auto-gift').value = String(c.autoGift !== false);
    $('#mc-auto-ceremony').value = String(c.autoCeremony !== false);
    $('#mc-auto-interaction').value = String(c.autoInteraction !== false);
    $('#mc-idle').value = String(c.idleHosting !== false);
    $('#mc-cooldown').value = (Number(c.cooldownMs) || 6000) / 1000;
    $('#mc-merge').value = (Number(c.giftMergeWindowMs) || 2500) / 1000;
    $('#mc-idle-interval').value = (Number(c.idleIntervalMs) || 45000) / 1000;
    var p = c.priorities || {};
    $('#mc-p-welcome').value = p.welcome || 6;
    $('#mc-p-gift').value = p.gift || 5;
    $('#mc-p-ceremony').value = p.ceremony || 10;
    $('#mc-p-interaction').value = p.interaction || 3;
    $('#mc-p-idle').value = p.idle || 1;
    $('#mc-p-manual').value = p.manual || 8;

    // provider select
    var provSel = $('#mc-provider');
    var wanted = c.providerId || '';
    provSel.innerHTML = '<option value="">Theo mặc định hệ thống</option>' +
      (d.providers || []).map(function (pv) {
        return '<option value="' + esc(pv.id) + '">' + esc(pv.name) + ' (' + esc(pv.type) + ')' + (pv.enabled ? '' : ' — đang tắt') + '</option>';
      }).join('');
    provSel.value = wanted;

    // runtime
    var rt = d.runtime || {};
    var pill = $('#mc-status-pill');
    var paused = !!c.paused, enabled = !!c.enabled;
    pill.textContent = !enabled ? '⚪ Đang tắt' : paused ? '⏸️ Tạm dừng' : (rt.speakingUntil > Date.now() ? '🔴 Đang nói' : '🟢 Đang chờ');
    pill.className = 'mc-pill ' + (!enabled ? 'off' : paused ? 'paused' : 'on');

    var st = rt.stats || {};
    $('#mc-kpi-spoken').textContent = st.spoken || 0;
    $('#mc-kpi-ai').textContent = st.generated || 0;
    $('#mc-kpi-fallback').textContent = st.fallback || 0;
    $('#mc-kpi-suppressed').textContent = st.suppressed || 0;
    $('#mc-last-line').value = rt.lastLine || '';
    $('#mc-last-error').value = rt.lastError ? (rt.lastError.message + ' • ' + rt.lastError.at) : '';
  }

  function patchFromForm() {
    return {
      enabled: $('#mc-enabled').value === 'true',
      paused: $('#mc-paused').value === 'true',
      actor: {
        preset: $('#mc-preset').value,
        style: $('#mc-style').value,
        accessory: $('#mc-accessory').value,
        skin: $('#mc-skin').value,
        hair: $('#mc-hair').value,
        outfit: $('#mc-outfit').value
      },
      voice: $('#mc-voice').value || '',
      speed: Number($('#mc-speed').value) || 0.98,
      providerId: $('#mc-provider').value || null,
      model: $('#mc-model').value.trim(),
      personality: $('#mc-personality').value,
      language: $('#mc-language').value,
      frequency: Number($('#mc-frequency').value) || 1,
      maxChars: Number($('#mc-maxchars').value) || 180,
      autoWelcome: $('#mc-auto-welcome').value === 'true',
      autoGift: $('#mc-auto-gift').value === 'true',
      autoCeremony: $('#mc-auto-ceremony').value === 'true',
      autoInteraction: $('#mc-auto-interaction').value === 'true',
      idleHosting: $('#mc-idle').value === 'true',
      cooldownMs: (Number($('#mc-cooldown').value) || 6) * 1000,
      giftMergeWindowMs: (Number($('#mc-merge').value) || 2.5) * 1000,
      idleIntervalMs: (Number($('#mc-idle-interval').value) || 45) * 1000,
      priorities: {
        welcome: Number($('#mc-p-welcome').value) || 6,
        gift: Number($('#mc-p-gift').value) || 5,
        ceremony: Number($('#mc-p-ceremony').value) || 10,
        interaction: Number($('#mc-p-interaction').value) || 3,
        idle: Number($('#mc-p-idle').value) || 1,
        manual: Number($('#mc-p-manual').value) || 8
      }
    };
  }

  async function apply(patch) {
    var d = await api('/api/mc/config', { method: 'POST', body: patch });
    state.data = d;
    fill(d);
    return d;
  }

  async function save() {
    if (state.busy) return;
    state.busy = true;
    try {
      await apply(patchFromForm());
      notice('✅ Đã lưu cấu hình MC.');
    } catch (e) {
      notice('❌ ' + e.message);
    } finally {
      state.busy = false;
    }
  }

  async function act(path, opts, okText) {
    try {
      await api(path, opts || { method: 'POST' });
      await load();
      if (okText) notice(okText);
    } catch (e) {
      notice('❌ ' + e.message);
    }
  }

  async function say() {
    var text = $('#mc-say-text').value.trim();
    if (!text) { notice('Hãy nhập nội dung cần đọc.'); return; }
    try {
      var r = await api('/api/mc/say', { method: 'POST', body: { text: text } });
      notice(r.spoken ? '📣 Đã đưa vào hàng đợi giọng đọc.' : '⚠️ MC đang tắt hoặc câu bị trùng nên không đọc.');
      $('#mc-say-text').value = '';
      await load();
    } catch (e) {
      notice('❌ ' + e.message);
    }
  }

  async function testAi() {
    notice('🧠 Đang gọi AI…');
    try {
      var r = await api('/api/mc/test-ai', { method: 'POST', body: { kind: 'test' } });
      var res = r.result || {};
      notice('🧠 ' + (res.text || '(trống)') +
        '  •  nguồn: ' + (res.source === 'ai' ? 'AI' : 'mẫu câu') +
        (res.meta && res.meta.providerId ? ' / ' + res.meta.providerId : '') +
        (res.meta && res.meta.latencyMs ? ' / ' + res.meta.latencyMs + ' ms' : ''));
    } catch (e) {
      notice('❌ ' + e.message);
    }
  }

  async function testVoice() {
    var text = $('#mc-say-text').value.trim() || 'Xin chào cả nhà, tôi là MC của tiệc cưới hôm nay.';
    try {
      await api('/api/mc/test-voice', { method: 'POST', body: { text: text } });
      notice('🔊 Đã gửi câu mẫu vào hàng đợi Kokoro.');
    } catch (e) {
      notice('❌ ' + e.message);
    }
  }

  async function loadModels() {
    var id = $('#mc-provider').value;
    if (!id) { notice('Hãy chọn một nhà cung cấp cụ thể trước.'); return; }
    try {
      var r = await api('/api/ai/providers/' + encodeURIComponent(id) + '/models?refresh=1');
      var models = r.models || r.data || [];
      $('#mc-model-list').innerHTML = models.map(function (m) {
        var mid = m.id || m.name || m;
        return '<option value="' + esc(mid) + '"></option>';
      }).join('');
      notice('📚 Đã tải ' + models.length + ' model.');
    } catch (e) {
      notice('❌ ' + e.message);
    }
  }

  async function loadVoices() {
    try {
      var res = await fetch('/api/tts/status', { cache: 'no-store' });
      var st = await res.json();
      var sel = $('#mc-voice');
      if (!sel) return;
      var voices = st.voices || [];
      sel.innerHTML = '<option value="">Theo cài đặt chung</option>' + voices.map(function (v) {
        return '<option value="' + esc(v.id) + '">' + esc(v.label || v.id) + '</option>';
      }).join('');
      if (state.data && state.data.config) sel.value = state.data.config.voice || '';
    } catch (e) {}
  }

  async function load() {
    try {
      var d = await api('/api/mc/config');
      state.data = d;
      fill(d);
      await loadVoices();
      if (d.config) $('#mc-voice').value = d.config.voice || '';
    } catch (e) {
      notice('Không tải được cấu hình MC: ' + e.message);
    }
  }

  function startPolling() {
    if (state.poll) return;
    state.poll = setInterval(function () {
      var pane = document.getElementById('tab-mc');
      if (pane && pane.classList.contains('active')) {
        api('/api/mc/config').then(function (d) { state.data = d; fill(d); }).catch(function () {});
      }
    }, 5000);
  }

  function init() {
    section = document.getElementById('tab-mc');
    if (!section || section.dataset.ready === '1') return;
    section.dataset.ready = '1';
    section.innerHTML = markup();
    bind();
    load().then(startPolling).catch(startPolling);

    var navBtn = document.querySelector('.nav-item[data-tab="tab-mc"]');
    if (navBtn) navBtn.addEventListener('click', function () { load(); });
  }

  window.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();

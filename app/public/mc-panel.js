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
      '  <small>VIRTUAL HOST • LIVE STAGE</small>',
      '  <h2>🎤 AI Wedding MC</h2>',
      '  <p>A virtual American wedding reception host who greets guests, thanks gifts, hosts the reception moments and keeps the livestream moving. Shares the existing AI provider manager and Kokoro voice.</p>',
      '</div>',

      '<div class="card-panel">',
      '  <div class="panel-header">',
      '    <h3>MC Status</h3>',
      '    <small id="mc-status-pill" class="mc-pill off">Loading…</small>',
      '  </div>',
      '  <div class="ai-kpi-grid">',
      '    <div class="ai-kpi"><b id="mc-kpi-spoken">0</b><span>Lines spoken</span></div>',
      '    <div class="ai-kpi"><b id="mc-kpi-ai">0</b><span>AI written</span></div>',
      '    <div class="ai-kpi"><b id="mc-kpi-fallback">0</b><span>Scripted fallback</span></div>',
      '    <div class="ai-kpi"><b id="mc-kpi-suppressed">0</b><span>Duplicates blocked</span></div>',
      '  </div>',
      '  <div class="form-grid">',
      '    <div class="form-group"><label>Enable MC:</label><select id="mc-enabled"><option value="true">On</option><option value="false">Off</option></select></div>',
      '    <div class="form-group"><label>Pause (silent immediately):</label><select id="mc-paused"><option value="false">Running</option><option value="true">Paused</option></select></div>',
      '    <div class="form-group"><label>Last line spoken:</label><input type="text" id="mc-last-line" readonly placeholder="—"></div>',
      '    <div class="form-group"><label>Last error:</label><input type="text" id="mc-last-error" readonly placeholder="No errors"></div>',
      '  </div>',
      '  <div class="mc-now-bar">',
      '    <button class="btn mc-btn-now" id="mc-btn-speaknow" type="button">🎤 SPEAK NOW</button>',
      '    <span class="mc-now-hint">Write and speak a fresh line right away instead of waiting for the idle cycle. Limited to one request every 5 seconds and never cuts in front of a higher-priority reception announcement.</span>',
      '  </div>',
      '  <div id="mc-now-result" class="ai-note"></div>',
      '  <div class="panel-footer">',
      '    <button class="btn btn-secondary" id="mc-btn-pause">⏸️ Pause MC</button>',
      '    <button class="btn btn-secondary" id="mc-btn-resume">▶️ Resume MC</button>',
      '    <button class="btn btn-secondary" id="mc-btn-refresh">🔄 Refresh status</button>',
      '  </div>',
      '</div>',

      '<div class="card-panel">',
      '  <div class="panel-header"><h3>Stage Character</h3><small>Lightweight 2D, safe for OBS Browser Source</small></div>',
      '  <div class="form-grid">',
      '    <div class="form-group"><label>Character preset:</label><select id="mc-preset"><option value="female">Female host (default)</option><option value="male">Male host</option></select></div>',
      '    <div class="form-group"><label>Outfit:</label><select id="mc-style"><option value="blazer">Blazer &amp; trousers (host)</option><option value="suit">Tailored suit</option></select></div>',
      '    <div class="form-group"><label>Accessory:</label><select id="mc-accessory"><option value="earrings">Minimal jewelry</option><option value="tie">Necktie</option><option value="open_collar">Open collar</option><option value="none">None</option></select></div>',
      '    <div class="form-group"><label>Skin tone:</label><input type="color" id="mc-skin" value="#f0c9a8"></div>',
      '    <div class="form-group"><label>Hair colour:</label><input type="color" id="mc-hair" value="#c9a15c"></div>',
      '    <div class="form-group"><label>Blazer / suit colour:</label><input type="color" id="mc-outfit" value="#161a2e"></div>',
      '  </div>',
      '  <p class="ai-note">Default look: salon-styled blonde hair, natural polished makeup, midnight-blue fitted blazer, champagne satin blouse, tailored trousers, heels and a wireless microphone. The male preset uses a tailored suit, crisp shirt, necktie and leather oxfords.</p>',
      '</div>',

      '<div class="card-panel">',
      '  <div class="panel-header"><h3>Voice &amp; AI Brain</h3><small>Shares Kokoro + the AI provider manager</small></div>',
      '  <div class="form-grid">',
      '    <div class="form-group"><label>Voice (Kokoro):</label><select id="mc-voice"><option value="">Use the global voice</option></select></div>',
      '    <div class="form-group"><label>Speaking rate:</label><input type="number" id="mc-speed" min="0.7" max="1.5" step="0.02" value="0.98"></div>',
      '    <div class="form-group"><label>AI provider:</label><select id="mc-provider"><option value="">System default</option></select></div>',
      '    <div class="form-group"><label>Model (blank = provider default):</label><input type="text" id="mc-model" list="mc-model-list" placeholder="openrouter/free"><datalist id="mc-model-list"></datalist></div>',
      '    <div class="form-group"><label>MC personality (US reception style):</label><select id="mc-personality">',
      '      <option value="american_warm">Warm &amp; charismatic (default)</option>',
      '      <option value="american_funny">Funny &amp; playful</option>',
      '      <option value="american_classic">Classic &amp; polished</option>',
      '    </select></div>',
      '    <div class="form-group"><label>Spoken language:</label><select id="mc-language"><option value="en">English (US) – en-US</option><option value="vi">Vietnamese</option></select></div>',
      '    <div class="form-group"><label>Speaking frequency (0.3–2):</label><input type="number" id="mc-frequency" min="0.3" max="2" step="0.1" value="1"></div>',
      '    <div class="form-group"><label>Max length (characters):</label><input type="number" id="mc-maxchars" min="60" max="320" step="10" value="180"></div>',
      '  </div>',
      '  <div class="panel-footer">',
      '    <button class="btn btn-secondary" id="mc-btn-models">📚 Load model list</button>',
      '    <button class="btn btn-secondary" id="mc-btn-testai">🧠 Test line</button>',
      '    <button class="btn btn-secondary" id="mc-btn-testvoice">🔊 Test voice</button>',
      '  </div>',
      '  <div id="mc-test-result" class="ai-note"></div>',
      '</div>',

      '<div class="card-panel">',
      '  <div class="panel-header"><h3>Behaviour &amp; Anti-Spam</h3><small>Keeps the MC from talking over the LIVE</small></div>',
      '  <div class="form-grid">',
      '    <div class="form-group"><label>Welcome new guests:</label><select id="mc-auto-welcome"><option value="true">On</option><option value="false">Off</option></select></div>',
      '    <div class="form-group"><label>Thank gifts:</label><select id="mc-auto-gift"><option value="true">On</option><option value="false">Off</option></select></div>',
      '    <div class="form-group"><label>Host reception moments:</label><select id="mc-auto-ceremony"><option value="true">On</option><option value="false">Off</option></select></div>',
      '    <div class="form-group"><label>Answer comments:</label><select id="mc-auto-interaction"><option value="true">On (limited)</option><option value="false">Off</option></select></div>',
      '    <div class="form-group"><label>Idle hosting:</label><select id="mc-idle"><option value="true">On</option><option value="false">Off</option></select></div>',
      '    <div class="form-group"><label>Gap between lines (seconds):</label><input type="number" id="mc-cooldown" min="1.5" max="120" step="0.5" value="6"></div>',
      '    <div class="form-group"><label>Merge gift bursts within (seconds):</label><input type="number" id="mc-merge" min="0.5" max="15" step="0.5" value="2.5"></div>',
      '    <div class="form-group"><label>Idle hosting interval (seconds):</label><input type="number" id="mc-idle-interval" min="15" max="600" step="5" value="45"></div>',
      '    <div class="form-group"><label>Duck music while the MC speaks:</label><select id="mc-duck-enabled"><option value="true">On</option><option value="false">Off</option></select></div>',
      '    <div class="form-group"><label>Music volume while speaking (%):</label><input type="number" id="mc-duck-volume" min="1" max="60" step="1" value="12"></div>',
      '  </div>',
      '  <div class="form-grid mc-priority-grid">',
      '    <div class="form-group"><label>Priority — welcome:</label><input type="number" id="mc-p-welcome" min="1" max="10" value="6"></div>',
      '    <div class="form-group"><label>Priority — gifts:</label><input type="number" id="mc-p-gift" min="1" max="10" value="5"></div>',
      '    <div class="form-group"><label>Priority — reception moments:</label><input type="number" id="mc-p-ceremony" min="1" max="10" value="10"></div>',
      '    <div class="form-group"><label>Priority — comments:</label><input type="number" id="mc-p-interaction" min="1" max="10" value="3"></div>',
      '    <div class="form-group"><label>Priority — idle hosting:</label><input type="number" id="mc-p-idle" min="1" max="10" value="1"></div>',
      '    <div class="form-group"><label>Priority — manual announcement:</label><input type="number" id="mc-p-manual" min="1" max="10" value="8"></div>',
      '  </div>',
      '  <div class="panel-footer">',
      '    <button class="btn btn-primary" id="mc-btn-save">💾 Save MC settings</button>',
      '  </div>',
      '</div>',

      '<div class="card-panel">',
      '  <div class="panel-header"><h3>Manual Announcement</h3><small>Speaks through the existing Kokoro queue</small></div>',
      '  <div class="form-group"><label>What the MC should say:</label>',
      '    <textarea id="mc-say-text" rows="3" maxlength="240" placeholder="Ladies and gentlemen, please raise your glasses to the bride and groom!"></textarea>',
      '  </div>',
      '  <div class="panel-footer">',
      '    <button class="btn btn-primary" id="mc-btn-say">📣 Speak announcement</button>',
      '    <button class="btn btn-secondary" id="mc-btn-welcome">👋 Welcome guests now</button>',
      '    <button class="btn btn-secondary" id="mc-btn-farewell">🌙 Farewell</button>',
      '  </div>',
      '  <p class="ai-note">The AI only writes dialogue. Generated lines never trigger system actions, never read out gift coin values and are length-limited before they reach Kokoro.</p>',
      '</div>'
    ].join('');
  }

  function bind() {
    $('#mc-btn-save').addEventListener('click', save);
    $('#mc-btn-speaknow').addEventListener('click', speakNow);
    $('#mc-btn-pause').addEventListener('click', function () { act('/api/mc/pause'); });
    $('#mc-btn-resume').addEventListener('click', function () { act('/api/mc/resume'); });
    $('#mc-btn-refresh').addEventListener('click', load);
    $('#mc-btn-say').addEventListener('click', say);
    $('#mc-btn-welcome').addEventListener('click', function () { act('/api/mc/welcome', { method: 'POST' }, 'Welcome line queued.'); });
    $('#mc-btn-farewell').addEventListener('click', function () { act('/api/mc/farewell', { method: 'POST' }, 'Farewell queued.'); });
    $('#mc-btn-testai').addEventListener('click', testAi);
    $('#mc-btn-testvoice').addEventListener('click', testVoice);
    $('#mc-btn-models').addEventListener('click', loadModels);

    $('#mc-preset').addEventListener('change', function () {
      var male = $('#mc-preset').value === 'male';
      $('#mc-style').value = male ? 'suit' : 'blazer';
      $('#mc-accessory').value = male ? 'tie' : 'earrings';
    });

    ['#mc-enabled', '#mc-paused'].forEach(function (sel) {
      $(sel).addEventListener('change', function () {
        var patch = {};
        patch[sel === '#mc-enabled' ? 'enabled' : 'paused'] = $(sel).value === 'true';
        apply(patch).catch(function (e) { notice('Error: ' + e.message); });
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
    $('#mc-style').value = a.style || 'blazer';
    $('#mc-accessory').value = a.accessory || 'earrings';
    $('#mc-skin').value = a.skin || '#f0c9a8';
    $('#mc-hair').value = a.hair || '#c9a15c';
    $('#mc-outfit').value = a.outfit || '#161a2e';
    $('#mc-speed').value = c.speed || 0.98;
    $('#mc-model').value = c.model || '';
    $('#mc-personality').value = c.personality || 'american_warm';
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
    $('#mc-duck-enabled').value = String(c.duckEnabled !== false);
    $('#mc-duck-volume').value = Number.isFinite(Number(c.duckVolume)) ? Number(c.duckVolume) : 12;
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
    provSel.innerHTML = '<option value="">System default</option>' +
      (d.providers || []).map(function (pv) {
        return '<option value="' + esc(pv.id) + '">' + esc(pv.name) + ' (' + esc(pv.type) + ')' + (pv.enabled ? '' : ' — disabled') + '</option>';
      }).join('');
    provSel.value = wanted;

    // runtime
    var rt = d.runtime || {};
    var pill = $('#mc-status-pill');
    var paused = !!c.paused, enabled = !!c.enabled;
    pill.textContent = !enabled ? '⚪ Off' : paused ? '⏸️ Paused' : (rt.speakingUntil > Date.now() ? '🔴 Speaking' : '🟢 Ready');
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
      duckEnabled: $('#mc-duck-enabled').value === 'true',
      duckVolume: Number($('#mc-duck-volume').value) || 12,
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
      notice('✅ MC settings saved.');
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

  async function speakNow() {
    var btn = $('#mc-btn-speaknow');
    var out = $('#mc-now-result');
    if (!btn || btn.disabled) return;

    var original = btn.textContent;
    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = '⏳ Writing a line…';
    if (out) { out.textContent = '🧠 The MC is thinking of a fresh line…'; out.style.color = '#ffd88a'; }

    try {
      var r = await api('/api/mc/speak-now', { method: 'POST' });
      var res = r.result || r;
      if (out) {
        out.textContent = '✅ MC: ' + (res.text || '') + (res.source === 'ai' ? '  •  AI' : '  •  scripted fallback');
        out.style.color = '#8ff0b0';
      }
      await load();
    } catch (e) {
      if (out) { out.textContent = '⚠️ ' + e.message; out.style.color = '#ff9f9f'; }
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.textContent = original;
    }
  }

  async function say() {
    var text = $('#mc-say-text').value.trim();
    if (!text) { notice('Type the announcement first.'); return; }
    try {
      var r = await api('/api/mc/say', { method: 'POST', body: { text: text } });
      notice(r.spoken ? '📣 Queued for the voice engine.' : '⚠️ The MC is off, paused or the line duplicates the previous one.');
      $('#mc-say-text').value = '';
      await load();
    } catch (e) {
      notice('❌ ' + e.message);
    }
  }

  async function testAi() {
    notice('🧠 Calling the AI…');
    try {
      var r = await api('/api/mc/test-ai', { method: 'POST', body: { kind: 'test' } });
      var res = r.result || {};
      notice('🧠 ' + (res.text || '(empty)') +
        '  •  source: ' + (res.source === 'ai' ? 'AI' : 'scripted') +
        (res.meta && res.meta.providerId ? ' / ' + res.meta.providerId : '') +
        (res.meta && res.meta.latencyMs ? ' / ' + res.meta.latencyMs + ' ms' : ''));
    } catch (e) {
      notice('❌ ' + e.message);
    }
  }

  async function testVoice() {
    var text = $('#mc-say-text').value.trim() || 'Good evening, everyone — I am your host for tonight\'s celebration.';
    try {
      await api('/api/mc/test-voice', { method: 'POST', body: { text: text } });
      notice('🔊 Sample line queued for Kokoro.');
    } catch (e) {
      notice('❌ ' + e.message);
    }
  }

  async function loadModels() {
    var id = $('#mc-provider').value;
    if (!id) { notice('Select a specific AI provider first.'); return; }
    try {
      var r = await api('/api/ai/providers/' + encodeURIComponent(id) + '/models?refresh=1');
      var models = r.models || r.data || [];
      $('#mc-model-list').innerHTML = models.map(function (m) {
        var mid = m.id || m.name || m;
        return '<option value="' + esc(mid) + '"></option>';
      }).join('');
      notice('📚 Loaded ' + models.length + ' model(s).');
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
      sel.innerHTML = '<option value="">Use the global voice</option>' + voices.map(function (v) {
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
      notice('Could not load the MC settings: ' + e.message);
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

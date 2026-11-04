/**
 * AI Providers dashboard (Vietnamese, vanilla JS, no framework).
 *
 * Talks only to /api/ai/*. API keys are write-only from here: the server returns
 * a masked value and never the secret, so this file cannot leak a key.
 */
(() => {
  'use strict';

  const aq = (sel) => document.querySelector(sel);
  const aqAll = (sel) => Array.from(document.querySelectorAll(sel));

  const TYPE_LABEL = {
    openrouter: 'OpenRouter',
    ollama: 'Ollama',
    openai: 'OpenAI',
    'openai-compatible': 'OpenAI-compatible'
  };

  const state = {
    config: null,
    editingId: null,
    models: {},
    busy: false
  };

  // ---------------------------------------------------------------- helpers
  async function aiFetch(path, options = {}) {
    const res = await fetch(path, {
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg = (data && data.error) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.code = data && data.code;
      err.status = res.status;
      err.attempts = data && data.attempts;
      throw err;
    }
    return data || {};
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shortTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('vi-VN') + ' ' + d.toLocaleDateString('vi-VN');
  }

  /**
   * Four distinct facts, never collapsed into a single "connected" light:
   * disabled / not configured / reachable-but-unauthenticated / authenticated.
   */
  function statusBadge(p) {
    const st = (state.config && state.config.status && state.config.status[p.id]) || {};
    if (!p.enabled) return { cls: 'off', text: '⚪ Đang tắt' };
    if (p.secretState === 'unreadable') return { cls: 'err', text: '🔑 Khoá đã lưu không giải mã được — nhập lại' };
    const needsKey = p.type === 'openai' || p.type === 'openrouter';
    if (needsKey && !p.hasApiKey) return { cls: 'warn', text: '🟡 Chưa cấu hình (thiếu API key)' };
    if (st.authenticated === true) return { cls: 'ok', text: '🟢 Đã xác thực' };
    if (st.reachable === true && st.authenticated === false) return { cls: 'err', text: '🟠 Kết nối được, xác thực lỗi' };
    if (st.reachable === false) return { cls: 'err', text: '🔴 Không kết nối được' };
    return { cls: 'off', text: '⚪ Chưa kiểm tra' };
  }

  // ---------------------------------------------------------------- render
  function renderProviders() {
    const cfg = state.config;
    const list = aq('#ai-provider-list');
    if (!list) return;
    const providers = (cfg && cfg.providers) || [];

    if (!providers.length) {
      list.innerHTML = '<p class="ai-note">Chưa có nhà cung cấp nào. Bấm “➕ Thêm nhà cung cấp” để bắt đầu.</p>';
    } else {
      list.innerHTML = providers
        .map((p) => {
          const badge = statusBadge(p);
          const st = (cfg.status && cfg.status[p.id]) || {};
          const isPrimary = cfg.defaultProviderId === p.id;
          const isFallback = cfg.fallback && cfg.fallback.providerId === p.id;
          const models = state.models[p.id] || [];
          const cls = ['ai-provider', p.enabled ? '' : 'disabled', isPrimary ? 'primary' : '', isFallback ? 'fallback' : '']
            .filter(Boolean)
            .join(' ');

          return `
          <div class="${cls}" data-id="${esc(p.id)}">
            <div class="ai-provider-head">
              <div>
                <div class="ai-provider-name">
                  ${esc(p.name)}
                  <span class="ai-badge type">${esc(TYPE_LABEL[p.type] || p.type)}</span>
                  ${isPrimary ? '<span class="ai-badge ok">CHÍNH</span>' : ''}
                  ${isFallback ? '<span class="ai-badge warn">DỰ PHÒNG</span>' : ''}
                </div>
                <div class="ai-provider-meta">
                  URL: <code>${esc(p.baseUrl)}</code><br>
                  Model: <code>${esc(p.model || '(chưa chọn)')}</code> · Timeout: ${esc(p.timeoutMs)} ms<br>
                  API key: ${p.hasApiKey ? esc(p.apiKeyMasked) + ' <span class="ai-badge off">đã lưu</span>' : '<span class="ai-badge off">chưa có</span>'}
                  ${st.lastSuccessAt ? ' · Lần OK gần nhất: ' + esc(shortTime(st.lastSuccessAt)) : ''}
                </div>
              </div>
              <span class="ai-badge ${badge.cls}" data-role="badge">${badge.text}</span>
            </div>
            ${st.lastError ? `<div class="ai-provider-error">Lỗi gần nhất: ${esc(st.lastError)}</div>` : ''}
            <div class="ai-model-row">
              <select data-role="model-select">
                <option value="">— Chọn model —</option>
                ${models
                  .map((m) => `<option value="${esc(m.id)}" ${p.model === m.id ? 'selected' : ''}>${esc(m.id)}${m.parameterSize ? ' · ' + esc(m.parameterSize) : ''}</option>`)
                  .join('')}
                ${p.model && !models.some((m) => m.id === p.model) ? `<option value="${esc(p.model)}" selected>${esc(p.model)}</option>` : ''}
              </select>
              <button class="btn btn-secondary btn-sm" data-act="models">📥 Tải model</button>
            </div>
            <div class="ai-actions">
              <button class="btn btn-secondary btn-sm" data-act="test-conn">🔌 Kiểm tra kết nối</button>
              <button class="btn btn-secondary btn-sm" data-act="test-gen">🧪 Đọc thử AI</button>
              <button class="btn btn-secondary btn-sm" data-act="primary">⭐ Đặt làm chính</button>
              <button class="btn btn-secondary btn-sm" data-act="fallback">🛟 Đặt làm dự phòng</button>
              <button class="btn btn-secondary btn-sm" data-act="edit">✏️ Sửa</button>
              <button class="btn btn-secondary btn-sm" data-act="toggle">${p.enabled ? '⏸️ Tắt' : '▶️ Bật'}</button>
              <button class="btn btn-danger btn-sm" data-act="delete">🗑️ Xoá</button>
            </div>
            <div data-role="result"></div>
          </div>`;
        })
        .join('');
    }

    const enabled = providers.filter((p) => p.enabled).length;
    const authed = providers.filter((p) => (cfg.status[p.id] || {}).authenticated === true).length;
    if (aq('#ai-summary')) {
      aq('#ai-summary').textContent = `${providers.length} nhà cung cấp · ${enabled} đang bật · ${authed} đã xác thực`;
    }
    if (aq('#ai-encryption-note')) {
      aq('#ai-encryption-note').textContent = cfg.secretsEncryption
        ? `Khoá API được mã hoá (${cfg.secretsEncryption})`
        : '';
    }

    renderRouting();
  }

  function renderRouting() {
    const cfg = state.config;
    if (!cfg) return;
    const providers = cfg.providers || [];
    const opts = (selected) =>
      '<option value="">— Không chọn —</option>' +
      providers
        .map((p) => `<option value="${esc(p.id)}" ${selected === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(TYPE_LABEL[p.type] || p.type)})</option>`)
        .join('');

    if (aq('#ai-default-select')) aq('#ai-default-select').innerHTML = opts(cfg.defaultProviderId);
    if (aq('#ai-fallback-select')) aq('#ai-fallback-select').innerHTML = opts(cfg.fallback && cfg.fallback.providerId);
    if (aq('#ai-fallback-model')) aq('#ai-fallback-model').value = (cfg.fallback && cfg.fallback.model) || '';
    if (aq('#ai-fallback-enabled')) aq('#ai-fallback-enabled').value = String(!(cfg.fallback && cfg.fallback.enabled === false));
    if (aq('#ai-fallback-attempts')) aq('#ai-fallback-attempts').value = (cfg.fallback && cfg.fallback.maxAttempts) || 2;
    if (aq('#ai-fallback-timeout')) aq('#ai-fallback-timeout').value = (cfg.fallback && cfg.fallback.timeoutMs) || 20000;

    const text = cfg.text || {};
    if (aq('#ai-text-enabled')) aq('#ai-text-enabled').value = String(Boolean(text.enabled));
    if (aq('#ai-text-timeout')) aq('#ai-text-timeout').value = text.timeoutMs || 6000;
    if (aq('#ai-text-temp')) aq('#ai-text-temp').value = text.temperature ?? 0.8;
    if (aq('#ai-text-maxtokens')) aq('#ai-text-maxtokens').value = text.maxTokens || 120;
  }

  function showResult(cardEl, html, isError) {
    const box = cardEl && cardEl.querySelector('[data-role="result"]');
    if (box) box.innerHTML = `<div class="ai-result ${isError ? 'err' : ''}">${html}</div>`;
  }

  // ---------------------------------------------------------------- data
  async function loadAll() {
    try {
      const data = await aiFetch('/api/ai/providers');
      state.config = data;
      renderProviders();
    } catch (err) {
      const list = aq('#ai-provider-list');
      if (list) list.innerHTML = `<div class="ai-provider-error">Không tải được cấu hình AI: ${esc(err.message)}</div>`;
    }
  }

  async function loadUsage() {
    try {
      const data = await aiFetch('/api/ai/usage');
      const s = data.stats || {};
      if (aq('#ai-kpi-total')) aq('#ai-kpi-total').textContent = s.total || 0;
      if (aq('#ai-kpi-ok')) aq('#ai-kpi-ok').textContent = s.successful || 0;
      if (aq('#ai-kpi-fail')) aq('#ai-kpi-fail').textContent = s.failed || 0;
      if (aq('#ai-kpi-avg')) aq('#ai-kpi-avg').textContent = s.avgDurationMs ? s.avgDurationMs + ' ms' : '–';

      const tbody = aq('#ai-log-table tbody');
      if (tbody) {
        const rows = (data.entries || []).slice(0, 50);
        tbody.innerHTML = rows.length
          ? rows
              .map(
                (e) => `<tr>
                  <td>${esc(shortTime(e.ts))}</td>
                  <td>${esc(e.providerName || e.providerId || '—')}</td>
                  <td>${esc(e.model || '—')}</td>
                  <td>${esc(e.task || '—')}${e.fallbackUsed ? ' <span class="ai-badge warn">dự phòng</span>' : ''}</td>
                  <td>${esc(e.durationMs)}</td>
                  <td>${e.ok ? '<span class="ai-badge ok">OK</span>' : `<span class="ai-badge err">${esc(e.errorCode || 'lỗi')}</span>`}</td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="6" style="text-align:center;color:#9e97a4;">Chưa có yêu cầu AI nào</td></tr>';
      }
    } catch {}
  }

  // ---------------------------------------------------------------- form
  const FORM_HINTS = {
    openrouter: { base: 'https://openrouter.ai/api/v1', key: 'Khoá OpenRouter (sk-or-...). Nếu đã có trong .env hệ thống sẽ tự dùng.' },
    ollama: { base: 'http://10.0.0.142:11434', key: 'Ollama không cần API key.' },
    openai: { base: 'https://api.openai.com/v1', key: 'API key từ platform.openai.com — gói ChatGPT Plus KHÔNG kèm quyền API.' },
    'openai-compatible': { base: 'https://your-server/v1', key: 'Để trống nếu máy chủ không yêu cầu khoá. Địa chỉ nội bộ/LAN bị chặn vì an toàn.' }
  };

  function openForm(provider) {
    const card = aq('#ai-form-card');
    if (!card) return;
    card.style.display = '';
    state.editingId = provider ? provider.id : null;
    aq('#ai-form-title').textContent = provider ? `Sửa: ${provider.name}` : 'Thêm nhà cung cấp';

    aq('#ai-f-type').value = provider ? provider.type : 'openrouter';
    aq('#ai-f-name').value = provider ? provider.name : '';
    aq('#ai-f-baseurl').value = provider ? provider.baseUrl : FORM_HINTS.openrouter.base;
    aq('#ai-f-model').value = provider ? provider.model : '';
    aq('#ai-f-timeout').value = provider ? provider.timeoutMs : 20000;
    aq('#ai-f-enabled').value = String(provider ? provider.enabled : true);
    aq('#ai-f-apikey').value = '';
    aq('#ai-f-apikey').placeholder = provider && provider.hasApiKey
      ? `Đã lưu ${provider.apiKeyMasked} — để trống nếu không đổi`
      : 'Dán API key (để trống nếu không dùng)';
    aq('#ai-f-clear-key').style.display = provider && provider.hasApiKey ? '' : 'none';
    applyTypeHints();
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function applyTypeHints() {
    const type = aq('#ai-f-type') ? aq('#ai-f-type').value : 'openrouter';
    const hint = FORM_HINTS[type] || FORM_HINTS.openrouter;
    if (aq('#ai-f-baseurl-hint')) aq('#ai-f-baseurl-hint').textContent = hint.base;
    if (aq('#ai-f-key-hint')) aq('#ai-f-key-hint').textContent = hint.key;
    if (aq('#ai-f-baseurl') && !aq('#ai-f-baseurl').value.trim()) aq('#ai-f-baseurl').value = hint.base;
    const keyGroup = aq('#ai-f-apikey') ? aq('#ai-f-apikey').closest('.form-group') : null;
    if (keyGroup) keyGroup.style.display = type === 'ollama' ? 'none' : '';
  }

  function closeForm() {
    const card = aq('#ai-form-card');
    if (card) card.style.display = 'none';
    state.editingId = null;
  }

  async function saveForm() {
    if (state.busy) return;
    const payload = {
      type: aq('#ai-f-type').value,
      name: aq('#ai-f-name').value.trim(),
      baseUrl: aq('#ai-f-baseurl').value.trim(),
      model: aq('#ai-f-model').value.trim(),
      timeoutMs: Number(aq('#ai-f-timeout').value) || 20000,
      enabled: aq('#ai-f-enabled').value === 'true'
    };
    const key = aq('#ai-f-apikey').value.trim();
    if (key) payload.apiKey = key;

    state.busy = true;
    try {
      if (state.editingId) await aiFetch(`/api/ai/providers/${encodeURIComponent(state.editingId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await aiFetch('/api/ai/providers', { method: 'POST', body: JSON.stringify(payload) });
      closeForm();
      await loadAll();
    } catch (err) {
      alert('Không lưu được nhà cung cấp:\n' + err.message);
    } finally {
      state.busy = false;
    }
  }

  // ---------------------------------------------------------------- actions
  async function withCard(card, fn) {
    try {
      await fn();
    } catch (err) {
      showResult(card, esc(err.message), true);
    }
  }

  async function onCardAction(card, act) {
    const id = card.dataset.id;
    const provider = (state.config.providers || []).find((p) => p.id === id);
    if (!provider && act !== 'models') return;

    if (act === 'edit') return openForm(provider);

    if (act === 'delete') {
      if (!confirm(`Xoá nhà cung cấp "${provider.name}"? Khoá API đã lưu cũng sẽ bị xoá.`)) return;
      await aiFetch(`/api/ai/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return loadAll();
    }

    if (act === 'toggle') {
      await aiFetch(`/api/ai/providers/${encodeURIComponent(id)}/${provider.enabled ? 'disable' : 'enable'}`, { method: 'POST' });
      return loadAll();
    }

    if (act === 'primary') {
      await aiFetch('/api/ai/default', { method: 'POST', body: JSON.stringify({ providerId: id }) });
      return loadAll();
    }

    if (act === 'fallback') {
      await aiFetch('/api/ai/fallback', {
        method: 'POST',
        body: JSON.stringify({ providerId: id, model: provider.model || aq('#ai-fallback-model').value.trim() })
      });
      return loadAll();
    }

    if (act === 'models') {
      showResult(card, '⏳ Đang tải danh sách model…');
      return withCard(card, async () => {
        const data = await aiFetch(`/api/ai/providers/${encodeURIComponent(id)}/models?refresh=1`);
        state.models[id] = data.models || [];
        renderProviders();
        const refreshed = aq(`.ai-provider[data-id="${id}"]`);
        showResult(refreshed, `✅ Đã tải ${state.models[id].length} model từ ${esc(provider.name)}.`);
      });
    }

    if (act === 'test-conn') {
      showResult(card, '⏳ Đang kiểm tra kết nối và xác thực…');
      return withCard(card, async () => {
        const data = await aiFetch(`/api/ai/providers/${encodeURIComponent(id)}/test-connection`, { method: 'POST' });
        const r = data.result || {};
        const lines = [
          `Endpoint: ${r.reachable ? '✅ phản hồi' : '❌ không phản hồi'}`,
          `Xác thực: ${r.authenticated ? '✅ thành công' : '❌ thất bại'}`,
          r.detail ? `Chi tiết: ${esc(r.detail)}` : '',
          r.latencyMs ? `Độ trễ: ${esc(r.latencyMs)} ms` : '',
          r.meta && r.meta.freeTier !== undefined ? `OpenRouter free tier: ${r.meta.freeTier}` : '',
          r.error ? `<span class="ai-kv">Mã lỗi: ${esc(r.error.code)}</span>` : ''
        ].filter(Boolean);
        const refreshed = aq(`.ai-provider[data-id="${id}"]`);
        showResult(refreshed || card, lines.join('\n'), !(r.reachable && r.authenticated));
        await loadAll();
      });
    }

    if (act === 'test-gen') {
      showResult(card, '⏳ Đang gọi AI tạo văn bản thử…');
      return withCard(card, async () => {
        const data = await aiFetch(`/api/ai/providers/${encodeURIComponent(id)}/test-generation`, {
          method: 'POST',
          body: JSON.stringify({
            prompt: 'Chúc mừng đám cưới bằng một câu ngắn.',
            model: provider.model || undefined
          })
        });
        const r = data.result || {};
        const usage = r.usage
          ? `tokens: ${r.usage.promptTokens ?? '?'} + ${r.usage.completionTokens ?? '?'} = ${r.usage.totalTokens ?? '?'}`
          : 'tokens: không có';
        const refreshed = aq(`.ai-provider[data-id="${id}"]`);
        showResult(
          refreshed || card,
          `✅ ${esc(r.text)}\n<span class="ai-kv">${esc(r.providerName)} · ${esc(r.model)} · ${esc(r.latencyMs)} ms · ${esc(usage)}</span>`
        );
        await loadAll();
        await loadUsage();
      });
    }

    const sel = card.querySelector('[data-role="model-select"]');
    if (sel && sel.value && sel.value !== provider.model) {
      // Selecting a model in the dropdown saves it for that provider.
      await aiFetch(`/api/ai/providers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ model: sel.value }) });
      await loadAll();
    }
  }

  // ---------------------------------------------------------------- wiring
  function init() {
    const list = aq('#ai-provider-list');
    if (!list) return;

    list.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const card = btn.closest('.ai-provider');
      if (!card) return;
      onCardAction(card, btn.dataset.act).catch((err) => showResult(card, esc(err.message), true));
    });

    list.addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-role="model-select"]');
      if (!sel || !sel.value) return;
      const card = sel.closest('.ai-provider');
      onCardAction(card, 'model-select').catch((err) => showResult(card, esc(err.message), true));
    });

    aq('#ai-btn-refresh')?.addEventListener('click', () => { loadAll(); loadUsage(); });
    aq('#ai-btn-new')?.addEventListener('click', () => openForm(null));
    aq('#ai-form-cancel')?.addEventListener('click', closeForm);
    aq('#ai-f-save')?.addEventListener('click', saveForm);
    aq('#ai-f-type')?.addEventListener('change', applyTypeHints);

    aq('#ai-f-clear-key')?.addEventListener('click', async () => {
      if (!state.editingId) return;
      if (!confirm('Xoá API key đã lưu của nhà cung cấp này?')) return;
      await aiFetch(`/api/ai/providers/${encodeURIComponent(state.editingId)}`, { method: 'PATCH', body: JSON.stringify({ apiKey: null }) });
      closeForm();
      await loadAll();
    });

    aq('#ai-routing-save')?.addEventListener('click', async () => {
      try {
        const providerId = aq('#ai-default-select').value;
        if (providerId) await aiFetch('/api/ai/default', { method: 'POST', body: JSON.stringify({ providerId }) });
        await aiFetch('/api/ai/fallback', {
          method: 'POST',
          body: JSON.stringify({
            providerId: aq('#ai-fallback-select').value || null,
            model: aq('#ai-fallback-model').value.trim(),
            enabled: aq('#ai-fallback-enabled').value === 'true',
            maxAttempts: Number(aq('#ai-fallback-attempts').value) || 2,
            timeoutMs: Number(aq('#ai-fallback-timeout').value) || 20000
          })
        });
        await loadAll();
        alert('Đã lưu cấu hình định tuyến AI.');
      } catch (err) {
        alert('Không lưu được định tuyến:\n' + err.message);
      }
    });

    aq('#ai-routing-test')?.addEventListener('click', async () => {
      const box = aq('#ai-routing-result');
      if (box) box.innerHTML = '<div class="ai-result">⏳ Đang đọc thử qua bộ định tuyến…</div>';
      try {
        const data = await aiFetch('/api/ai/generate', {
          method: 'POST',
          body: JSON.stringify({
            task: 'dashboard_test',
            systemPrompt: 'Trả lời cực ngắn, tối đa 20 từ.',
            prompt: 'Nói một câu chúc mừng đám cưới thật ngắn.'
          })
        });
        const r = data.result || {};
        const attempts = (r.attempts || []).map((a) => `${a.providerName}: ${a.ok ? 'OK' : a.code}`).join(' → ');
        if (box) {
          box.innerHTML = `<div class="ai-result">✅ ${esc(r.text)}
            <div class="ai-kv">${esc(r.providerName)} · ${esc(r.model)} · ${esc(r.latencyMs)} ms
            ${r.fallbackUsed ? ' · <b>đã dùng dự phòng</b> (lý do: ' + esc(r.fallbackReason || '') + ')' : ''}
            <br>Chuỗi thử: ${esc(attempts)}</div></div>`;
        }
        await loadUsage();
      } catch (err) {
        const attempts = (err.attempts || []).map((a) => `${a.providerName}: ${a.code || 'lỗi'}`).join(' → ');
        if (box) {
          box.innerHTML = `<div class="ai-result err">❌ ${esc(err.message)}
            ${attempts ? `<div class="ai-kv">Chuỗi thử: ${esc(attempts)}</div>` : ''}</div>`;
        }
        await loadUsage();
      }
    });

    aq('#ai-text-save')?.addEventListener('click', async () => {
      try {
        await aiFetch('/api/ai/text-settings', {
          method: 'POST',
          body: JSON.stringify({
            enabled: aq('#ai-text-enabled').value === 'true',
            timeoutMs: Number(aq('#ai-text-timeout').value) || 6000,
            temperature: Number(aq('#ai-text-temp').value),
            maxTokens: Number(aq('#ai-text-maxtokens').value) || 120
          })
        });
        await loadAll();
        alert('Đã lưu cài đặt AI cho lời chúc MC.');
      } catch (err) {
        alert('Không lưu được:\n' + err.message);
      }
    });

    aq('#ai-usage-clear')?.addEventListener('click', async () => {
      if (!confirm('Xoá toàn bộ nhật ký AI?')) return;
      await aiFetch('/api/ai/usage', { method: 'DELETE' });
      await loadUsage();
    });

    loadAll();
    loadUsage();
    setInterval(() => {
      if (aq('#tab-ai')?.classList.contains('active')) {
        loadAll();
        loadUsage();
      }
    }, 20000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

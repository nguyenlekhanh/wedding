/**
 * Real end-to-end tests for the AI provider manager.
 *
 * These hit the running server over HTTP (no UI, no mocks for the real
 * providers) and separate mocks only for failure modes that must be
 * deterministic: timeout, missing model, 500, invalid request, fallback.
 *
 * Usage: node ai/tests/run-tests.mjs        (server must be running)
 *        AI_TEST_BASE=http://127.0.0.1:3917 node ai/tests/run-tests.mjs
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockOllama } from './mock-ollama.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.AI_TEST_BASE || 'http://127.0.0.1:3917';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, detail = '') {
  pass += 1;
  console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
}
function bad(name, detail = '') {
  fail += 1;
  failures.push(name + (detail ? ' — ' + detail : ''));
  console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
}
function check(name, cond, detail = '') {
  if (cond) ok(name, detail);
  else bad(name, detail);
}

async function api(pathname, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

async function main() {
  console.log('=== AI provider manager — real test suite ===');
  console.log('server:', BASE);

  // Load .env only to compare that the raw key never appears in responses.
  let rawKey = '';
  try {
    const { loadEnvFile } = await import('../env.cjs');
    loadEnvFile();
    rawKey = process.env.REACTIVE_AI_API_KEY || process.env.OPENROUTER_API_KEY || '';
  } catch {}

  // ---------------------------------------------------------------- 1. bootstrap
  const list0 = await api('/api/ai/providers');
  check('GET /api/ai/providers trả 200', list0.status === 200);
  const providers0 = (list0.json && list0.json.providers) || [];
  check('Có nhà cung cấp được tạo sẵn', providers0.length >= 3, providers0.map((p) => p.type).join(', '));

  const byType = (t) => providers0.find((p) => p.type === t);
  const openrouter = byType('openrouter');
  const ollamaLan = byType('ollama');
  const openaiPv = byType('openai');
  check('OpenRouter có mặt và đã có API key', Boolean(openrouter && openrouter.hasApiKey));
  check('Ollama LAN có mặt', Boolean(ollamaLan), ollamaLan && ollamaLan.baseUrl);
  check('OpenAI có mặt nhưng CHƯA cấu hình', Boolean(openaiPv) && openaiPv.hasApiKey === false);

  // ---------------------------------------------------------------- 2. security
  check('Không trả API key thô trong JSON', !rawKey || !list0.text.includes(rawKey));
  check('API key được che (••••)', Boolean(openrouter && /•+/.test(openrouter.apiKeyMasked || '')), openrouter && openrouter.apiKeyMasked);
  check('Không có trường ciphertext/khoá bí mật nào lộ ra', !/"(apiKey|api_key|ciphertext|iv|tag)"\s*:/.test(list0.text));
  check('Cài đặt AI-viết-lời-chúc mặc định TẮT', list0.json.text.enabled === false);

  const foreign = await api('/api/ai/providers', { method: 'POST', body: { type: 'ollama', name: 'evil', baseUrl: 'http://127.0.0.1:1' }, headers: { Origin: 'http://evil.example.com' } });
  check('Chặn request khác nguồn (403)', foreign.status === 403, `status=${foreign.status}`);

  const ssrf1 = await api('/api/ai/providers', { method: 'POST', body: { type: 'openai-compatible', name: 'meta', baseUrl: 'http://169.254.169.254/v1' } });
  check('Chặn SSRF tới cloud metadata', ssrf1.status === 400 && ssrf1.json.code === 'blocked_target', `status=${ssrf1.status} code=${ssrf1.json && ssrf1.json.code}`);

  const ssrf2 = await api('/api/ai/providers', { method: 'POST', body: { type: 'openai-compatible', name: 'local', baseUrl: 'http://localhost:8080/v1' } });
  check('Chặn SSRF tới localhost (provider tuỳ chỉnh)', ssrf2.status === 400 && ssrf2.json.code === 'blocked_target');

  const ssrf3 = await api('/api/ai/providers', { method: 'POST', body: { type: 'openai-compatible', name: 'file', baseUrl: 'file:///C:/Windows' } });
  check('Chặn scheme không phải http/https', ssrf3.status === 400);

  // ---------------------------------------------------------------- 3. OpenRouter (real)
  if (openrouter) {
    const conn = await api(`/api/ai/providers/${openrouter.id}/test-connection`, { method: 'POST' });
    const r = conn.json && conn.json.result;
    check('OpenRouter: endpoint phản hồi', Boolean(r && r.reachable), r && `latency ${r.latencyMs}ms`);
    check('OpenRouter: xác thực thành công', Boolean(r && r.authenticated), r && r.detail);
    check('OpenRouter: báo đúng free tier', Boolean(r && r.meta), JSON.stringify(r && r.meta));

    const models = await api(`/api/ai/providers/${openrouter.id}/models?refresh=1`);
    const mcount = (models.json && models.json.models && models.json.models.length) || 0;
    check('OpenRouter: tải được danh sách model', models.status === 200 && mcount > 50, `${mcount} model`);

    const gen = await api(`/api/ai/providers/${openrouter.id}/test-generation`, { method: 'POST', body: { prompt: 'Reply with the single word: OK' } });
    const g = gen.json && gen.json.result;
    check('OpenRouter: tạo văn bản thật', Boolean(g && g.text && g.text.trim().length > 0), g && `${g.latencyMs}ms · model ${g.model}`);
    check('OpenRouter: trả token usage', Boolean(g && g.usage && g.usage.totalTokens != null), g && JSON.stringify(g.usage));
  } else {
    bad('OpenRouter: bỏ qua (không có provider)');
  }

  // ---------------------------------------------------------------- 4. Ollama LAN (real)
  if (ollamaLan) {
    const conn = await api(`/api/ai/providers/${ollamaLan.id}/test-connection`, { method: 'POST' });
    const r = conn.json && conn.json.result;
    check('Ollama LAN: endpoint phản hồi', Boolean(r && r.reachable), r && r.detail);
    check('Ollama LAN: không cần API key vẫn xác thực OK', Boolean(r && r.authenticated));

    const models = await api(`/api/ai/providers/${ollamaLan.id}/models?refresh=1`);
    const ms = (models.json && models.json.models) || [];
    check('Ollama LAN: tải được model đã cài', ms.length > 0, `${ms.length} model: ${ms.slice(0, 4).map((m) => m.id).join(', ')}`);

    const chosen = ms.find((m) => m.id === 'llama3.2:latest') || ms[0];
    if (chosen) {
      await api(`/api/ai/providers/${ollamaLan.id}`, { method: 'PATCH', body: { model: chosen.id } });
      const gen = await api(`/api/ai/providers/${ollamaLan.id}/test-generation`, { method: 'POST', body: { prompt: 'Reply with exactly: OK', model: chosen.id } });
      const g = gen.json && gen.json.result;
      check('Ollama LAN: tạo văn bản thật', Boolean(g && g.text), g && `${g.latencyMs}ms · ${g.model} · ${g.text.trim().slice(0, 40)}`);
    }
    ollamaLan.model = chosen ? chosen.id : ollamaLan.model;
  }

  // ---------------------------------------------------------------- 5. OpenAI not configured
  if (openaiPv) {
    const conn = await api(`/api/ai/providers/${openaiPv.id}/test-connection`, { method: 'POST' });
    const r = conn.json && conn.json.result;
    check('OpenAI: KHÔNG giả vờ đã kết nối', r && r.reachable === false && r.authenticated === false, r && r.detail);
    check('OpenAI: mã lỗi not_configured', Boolean(r && r.error && r.error.code === 'not_configured'), r && r.error && r.error.code);
  }

  // ---------------------------------------------------------------- 6. invalid key → auth error, not "connected"
  const badKeyPv = await api('/api/ai/providers', {
    method: 'POST',
    // A model is required, otherwise generation fails on "chưa chọn model"
    // before it ever reaches the credential check being tested here.
    body: { type: 'openrouter', name: 'OpenRouter (khoá sai)', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', apiKey: 'sk-or-v1-invalid0000000000000000000000000000000000000000000000000000' }
  });
  const badKeyId = badKeyPv.json && badKeyPv.json.provider && badKeyPv.json.provider.id;
  if (badKeyId) {
    const conn = await api(`/api/ai/providers/${badKeyId}/test-connection`, { method: 'POST' });
    const r = conn.json && conn.json.result;
    check('Khoá sai: endpoint vẫn reachable', Boolean(r && r.reachable === true));
    check('Khoá sai: xác thực thất bại (không báo connected)', Boolean(r && r.authenticated === false && r.error && r.error.code === 'auth'), r && r.error && `${r.error.code} ${r.error.status}`);
    const gen = await api(`/api/ai/providers/${badKeyId}/test-generation`, { method: 'POST', body: { prompt: 'hi' } });
    check('Khoá sai: tạo văn bản trả lỗi auth', gen.status === 502 && gen.json && gen.json.code === 'auth', `status=${gen.status} code=${gen.json && gen.json.code}`);
    await api(`/api/ai/providers/${badKeyId}`, { method: 'DELETE' });
  }

  // ---------------------------------------------------------------- 7. failure modes with mock Ollama
  const mock = await createMockOllama();
  const mockPv = await api('/api/ai/providers', {
    method: 'POST',
    body: { type: 'ollama', name: 'Mock Ollama', baseUrl: mock.url, model: 'mock-fast:1b', timeoutMs: 5000 }
  });
  const mockId = mockPv.json && mockPv.json.provider && mockPv.json.provider.id;

  if (mockId) {
    const good = await api(`/api/ai/providers/${mockId}/test-generation`, { method: 'POST', body: { prompt: 'hi' } });
    check('Mock: tạo văn bản thành công', good.json && good.json.result && good.json.result.text === 'MOCK OK');

    mock.setMode('missing');
    const missing = await api(`/api/ai/providers/${mockId}/test-generation`, { method: 'POST', body: { prompt: 'hi', model: 'ghost:1b' } });
    check('Model chưa tải → model_not_downloaded + thông báo Ollama pull', missing.json && missing.json.code === 'model_not_downloaded', missing.json && missing.json.error);

    mock.setMode('slow');
    await api(`/api/ai/providers/${mockId}`, { method: 'PATCH', body: { timeoutMs: 1200 } });
    const t0 = Date.now();
    const slow = await api(`/api/ai/providers/${mockId}/test-generation`, { method: 'POST', body: { prompt: 'hi' } });
    const elapsed = Date.now() - t0;
    check('Timeout được phát hiện', slow.status === 504 && slow.json.code === 'timeout', `status=${slow.status} code=${slow.json && slow.json.code} after ${elapsed}ms`);
    check('Timeout không treo quá lâu', elapsed < 9000, `${elapsed}ms`);

    mock.setMode('error500');
    await api(`/api/ai/providers/${mockId}`, { method: 'PATCH', body: { timeoutMs: 5000 } });
    const err500 = await api(`/api/ai/providers/${mockId}/test-generation`, { method: 'POST', body: { prompt: 'hi' } });
    check('Lỗi 5xx được phân loại', err500.status === 502 && ['network', 'unknown'].includes(err500.json.code), `code=${err500.json && err500.json.code}`);

    mock.setMode('badjson');
    const badJson = await api(`/api/ai/providers/${mockId}/test-generation`, { method: 'POST', body: { prompt: 'hi' } });
    check('Phản hồi hỏng được báo invalid_response', badJson.status === 502, `code=${badJson.json && badJson.json.code}`);

    // ---- fallback: broken primary (mock) → real LAN Ollama
    mock.setMode('error500');
    await api('/api/ai/default', { method: 'POST', body: { providerId: mockId } });
    await api('/api/ai/fallback', {
      method: 'POST',
      body: { providerId: ollamaLan.id, model: ollamaLan.model, enabled: true, maxAttempts: 2, timeoutMs: 30000 }
    });

    const fb = await api('/api/ai/generate', { method: 'POST', body: { task: 'fallback_test', prompt: 'Reply with exactly: OK' } });
    const fbr = fb.json && fb.json.result;
    check('Dự phòng được kích hoạt khi provider chính lỗi', Boolean(fbr && fbr.fallbackUsed), fbr && `fallbackUsed=${fbr.fallbackUsed}`);
    check('Dự phòng trả lời bằng provider thứ hai', Boolean(fbr && fbr.providerId === ollamaLan.id), fbr && `${fbr.providerName} / ${fbr.model}`);
    check('Báo rõ lý do dự phòng', Boolean(fbr && fbr.fallbackReason), fbr && fbr.fallbackReason);
    check('Chuỗi thử có ghi lại provider lỗi', Boolean(fbr && fbr.attempts && fbr.attempts.length >= 2), fbr && JSON.stringify(fbr.attempts.map((a) => (a.ok ? 'ok' : a.code))));

    // ---- invalid request must NOT fall back
    mock.setMode('invalid');
    const inv = await api('/api/ai/generate', { method: 'POST', body: { task: 'invalid_test', prompt: 'Reply with exactly: OK' } });
    check('Lỗi invalid_request không dùng dự phòng', inv.status === 400 && inv.json.code === 'invalid_request', `status=${inv.status} code=${inv.json && inv.json.code}`);
    check('invalid_request chỉ thử 1 lần', Boolean(inv.json && inv.json.attempts && inv.json.attempts.length === 1), inv.json && `attempts=${(inv.json.attempts || []).length}`);

    // ---- maxAttempts=1 caps attempts (no loop)
    mock.setMode('error500');
    await api('/api/ai/fallback', { method: 'POST', body: { enabled: false, maxAttempts: 1 } });
    const capped = await api('/api/ai/generate', { method: 'POST', body: { task: 'cap_test', prompt: 'Reply with exactly: OK' } });
    check('Không lặp vô hạn khi tắt dự phòng', capped.status >= 400 && (capped.json.attempts || []).length <= 2, `attempts=${(capped.json && capped.json.attempts || []).length}`);

    await api(`/api/ai/providers/${mockId}`, { method: 'DELETE' });
  }

  // ---------------------------------------------------------------- 8. cancellation (no fallback)
  try {
    const { manager } = await import('../index.cjs');
    const ctrl = new AbortController();
    ctrl.abort();
    let code = '';
    try {
      await manager.generateText({ prompt: 'never sent', signal: ctrl.signal });
    } catch (e) {
      code = e.code;
    }
    check('Huỷ yêu cầu → cancelled, không gọi mạng', code === 'cancelled', code);
  } catch (e) {
    bad('Không import được manager để test huỷ', e.message);
  }

  // ---------------------------------------------------------------- 9. persistence + usage
  await api('/api/ai/fallback', { method: 'POST', body: { providerId: ollamaLan.id, model: ollamaLan.model, enabled: true, maxAttempts: 2, timeoutMs: 20000 } });
  await api('/api/ai/default', { method: 'POST', body: { providerId: openrouter.id } });
  const textSave = await api('/api/ai/text-settings', { method: 'POST', body: { maxTokens: 137, timeoutMs: 6000, enabled: false } });
  check('Lưu cài đặt AI-text thành công (không bị rate limit)', textSave.status === 200 && textSave.json.text.maxTokens === 137, `status=${textSave.status} maxTokens=${textSave.json && textSave.json.text && textSave.json.text.maxTokens}`);

  const usage = await api('/api/ai/usage');
  const st = (usage.json && usage.json.stats) || {};
  check('Nhật ký AI có dữ liệu', st.total > 0, `${st.total} yêu cầu, ${st.successful} OK, ${st.failed} lỗi`);
  const logJson = JSON.stringify((usage.json && usage.json.entries) || []);
  check(
    'Nhật ký không chứa nội dung prompt/response',
    !/"prompt"\s*:/.test(logJson) &&
      !/"text"\s*:/.test(logJson) &&
      !logJson.includes('Reply with exactly') &&
      !logJson.includes('MOCK OK'),
    `${((usage.json && usage.json.entries) || []).length} bản ghi`
  );

  const stat = await api('/api/ai/status');
  check('GET /api/ai/status trả trạng thái runtime', stat.status === 200, JSON.stringify(Object.keys(stat.json.status || {})).slice(0, 80));

  // ---------------------------------------------------------------- 10. wedding regression
  const ceremonies = ['kiss', 'cheers', 'dance', 'cake', 'champagne', 'petal', 'marry'];
  const codes = [];
  for (const a of ceremonies) {
    const r = await api('/api/action', { method: 'POST', body: { action: a, initiator: 'AI Test' } });
    codes.push(`${a}:${r.status}`);
  }
  check('7 nghi thức cưới vẫn hoạt động', codes.every((c) => c.endsWith(':200')), codes.join(' '));

  const tts = await api('/api/tts/status');
  check('Kokoro TTS không bị ảnh hưởng', tts.status === 200 && tts.json.dtype !== undefined, `ready=${tts.json && tts.json.ready} dtype=${tts.json && tts.json.dtype}`);

  const stateRes = await api('/api/state');
  check('SSE state endpoint vẫn 200', stateRes.status === 200 && Boolean(stateRes.json.config));
  check('TikFinity status endpoint vẫn 200', (await api('/api/status')).status === 200);

  const overlay = await fetch(BASE + '/overlay.html');
  const overlayHtml = await overlay.text();
  check('overlay.html còn audio MC (TTS nguyên vẹn)', overlayHtml.includes('mc-audio'));

  await mock.close();

  console.log('');
  console.log(`RESULT: ${pass}/${pass + fail} passed`);
  if (fail) {
    console.log('Failures:');
    for (const f of failures) console.log(' - ' + f);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('SUITE CRASHED:', e);
  process.exit(2);
});

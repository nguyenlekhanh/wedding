// End-to-end check of the TTS contract against a running server.
// Usage: node tts/e2e-test.mjs [baseUrl]
const BASE = process.argv[2] || 'http://127.0.0.1:3917';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

async function json(path, init) {
  const res = await fetch(BASE + path, init);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

// 1. Server + status
const st = await json('/api/tts/status');
ok('GET /api/tts/status', st.status === 200 && st.body.engine === 'kokoro',
  `ready=${st.body.ready} model=${st.body.model} dtype=${st.body.dtype} cached=${st.body.cache.files}`);

// 2. Preview (cold) + cache hit
const t1 = Date.now();
const p1 = await json('/api/tts/preview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'E2E check: thank you for the wedding envelope.', voice: 'af_heart', speed: 0.98 })
});
const coldMs = Date.now() - t1;
ok('POST /api/tts/preview (cold)', p1.status === 200 && !!p1.body.url, `${coldMs} ms, cached=${p1.body.cached}`);

const t2 = Date.now();
const p2 = await json('/api/tts/preview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'E2E check: thank you for the wedding envelope.', voice: 'af_heart', speed: 0.98 })
});
const hitMs = Date.now() - t2;
ok('POST /api/tts/preview (cache hit)', p2.status === 200 && p2.body.cached === true && p2.body.url === p1.body.url,
  `${hitMs} ms`);

// 3. Audio delivery
const audioRes = await fetch(BASE + p1.body.url);
const audioBuf = Buffer.from(await audioRes.arrayBuffer());
const riff = audioBuf.toString('ascii', 0, 4);
const wave = audioBuf.toString('ascii', 8, 12);
ok('GET /api/tts/audio/<sha1>.wav',
  audioRes.status === 200 && audioRes.headers.get('content-type') === 'audio/wav' && riff === 'RIFF' && wave === 'WAVE',
  `${audioBuf.length} bytes, rate=${audioBuf.readUInt32LE(24)}`);

// 4. Path traversal / bad filename rejected
const bad = await fetch(BASE + '/api/tts/audio/..%2F..%2Fserver.cjs');
ok('audio route rejects traversal', bad.status === 400 || bad.status === 404, `status=${bad.status}`);

// 5. Stage A: config persistence (flat, no nesting)
const before = (await json('/api/state')).body;
const save = await json('/api/config', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ttsVoice: 'af_bella', ttsSpeed: 1.05, ttsVolume: 0.8, volume: 0.8, voiceRate: 1.05 })
});
const after = (await json('/api/state')).body;
ok('POST /api/config persists flat',
  save.status === 200 && after.config.ttsVoice === 'af_bella' && after.config.ttsSpeed === 1.05 &&
  after.config.ttsVolume === 0.8 && after.config.voicePitch <= 1.0,
  `voice=${after.config.ttsVoice} speed=${after.config.ttsSpeed} pitch=${after.config.voicePitch}`);

// restore
await json('/api/config', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ttsVoice: 'af_heart', ttsSpeed: 0.98, ttsVolume: 0.95, volume: 0.95, voiceRate: 0.98 })
});

// 6. SSE: gift produces a `tts` event with a playable url and priority 5
async function waitForTts(triggerPath, triggerBody, label, expectPriority) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 90000);
  const res = await fetch(BASE + '/api/events', { signal: ctrl.signal, headers: { Accept: 'text/event-stream' } });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  await json(triggerPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(triggerBody)
  });

  const deadline = Date.now() + 90000;
  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        const evMatch = block.match(/^event: (.+)$/m);
        const dataMatch = block.match(/^data: (.+)$/m);
        if (!evMatch || !dataMatch) continue;
        const ev = evMatch[1];
        if (ev !== 'tts' && ev !== 'tts-fallback') continue;
        const payload = JSON.parse(dataMatch[1]);
        clearTimeout(timeout);
        try { ctrl.abort(); } catch {}
        ok(label, ev === 'tts' && payload.priority === expectPriority && !!payload.url,
          `${ev} priority=${payload.priority} cached=${payload.cached} durationMs=${payload.durationMs}`);
        return payload;
      }
    }
    ok(label, false, 'timed out waiting for tts event');
    return null;
  } finally {
    clearTimeout(timeout);
    try { ctrl.abort(); } catch {}
  }
}

await waitForTts('/api/demo', { type: 'gift', name: 'Minh Thu', gift: 'Wedding Envelope', count: 1, diamonds: 1 },
  'gift → SSE tts (priority 5)', 5);
await waitForTts('/api/demo', { type: 'gift', name: 'Hoang Long', gift: 'Wedding Ring', count: 1, diamonds: 50 },
  'crown gift → SSE tts (priority 10)', 10);

// 7. Steady-state latency on three distinct fresh lines.
// A salt keeps them out of the cache so the numbers are real generation times.
const salt = process.env.E2E_SALT || `run ${Date.now()}`;
const lines = [
  'What a beautiful moment, everyone! Please welcome the newlyweds to the floor.',
  'Dinner is served, dear guests. Enjoy the feast and raise a glass to the happy couple.',
  'One hundred years of happiness, and may your home always be full of laughter.'
].map((l) => `${l} (${salt})`);
const timings = [];
for (const line of lines) {
  const t0 = Date.now();
  const r = await json('/api/tts/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: line, voice: 'af_heart', speed: 0.98 })
  });
  timings.push({ ms: Date.now() - t0, durationMs: r.body.durationMs, ok: r.status === 200 });
}
const avg = Math.round(timings.reduce((a, b) => a + b.ms, 0) / timings.length);
ok('steady-state latency', timings.every((t) => t.ok),
  timings.map((t) => `${t.ms}ms/${t.durationMs || '?'}ms audio`).join(' | ') + ` → avg ${avg} ms`);

// 8. Concurrent identical requests share one generation
const t3 = Date.now();
const [a, b] = await Promise.all([
  json('/api/tts/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Same text dedupe check', voice: 'af_heart', speed: 0.98 }) }),
  json('/api/tts/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Same text dedupe check', voice: 'af_heart', speed: 0.98 }) })
]);
ok('duplicate requests dedupe', a.body.url === b.body.url, `both → ${a.body.url} in ${Date.now() - t3} ms`);

const finalStatus = (await json('/api/tts/status')).body;
console.log('\nSTATUS:', JSON.stringify({ ready: finalStatus.ready, jobs: finalStatus.jobs, hits: finalStatus.hits, misses: finalStatus.misses, cache: finalStatus.cache, lastLatencyMs: finalStatus.lastLatencyMs }, null, 2));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

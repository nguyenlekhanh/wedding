// Latency benchmark for one dtype. Usage: TTS_DTYPE=fp32 node tts/bench.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { TtsService } = require(path.join(__dirname, 'tts-service.cjs'));

const svc = new TtsService();
const dtype = svc.dtype;
const loadStart = Date.now();

svc.warm();
while (!svc.ready && !svc.error && Date.now() - loadStart < 600000) {
  await new Promise((r) => setTimeout(r, 250));
}
if (svc.error) {
  console.log(JSON.stringify({ dtype, error: svc.error }));
  process.exit(1);
}
const loadMs = Date.now() - loadStart;

// Unique text per dtype so the cache can never mask the measurement.
const text = `${dtype} benchmark: thank you Minh Thu for the wedding envelope, wishing you every happiness.`;
const t0 = Date.now();
const res = await svc.speak({ text, voice: 'af_heart', speed: 0.98 });
const ms = Date.now() - t0;
const audioMs = res.durationMs || 0;

console.log('BENCH ' + JSON.stringify({
  dtype,
  loadMs,
  genMs: ms,
  audioMs,
  rtf: audioMs ? Number((ms / audioMs).toFixed(2)) : null,
  bytes: res.bytes
}));
process.exit(0);

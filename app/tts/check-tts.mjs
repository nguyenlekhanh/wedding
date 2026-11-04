// Verifies Kokoro end-to-end: model load, WAV output, cache hit, latency.
// Usage: node tts/check-tts.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { TtsService } = require(path.join(__dirname, 'tts-service.cjs'));

const svc = new TtsService();

function wavInfo(file) {
  const buf = fs.readFileSync(file);
  const riff = buf.toString('ascii', 0, 4);
  const wave = buf.toString('ascii', 8, 12);
  const rate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  return { riff, wave, rate, bits, bytes: buf.length };
}

const text = 'Thank you, Minh Thu, for the wedding envelope. Wishing you and your family every happiness!';
const voice = 'af_heart';
const speed = 0.98;

console.log('1) warming the model (first run downloads ~120 MB)...');
const tWarm = Date.now();
svc.warm();
// Poll until the worker reports ready (or fails).
while (!svc.ready && !svc.error && Date.now() - tWarm < 600000) {
  await new Promise((r) => setTimeout(r, 500));
}
if (svc.error) {
  console.error('MODEL LOAD FAILED:', svc.error);
  process.exit(1);
}
console.log(`   model ready in ${Date.now() - tWarm} ms`);

console.log('2) first synthesis (cold, generates WAV)...');
const t1 = Date.now();
const first = await svc.speak({ text, voice, speed });
const coldMs = Date.now() - t1;
const file = svc.fileFor(first.key);
const info = wavInfo(file);
console.log(`   ${coldMs} ms | cached=${first.cached} | ${JSON.stringify(info)}`);
if (info.riff !== 'RIFF' || info.wave !== 'WAVE') {
  console.error('INVALID WAV HEADER');
  process.exit(1);
}

console.log('3) second synthesis of the same text (should be a cache hit)...');
const t2 = Date.now();
const second = await svc.speak({ text, voice, speed });
const warmMs = Date.now() - t2;
console.log(`   ${warmMs} ms | cached=${second.cached} | url=${second.url}`);
if (!second.cached) {
  console.error('EXPECTED CACHE HIT');
  process.exit(1);
}

console.log('4) different text (cold again)...');
const t3 = Date.now();
const third = await svc.speak({
  text: 'A huge congratulations to Hoang Long on becoming the new groom!',
  voice,
  speed
});
console.log(`   ${Date.now() - t3} ms | cached=${third.cached} | durationMs=${third.durationMs}`);

const st = svc.status();
console.log('5) status:', JSON.stringify({
  ready: st.ready,
  jobs: st.jobs,
  hits: st.hits,
  misses: st.misses,
  cache: st.cache,
  lastLatencyMs: st.lastLatencyMs
}, null, 2));
console.log('OUTPUT FILE:', file);
process.exit(0);

// One-time model installer: downloads the Kokoro-82M ONNX assets into app/tts/models
// and then exits. Afterwards the app runs fully offline.
// Usage: npm run tts:download
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { TtsService } = require(path.join(__dirname, 'tts-service.cjs'));

const svc = new TtsService();

function dirSize(dir) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) total += dirSize(full);
      else {
        try { total += fs.statSync(full).size; } catch {}
      }
    }
  } catch {}
  return total;
}

console.log('Kokoro model installer');
console.log('  model :', svc.modelId, `(dtype ${svc.dtype})`);
console.log('  target:', svc.modelDir);
console.log('Downloading if not already present...\n');

const started = Date.now();
svc.warm();

while (!svc.ready && !svc.error && Date.now() - started < 600000) {
  await new Promise((r) => setTimeout(r, 500));
}

if (svc.error) {
  console.error('\nDownload failed:', svc.error);
  console.error('Check the network, or set TTS_MODEL / TTS_DTYPE to a reachable model.');
  process.exit(1);
}

const mb = (dirSize(svc.modelDir) / 1024 / 1024).toFixed(1);
console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`Model + voices cached in ${svc.modelDir} (${mb} MB)`);
console.log('The app will now run offline. To force strict offline mode set TTS_ALLOW_DOWNLOAD=0.');
process.exit(0);

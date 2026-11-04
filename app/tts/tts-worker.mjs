// Kokoro-82M speech worker for TiecCuoiLive.
//
// Runs inside a node:worker_threads thread so ONNX inference never blocks the
// HTTP server, the SSE stream, or the TikFinity WebSocket loop.
// Protocol: postMessage in {cmd}, postMessage out {type}.

import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';

const {
  modelId = 'onnx-community/Kokoro-82M-ONNX',
  dtype = 'fp16',
  cacheDir = '',
  allowDownload = true,
  defaultVoice = 'af_heart',
  defaultSpeed = 0.98
} = workerData || {};

let engine = null;
let loading = null;
let loadError = null;

function post(msg) {
  try { parentPort.postMessage(msg); } catch { /* parent gone */ }
}

/** Load the model once and keep it resident for every later announcement. */
async function loadEngine() {
  if (engine) return engine;
  if (loading) return loading;

  loading = (async () => {
    const mod = await import('kokoro-js');
    const KokoroTTS = mod.KokoroTTS;

    // kokoro-js only re-exports a tiny env shim (wasmPaths), so configure the
    // REAL transformers.js environment that the loader actually reads. Both
    // packages resolve to the same module instance, so this takes effect.
    const tf = await import('@huggingface/transformers');
    const env = (tf && tf.env) || mod.env;
    if (env) {
      if (cacheDir) {
        env.cacheDir = cacheDir;        // download destination (model + voices)
        env.localModelPath = cacheDir;  // <dir>/<modelId>/... lookup root
      }
      env.allowRemoteModels = allowDownload !== false;
      env.allowLocalModels = true;
    }

    post({ type: 'loading', model: modelId, dtype });

    engine = await KokoroTTS.from_pretrained(modelId, {
      dtype,
      device: 'cpu',
      progress_callback: (p) => {
        if (p && p.status === 'progress') {
          post({ type: 'download', file: p.file, progress: p.progress, status: p.status });
        }
      }
    });
    return engine;
  })().catch((err) => {
    loadError = err && err.message ? err.message : String(err);
    loading = null;
    throw err;
  });

  return loading;
}

/** Minimal 16-bit PCM WAV encoder, used only if the library does not give us one. */
function pcm16Wav(samples, rate) {
  const len = samples.length;
  const buf = Buffer.alloc(44 + len * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + len * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(len * 2, 40);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2);
  }
  return buf;
}

async function toWavBuffer(audio) {
  if (audio && typeof audio.toWav === 'function') {
    let wav = audio.toWav();
    if (wav && typeof wav.then === 'function') wav = await wav;
    if (wav instanceof ArrayBuffer) return Buffer.from(new Uint8Array(wav));
    if (ArrayBuffer.isView(wav)) return Buffer.from(wav.buffer, wav.byteOffset, wav.byteLength);
    if (wav && wav.buffer) return Buffer.from(wav.buffer);
  }
  const samples = audio && (audio.audio || audio.data);
  const rate = (audio && (audio.sampling_rate || audio.samplingRate)) || 24000;
  if (!samples || !samples.length) throw new Error('TTS returned no audio samples');
  return pcm16Wav(samples, rate);
}

parentPort.on('message', async (msg) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.cmd === 'warm') {
    try {
      await loadEngine();
      post({ type: 'ready', model: modelId, dtype });
    } catch (err) {
      post({ type: 'load-error', error: loadError || String(err) });
    }
    return;
  }

  if (msg.cmd === 'status') {
    post({
      type: 'status',
      ready: !!engine,
      loading: !!loading,
      error: loadError,
      model: modelId,
      dtype
    });
    return;
  }

  if (msg.cmd === 'synthesize') {
    const { id, text, voice, speed, outPath } = msg;
    const started = Date.now();
    try {
      const tts = await loadEngine();
      const audio = await tts.generate(text, {
        voice: voice || defaultVoice,
        speed: Number(speed) || defaultSpeed
      });
      const buf = await toWavBuffer(audio);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, buf);

      const rate = (audio && (audio.sampling_rate || audio.samplingRate)) || 24000;
      const sampleCount = (audio && audio.audio && audio.audio.length) || 0;
      const durationMs = sampleCount ? Math.round((sampleCount / rate) * 1000) : undefined;

      post({
        type: 'result',
        id,
        ok: true,
        outPath,
        bytes: buf.length,
        durationMs,
        rate,
        elapsedMs: Date.now() - started
      });
    } catch (err) {
      post({
        type: 'result',
        id,
        ok: false,
        error: err && err.message ? err.message : String(err),
        elapsedMs: Date.now() - started
      });
    }
  }
});

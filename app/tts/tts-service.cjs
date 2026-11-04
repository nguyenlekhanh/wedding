// Kokoro TTS service for TiecCuoiLive.
//
// Responsibilities:
//   - own the worker thread (never block the main server event loop)
//   - SHA-1 audio cache on disk (repeated announcements are instant and free)
//   - serialise generation so two gifts can never synthesise at once
//   - expose status for the Vietnamese admin dashboard
//
// This module is CommonJS so server.cjs can require() it unchanged.

const { Worker } = require('node:worker_threads');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_VOICES = [
  { id: 'af_heart', label: 'af_heart — Nữ MC ấm áp (chất lượng A, khuyên dùng)' },
  { id: 'af_bella', label: 'af_bella — Nữ MC truyền cảm (A-)' },
  { id: 'af_nicole', label: 'af_nicole — Nữ MC thì thầm (B-)' },
  { id: 'af_sarah', label: 'af_sarah — Nữ MC rõ ràng (C+)' },
  { id: 'af_nova', label: 'af_nova — Nữ MC trẻ trung (C)' },
  { id: 'am_michael', label: 'am_michael — Nam MC trầm ấm (C+)' },
  { id: 'am_fenrir', label: 'am_fenrir — Nam MC mạnh mẽ (C+)' },
  { id: 'am_puck', label: 'am_puck — Nam MC vui vẻ (C+)' }
];

class TtsService {
  constructor(options = {}) {
    this.workerPath = options.workerPath || path.join(__dirname, 'tts-worker.mjs');
    this.cacheDir = options.cacheDir || path.join(__dirname, 'cache');
    this.modelDir = options.modelDir || path.join(__dirname, 'models');
    this.modelId = options.modelId || process.env.TTS_MODEL || 'onnx-community/Kokoro-82M-ONNX';
    // Measured on an i7-9850H: int8 dequantisation is the slowest path
    // (RTF 2.15 q8 vs 0.70 fp32 vs 0.59 fp16), so fp16 is the default.
    this.dtype = options.dtype || process.env.TTS_DTYPE || 'fp16';
    this.allowDownload = options.allowDownload !== false && process.env.TTS_ALLOW_DOWNLOAD !== '0';
    this.voices = DEFAULT_VOICES;

    this.worker = null;
    this.seq = 0;
    this.pending = new Map();   // id -> {resolve, reject, timer}
    this.inflightByKey = new Map(); // cacheKey -> Promise (dedupe concurrent identical text)
    this.chain = Promise.resolve(); // generation serialisation
    this.lastLatencyMs = null;
    this.ready = false;
    this.loading = false;
    this.error = null;
    this.jobs = 0;
    this.hits = 0;
    this.misses = 0;
    this.lastError = null;

    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      fs.mkdirSync(this.modelDir, { recursive: true });
    } catch (err) {
      this.error = `Không tạo được thư mục TTS: ${err.message}`;
    }
  }

  /** Strip emoji/markup so the phonemiser does not read them aloud. */
  normalize(text) {
    return String(text || '')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, ' ')
      .replace(/[{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 400);
  }

  cacheKey(text, voice, speed) {
    return crypto.createHash('sha1').update(`${voice}|${Number(speed).toFixed(2)}|${text}`).digest('hex');
  }

  fileFor(key) {
    return path.join(this.cacheDir, `${key}.wav`);
  }

  cacheStats() {
    try {
      const files = fs.readdirSync(this.cacheDir).filter((f) => f.endsWith('.wav'));
      let bytes = 0;
      for (const f of files) {
        try { bytes += fs.statSync(path.join(this.cacheDir, f)).size; } catch {}
      }
      return { files: files.length, bytes };
    } catch {
      return { files: 0, bytes: 0 };
    }
  }

  ensureWorker() {
    if (this.worker) return this.worker;

    const worker = new Worker(this.workerPath, {
      workerData: {
        modelId: this.modelId,
        dtype: this.dtype,
        cacheDir: this.modelDir,
        allowDownload: this.allowDownload,
        defaultVoice: 'af_heart',
        defaultSpeed: 0.98
      }
    });

    worker.on('message', (msg) => {
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'loading') { this.loading = true; return; }
      if (msg.type === 'ready') { this.ready = true; this.loading = false; this.error = null; return; }
      if (msg.type === 'load-error') {
        this.loading = false;
        this.error = msg.error || 'Không tải được mô hình Kokoro';
        this.lastError = this.error;
        return;
      }
      if (msg.type === 'download') return; // progress noise: intentionally not logged per-chunk

      if (msg.type === 'result') {
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        this.pending.delete(msg.id);
        clearTimeout(entry.timer);
        if (msg.ok) {
          this.ready = true;
          this.loading = false;
          this.lastLatencyMs = msg.elapsedMs;
          entry.resolve(msg);
        } else {
          this.lastError = msg.error;
          entry.reject(new Error(msg.error || 'TTS failed'));
        }
      }
    });

    worker.on('error', (err) => {
      this.error = err && err.message ? err.message : String(err);
      this.lastError = this.error;
      this.ready = false;
      this.loading = false;
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error(this.error));
      }
      this.pending.clear();
    });

    worker.on('exit', (code) => {
      if (code !== 0 && !this.error) this.error = `TTS worker dừng (mã ${code})`;
      this.worker = null;
      this.ready = false;
      this.loading = false;
    });

    this.worker = worker;
    return worker;
  }

  /** Pre-load the model so the first real gift is not the slow one. */
  warm() {
    try {
      const worker = this.ensureWorker();
      this.loading = true;
      worker.postMessage({ cmd: 'warm' });
    } catch (err) {
      this.error = err.message;
    }
  }

  status() {
    return {
      engine: 'kokoro',
      model: this.modelId,
      dtype: this.dtype,
      ready: this.ready,
      loading: this.loading,
      error: this.error,
      lastError: this.lastError,
      lastLatencyMs: this.lastLatencyMs,
      jobs: this.jobs,
      hits: this.hits,
      misses: this.misses,
      modelDir: this.modelDir,
      cache: this.cacheStats(),
      voices: this.voices
    };
  }

  _synthesizeNow({ key, text, voice, speed }) {
    const id = ++this.seq;
    const outPath = this.fileFor(key);
    const worker = this.ensureWorker();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('TTS timeout (quá 120 giây)'));
      }, 120000);
      this.pending.set(id, { resolve, reject, timer });
      this.loading = true;
      worker.postMessage({ cmd: 'synthesize', id, text, voice, speed, outPath });
    });
  }

  /**
   * Speak `text`. Resolves with { url, durationMs, cached, bytes }.
   * Generation is serialised; identical in-flight texts share one job.
   */
  async speak({ text, voice = 'af_heart', speed = 0.98 } = {}) {
    const clean = this.normalize(text);
    if (!clean) throw new Error('TTS text rỗng');

    const key = this.cacheKey(clean, voice, speed);
    const file = this.fileFor(key);
    const url = `/api/tts/audio/${key}.wav`;

    try {
      const stat = fs.statSync(file);
      if (stat.size > 44) {
        this.hits++;
        return { url, key, durationMs: undefined, cached: true, bytes: stat.size, text: clean, voice, speed };
      }
    } catch { /* not cached yet */ }

    if (this.inflightByKey.has(key)) return this.inflightByKey.get(key);

    const job = (async () => {
      this.jobs++;
      this.misses++;
      const res = await this._synthesizeNow({ key, text: clean, voice, speed });
      return {
        url,
        key,
        durationMs: res.durationMs,
        cached: false,
        bytes: res.bytes,
        rate: res.rate,
        text: clean,
        voice,
        speed,
        latencyMs: res.elapsedMs
      };
    })();

    const tracked = job.finally(() => this.inflightByKey.delete(key));
    this.inflightByKey.set(key, tracked);

    // Keep jobs strictly sequential: a single worker, one utterance at a time.
    const result = await (this.chain = this.chain.then(() => tracked).catch(() => tracked));
    return result;
  }

  /** Which engine the overlay should expect for the current config. */
  isBrowserFallback(config) {
    return (config && config.ttsEngine) === 'browser';
  }
}

module.exports = { TtsService, DEFAULT_VOICES };

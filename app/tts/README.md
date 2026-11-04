# MC voice (Kokoro-82M) — how it works

Local, offline neural TTS for the wedding MC. Replaces the old browser Web Speech
voice. **No Python, no GPU, no cloud API.**

```
TikFinity gift ──► server.cjs (Wedding Event Processor, unchanged)
                        │
                        ├─ announce(text, priority)          ← new
                        │      │
                        │      ├─ cache hit?  tts/cache/<sha1>.wav  → instant (~2 ms)
                        │      └─ miss → worker thread (kokoro-js, ONNX fp16)
                        │
                        └─ SSE event `tts` { url, priority, durationMs }
                               │
overlay.js ──► <audio id="mc-audio"> priority queue ──► duck YouTube BGM ──► OBS
```

## Files

| Path | Purpose |
|---|---|
| `tts-service.cjs` | Main-thread service: worker lifecycle, SHA-1 cache, serialisation, status |
| `tts-worker.mjs` | Worker thread: loads Kokoro once, generates 24 kHz WAV |
| `check-tts.mjs` | Self-test: model load, WAV validity, cache hit, latency |
| `e2e-test.mjs` | End-to-end HTTP/SSE contract test against a running server |
| `bench.mjs` | One-line latency benchmark for a given `TTS_DTYPE` |
| `download-model.mjs` | One-time downloader (then the app runs offline) |
| `cache/` | Generated `*.wav` files, named by SHA-1 of `voice\|speed\|text` |
| `models/` | Local model files (`onnx-community/Kokoro-82M-ONNX`, fp16 ≈ 163 MB) |
| `NOTICE.md` | Third-party licences |

Voices (`af_heart` etc.) ship **inside** the `kokoro-js` package
(`node_modules/kokoro-js/voices/*.bin`), so they are never fetched at runtime.

## First install

```bash
cd app
npm install            # kokoro-js + onnxruntime-node (native, no Python)
npm run tts:download   # downloads the model into tts/models (one time)
npm run tts:check      # verifies load + WAV + cache
```

After that the model is resident and the app works with the network unplugged.
Verified: with `TTS_ALLOW_DOWNLOAD=0` and the transformers cache deleted, the
server still loads from `tts/models` and synthesises normally.

## Configuration

Stored in `wedding_state.json` under `config`:

| Key | Default | Meaning |
|---|---|---|
| `speech` | `true` | Master on/off for the MC voice |
| `ttsEngine` | `kokoro` | `kokoro` = local model, `browser` = Web Speech |
| `ttsVoice` | `af_heart` | Kokoro voice id |
| `ttsSpeed` | `0.98` | Speaking rate (0.8–1.4) |
| `ttsVolume` | `0.95` | Playback volume in the overlay (`<audio>`) |
| `ttsDuckBgm` | `true` | Lower BGM to 0 while the MC speaks |

Environment overrides:

| Variable | Default | Meaning |
|---|---|---|
| `TTS_DTYPE` | `fp16` | ONNX precision. Measured: fp16 RTF 0.59, fp32 0.70, q8 2.15 (slowest) |
| `TTS_MODEL` | `onnx-community/Kokoro-82M-ONNX` | Model repo / local folder name |
| `TTS_ALLOW_DOWNLOAD` | `1` | `0` forbids network access entirely (strict offline) |

Changing `TTS_DTYPE` to a precision that is not in `models/` triggers a one-time
download for that precision.

## Priority queue

| Announcement | Priority | Behaviour |
|---|---|---|
| Crown transfer / new groom | 10 | Pre-empts a gift thank-you in progress |
| Gift thank-you | 5 | Queued in arrival order |
| Ambient chatter | 1 | Never pre-empts anything |

Only a **strictly higher** priority interrupts. Equal priority waits its turn, so
two gifts never talk over each other.

Debug hook in the overlay console: `__weddingMC()` returns the current item, the
queue, the audio element state and the live BGM volume (useful to confirm ducking).

## Troubleshooting

| Symptom | Check |
|---|---|
| Dashboard shows `❌ Lỗi` | `node tts/check-tts.mjs`, and the server console for `[TTS]` lines |
| `❌ Lỗi` with a download error | Run `npm run tts:download` once with internet |
| Silent on a different machine | Try `TTS_DTYPE=fp32` (fp16 CPU kernels are not universal) |
| Voice is silent but the queue moves | OBS: enable **Control Audio via OBS** on the Browser Source; the element is `#mc-audio` |
| First announcement is slow | Model still warming; it is pre-loaded ~2.5 s after server start |
| Want to force browser voice | `ttsEngine: "browser"` in `wedding_state.json` |
| Cache grew too large | `DELETE /api/tts/cache` (or empty `tts/cache/`) |

## Rollback

Set `"ttsEngine": "browser"` in `wedding_state.json` and restart. The overlay
returns to the original Web Speech path immediately; nothing else changes.
`speakThankYou()` was deliberately kept in `overlay.js` for this purpose.

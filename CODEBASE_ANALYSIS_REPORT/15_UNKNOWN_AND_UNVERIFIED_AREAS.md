# 15 — UNKNOWN AND UNVERIFIED AREAS

Everything in this file is **not** established by source reading. It is separated deliberately so that no reader mistakes an inference for a fact. Each entry states what is unknown, why it could not be verified here, the risk if the assumption is wrong, and how to close it.

## 15.1 External protocol payloads (highest uncertainty)

| # | Unknown | Why | Risk | How to close |
|---|---|---|---|---|
| U1 | The exact JSON shape TikFinity Desktop sends on port 21213 (event names, nesting, `msgId`, `giftType`, `repeatEnd`, `diamondCount`) | No TikFinity process was started; the client parses defensively with fallbacks (`server.cjs:456-524`), which itself implies the author was unsure | If real frames differ, gifts may be dropped (`parseGift` returns `null`) or counted as 1 diamond; joins/chats may be ignored | Connect TikFinity to the running server and log one frame of each type (read-only logging) |
| U2 | Whether `repeatEnd` is always present on the final streak frame | Same | **Entire combo gifts silently lost** (F-13) | Capture a real combo gift and inspect |
| U3 | Whether `msgId` is unique per gift streak or shared across all combo packets | Dedup runs before `parseGift` (`:463` vs `:493`), so shared ids would suppress the terminal packet too | Same as U2, plus dedup could hide legitimate repeats | Same capture |
| U4 | Whether TikFinity pushes room info proactively or only alongside events | `roomInfo` runs on every frame (`:460`) | The status pill may show no `@username`/room id at all | Observe a real session |
| U5 | Whether TikFinity emits `like`, `follow`, `share`, `subscribe` at all, and under what names | Server allowlist excludes them; nothing in the repo documents the source | **These features are simply absent**, which may surprise an operator expecting "likes" to matter | Read TikFinity's own documentation, or log all incoming event names |
| U6 | Whether TikFinity closes the socket cleanly on sleep/network loss | Reconnect logic only triggers on a `close` event (`:443`) | Half-open socket = permanently stale "connected" state with no recovery | Long-running soak test |

## 15.2 Browser / OBS behaviour that cannot be verified statically

| # | Unknown | Why | Risk | How to close |
|---|---|---|---|---|
| U7 | Whether OBS's Browser Source permits autoplay of the YouTube iframe and WebAudio without a gesture | Requires an OBS instance; code relies on `pointerdown`/`keydown` unlock (`overlay.js:118-130`) | **Silent BGM/SFX/speech in OBS** while working in a normal browser | Test one Browser Source in OBS with the real scene |
| U8 | Which Vietnamese voice `speechSynthesis` actually selects on the operator's Windows build | `getVoices()` output is environment-specific; the filter at `:196-198` is heuristic | Wrong voice/accent, or a male/English fallback via `voices[0]` | Enumerate voices in the target browser |
| U9 | Whether the YouTube video ids in the presets remain embeddable | Network/regional/copyright state is external | BGM silently fails; only a `console.warn` (`:82-84`) | Test each preset id |
| U10 | Whether `/api/speech` (Google Translate TTS) still works with that URL shape | Network dependency; unused by the UI | Irrelevant today; would matter only if a server-voice mode is added | Call it once from the operator's network |
| U11 | Actual OBS scene resolution the operator uses | Not stored in the project | Composition letterboxes or upscales | Check the operator's OBS profile |
| U12 | Whether the dashboard's embedded preview iframe doubles the SSE load in a way that matters | Requires load measurement | Extra renders only | Measure with devtools |

## 15.3 Product intent that the code does not settle

| # | Unknown | Evidence of ambiguity | Impact |
|---|---|---|---|
| U13 | Whether `config.giftSlots` was meant to be the real gift→action table | Present in `defaultState` (`server.cjs:66-72`) and in `wedding_state.json`, but read by nothing; the UI gift guide shows five gift archetypes | A future maintainer may implement against it and change all gift behaviour |
| U14 | Whether `steal_groom` was meant to mutate the groom server-side | The button exists; `/api/action` only broadcasts; no processor handles it | Broken feature vs. deliberately manual |
| U15 | Whether `config.speechMode: 'browser'` and `config.voice: 'vi-VN-HoaiMyNeural'` imply a planned server-side TTS path | `/api/speech` exists and is unused; `speechMode` is read by nothing | Dead configuration; suggests an abandoned design |
| U16 | Whether `showFireworks` / `soundEffects` / `showHearts` toggles are meant to work | `#fireworks-layer` is never written to; `showHearts` and `soundEffects` are never read; only `showRosePetals` and `showBubbles` are honoured (`overlay.js:549`, `:606`) | Operators toggling them in the JSON see no change |
| U17 | Whether the bride/groom were intended to be independently controllable Chibi characters | One composited sprite pair, no per-character nodes | A "Chibi engine" feature request would be a rewrite, not an extension |
| U18 | Whether the 24-seat layout was intended for all guests or only the seeded demo crowd | 24 coordinates exist, server assigns only 6 | Visual overlap on real lives |

## 15.4 Data and environment facts not present

| # | Unknown | Why it matters |
|---|---|---|
| U19 | How many unique viewers a real session produces | Determines whether F-12/F-11 are theoretical or immediate |
| U20 | Whether `wedding_state.json` was shipped seeded or is the author's own session data | The nested `config.config` proves it was written by the running app at least once; it also contains real-looking donor names and amounts |
| U21 | Whether any licence server or key-validation code exists outside this folder | Nothing here validates anything (F-21) |
| U22 | Git history beyond the single commit `05d8527` | No way to trace why the `config.config` nesting or the launcher/endpoint mismatch was introduced |
| U23 | Whether `capture_verify.cjs` produced the shipped assets or screenshots | It references a Gemini/antigravity brain directory; the assets themselves have no provenance metadata |
| U24 | Whether the project is ever run through TikTok LIVE Studio rather than OBS | The dashboard mentions both (`panel.js:28`, `index.html` copy) |

## 15.5 Explicitly *verified absent* (so these are not unknowns)

To prevent over-caution being read as uncertainty, these were checked and confirmed missing:

- No like / follow / share / subscribe / superfan / treasure event handling.
- No gift-ID-based mapping anywhere.
- No authentication, session, token, cookie or origin check on any route.
- No database, SQLite, ORM, migration, or cache layer.
- No `localStorage` / `sessionStorage` / `IndexedDB` / cookies in either front end.
- No sprite sheets, GIFs, videos, or audio files (`public/audio/` is empty).
- No framework, bundler, package manager manifest, lockfile, `node_modules`, tests, linter, or CI.
- No IPC between launcher and server beyond inherited stdio.
- No WebSocket server (the only WebSocket is the outbound client to TikFinity).
- No second overlay page and no overlay parametrisation.
- No heartbeat/ping on either the SSE stream or the TikFinity socket.
- No `server.on('error')`, no `process.on('unhandledRejection')`, no global error handler.

## 15.6 How this analysis was constrained

- No service was started, no port was bound, no TikFinity or OBS session was launched, no browser was driven.
- No file inside the application (outside `CODEBASE_ANALYSIS_REPORT/`) was created, modified, moved or deleted. `app/wedding_state.json` was already dirty in git before the analysis and was read only.
- Binary assets were enumerated (name, size, type) but not parsed.
- Secret values were **not** reproduced: the hard-coded licence key string at `server.cjs:665` is described by location only.
- `capture_verify.cjs` contains a personal absolute path; it is referenced here as a location, and the harness was not executed.

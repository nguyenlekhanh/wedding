# 00 — EXECUTIVE SUMMARY

**Project:** Tiệc Cưới Online Pro (`TiecCuoiLive`) — TikTok LIVE virtual wedding with Chibi-style characters
**Location analysed:** `C:\xampp\htdocs\ai\fbpage\banhang\tiktok y tuong marketing\source\DamCuoiV1`
**Build id (declared):** `tc-20261103-v1` (`BUILD_INFO.json`)
**Analysis type:** read-only reverse engineering. No project file was created, edited, renamed or deleted. All generated documents live in `CODEBASE_ANALYSIS_REPORT/`.
**Source revision:** single commit `05d8527 first commit`; working tree already had `app/wedding_state.json` modified before analysis began (runtime state file, not touched by this analysis).

---

## 1. What the application actually is

A **single-process Node.js HTTP server** (`app/server.cjs`, 899 lines) that:

1. serves a **dashboard** (`app/public/index.html` + `panel.js`) and a **1080×1920 LIVE overlay** (`app/public/overlay.html` + `overlay.js`);
2. opens an **outbound WebSocket client** to a locally installed **TikFinity Desktop** at `ws://127.0.0.1:21213/` (hard-coded, `server.cjs:407`, `server.cjs:568`);
3. normalises a small subset of TikTok LIVE events, mutates one in-memory state object, persists it to `app/wedding_state.json`, and re-broadcasts the whole state over **Server-Sent Events** (`/api/events`);
4. lets the overlay translate those broadcasts into **CSS/Web Animations effects** on static PNG "Chibi" characters.

There is **no framework, no bundler, no package.json and no npm dependency**. The runtime is a bundled `runtime/node.exe` (**verified `v24.15.0`**), started by `launcher.cjs` from `BAT_DAU.bat`.

`capture_verify.cjs` is a **developer-only screenshot harness** (headless Edge + CDP) and is not reachable from the launcher or the server.

---

## 2. Verified numbers

| Metric | Value |
|---|---|
| Files inspected (excluding `.git`, `.freebuff`, binaries enumerated but not parsed) | 26 |
| Source files read end-to-end | 11 (all text sources, 4,988 lines) |
| Backend modules | 1 (`app/server.cjs`) |
| Frontend modules | 2 JS + 3 HTML + 2 CSS (dashboard, overlay, styles) |
| HTTP API endpoints | **13** (`/api/events`, `/api/license/status`, `/api/state`, `/api/config`, `/api/action`, `/api/bgm`, `/api/demo`, `/api/connect`, `/api/disconnect`, `/api/status`, `/api/tikfinity`, `/api/reset`, `/api/speech`) + 1 static file handler |
| SSE event names emitted | **6** (`state`, `status`, `bgm`, `action`, `activity`, `focus`) |
| TikFinity event names accepted | **7** (`chat`, `gift`, `member`, `join`, `leave`, `memberLeave`, `userLeave`) |
| TikFinity event names actually wired to a handler | **3** (`chat`, `gift`, `join`) |
| Unsupported TikTok events (like/share/follow/subscribe) | **0 implemented** (verified: no occurrence in `server.cjs`) |
| Character ("Chibi") controllers | **3** (couple sprite, guest crowd, red-carpet procession actor) + 1 particle/effect layer |
| Chibi image assets | **8 PNG** (`couple_standing`, `couple_kissing`, `guest_1..6`) — no sprite sheets, no GIF, no video |
| Audio assets | **0 files** (`app/public/audio/` is empty); all SFX are WebAudio-synthesised |
| OBS overlay pages | **1** (`/overlay.html`); dashboard embeds it in a preview iframe |
| Persistence stores | **1** JSON file + in-memory state (no SQLite, no localStorage, no IndexedDB) |
| Technical findings raised | **24** (4 critical, 7 high, 8 medium, 5 low/informational) |

---

## 3. The five defects that matter most (all verified in code)

1. **The launcher can never detect a healthy server.** `launcher.cjs:27` and `:59` test `data.product === 'TiecCuoiLive'`, but `/api/license/status` (`server.cjs:660-670`) returns only `{valid, plan, status, licenseKey, expiresAt}`. Consequences: a clean start never opens the browser and prints a failure message after 20 s; a second start reports *"port in use by another application"* and exits 1.
2. **Most dashboard save buttons write to the wrong state path.** `panel.js` posts `{ config: {...} }` / `{ goals: {...} }` to `/api/config` (`panel.js:120`, `:133`, `:155`), while `server.cjs:682-686` merges the payload **into `state.config`**. The result is a nested `state.config.config` and unchanged groom/bride/goals. `app/wedding_state.json` already contains that nested `config.config` block — runtime evidence of the bug.
3. **The comment simulator is dead.** `panel.js:77` sends `{type:'comment'}`; `server.cjs:735` only accepts `chat` or `gift` and otherwise answers `400 Unknown demo type`.
4. **Auto-reconnect to TikFinity never runs.** The 6 s retry at `server.cjs:591-597` is guarded by `!activeTikFinityClient`, but `activeTikFinityClient` is only cleared by the explicit `/api/disconnect` path (`:546`), never on socket close. Once TikFinity closes, the session stays offline until the operator clicks Connect.
5. **The whole control surface is unauthenticated and LAN-exposed.** `server.cjs:897` binds `0.0.0.0`, every response carries `Access-Control-Allow-Origin: *` (`:622`), and no route checks identity — any device on the network can trigger ceremonies, wipe the session, or use the server as a TTS proxy.

---

## 4. Architectural character

- **Pattern:** one shared mutable `state` object, three "core event processors" (`processJoinEvent`, `processChatEvent`, `processGiftEvent`) that are the single funnel for TikFinity, webhook and demo traffic (`server.cjs:172-353`), SSE fan-out, and a *stateful client* that reconstructs ceremony behaviour from deltas.
- **Strongest module:** the TikFinity client (`TikFinityClient`, `server.cjs:357-534`) — defensive field fallbacks, 7 s connect timeout, msgId dedup with a 5000-entry cap, streak-aware gift parsing.
- **Most complex module:** `overlay.js` — 805 lines mixing SSE transport, YouTube BGM, WebAudio synthesis, speech synthesis, guest rendering, 7 ceremony routines, particle systems and a serialised red-carpet queue.
- **Highest coupling:** server → overlay is coupled only by **event name + payload shape**; there is no schema, so `action` verbs like `steal_groom` are emitted by the dashboard and silently ignored by the overlay.
- **Biggest structural gap:** the "gift → action" mapping is **name-regex based** (`server.cjs:252`, `:341-347`), not ID based. `config.giftSlots` (ids `rose`/`peach`/`clarinet`/`beer`/`ring`) is declared at `server.cjs:66-72` but **never read** by any handler.

---

## 5. Report set

| File | Contents |
|---|---|
| `00_EXECUTIVE_SUMMARY.md` | this document |
| `01_PROJECT_STRUCTURE.md` | full inventory, file→purpose→functions→callers |
| `02_SYSTEM_ARCHITECTURE.md` | verified stack, protocols, architecture diagram |
| `03_APPLICATION_STARTUP.md` | launcher trace, sequence diagram, failure points |
| `04_TIKFINITY_INTEGRATION.md` | connection, payload parsing, event set, reliability |
| `05_EVENT_PROCESSING_ENGINE.md` | normalisation, routing, queueing, concurrency |
| `06_CHIBI_ENGINE.md` | character system, animation lifecycle, assets |
| `07_GIFT_SYSTEM.md` | verified gift mappings, auction logic, combo behaviour |
| `08_OBS_OVERLAY.md` | overlay URLs, canvas, sync, refresh semantics |
| `09_DASHBOARD_UI.md` | page→API mapping, control inventory |
| `10_DATA_STORAGE.md` | JSON state model, what survives restart |
| `11_API_DOCUMENTATION.md` | 13 endpoints, SSE events, payload formats |
| `12_SECURITY_STABILITY_AUDIT.md` | 24 classified findings with line references |
| `13_END_TO_END_EVENT_TRACING.md` | 5 full lifecycle traces, step by step |
| `14_TECHNICAL_DEBT_AND_ROADMAP.md` | coupling, risks, phased roadmap (not implemented) |
| `15_UNKNOWN_AND_UNVERIFIED_AREAS.md` | explicit gaps and how to close them |
| `PROJECT_FLOW_SUMMARY.md` | the single-file technical overview |
| `FILE_REFERENCE_INDEX.md` | every source file and its relationships |

---

## 6. Confidence statement

Every function name, endpoint, event name, class and line number in this report set was read directly from the sources listed in `FILE_REFERENCE_INDEX.md`. Statements that depend on **runtime behaviour of TikFinity Desktop payloads**, on **OBS Browser Source behaviour**, or on **YouTube/TTS network responses** are segregated in `15_UNKNOWN_AND_UNVERIFIED_AREAS.md` and marked `INFERRED` or `UNKNOWN` at the point of use. Nothing in this report was inferred from a file name.

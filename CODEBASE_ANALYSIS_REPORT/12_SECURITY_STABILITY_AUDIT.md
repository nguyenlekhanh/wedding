# 12 — SECURITY, STABILITY AND PERFORMANCE AUDIT

Read-only review. Nothing was exploited, fuzzed, or executed against the running application. Severity reflects impact **for the intended deployment** (a single operator streaming from their own PC with OBS).

**Summary: 24 findings — 4 CRITICAL, 7 HIGH, 8 MEDIUM, 5 LOW/INFORMATIONAL.**

| ID | Severity | Area | Finding |
|---|---|---|---|
| F-01 | CRITICAL | Startup | Launcher's product-identity probe can never match → no browser, false "port in use" |
| F-02 | CRITICAL | Correctness | Dashboard couple/goal/voice saves write to the wrong state path |
| F-03 | CRITICAL | Security | Unauthenticated API + `Access-Control-Allow-Origin: *` + bind `0.0.0.0` |
| F-04 | CRITICAL | Security | Stored XSS in dashboard registry table (TikTok nickname → `innerHTML`) |
| F-05 | HIGH | Reliability | TikFinity auto-reconnect guard can never pass |
| F-06 | HIGH | Stability | No `server.on('error')` → `EADDRINUSE` terminates the process |
| F-07 | HIGH | Correctness | Comment simulator posts an unsupported `type` → 400 |
| F-08 | HIGH | Correctness | `steal_groom` action has no overlay handler |
| F-09 | HIGH | Rendering | Only 6 of 24 guest seats ever used for TikTok viewers |
| F-10 | HIGH | Stability | Overlay spawns duplicate `EventSource` instances on error |
| F-11 | HIGH | Performance | Synchronous whole-document write + full-state broadcast per event |
| F-12 | MEDIUM | Performance | Unbounded `people`/`scores`/DOM growth |
| F-13 | MEDIUM | Reliability | Streakable gifts are dropped until `repeatEnd`; may be lost entirely |
| F-14 | MEDIUM | Correctness | The same event can fire a ceremony twice |
| F-15 | MEDIUM | Security | `readJson()` has no body size limit |
| F-16 | MEDIUM | Security | `/api/speech` is an open Google-TTS proxy (and unused) |
| F-17 | MEDIUM | Correctness | Comment keyword matching has no word boundaries |
| F-19 | MEDIUM | Stability | Unhandled promise rejections in the overlay queue and async routes |
| F-20 | MEDIUM | Data loss | Corrupt state file is silently replaced on first mutation |
| F-18 | LOW | Rendering | `@import '/fonts/typography.css'` targets a non-existent file; bundled font unused |
| F-21 | LOW | Security | Licence endpoint is hard-coded, includes a literal key, enforces nothing |
| F-22 | LOW | Maintainability | `BUILD_INFO.json` is never read; port/product duplicated |
| F-23 | LOW | Maintainability | Dead code: `dispatch`/`handlers`, `#fireworks-layer`, `/api/state`, `/api/status`, `/api/speech`, `giftSlots` |
| F-24 | LOW | Hygiene | `capture_verify.cjs` hard-codes absolute personal paths and writes outside the project |

---

## CRITICAL

### F-01 — Launcher identity probe can never succeed

- **Files/lines:** `launcher.cjs:27`, `launcher.cjs:59` vs `server.cjs:660-670`.
- **Behaviour:** the launcher treats "this app is running" as `data.product === 'TiecCuoiLive'`. The licence endpoint returns `{valid, plan, status, licenseKey, expiresAt}` — no `product` field, ever. `BUILD_INFO.json` declares `product` but is never read.
- **Why it matters:** this is the only liveness/identity gate in the product.
- **Impact:** (a) clean start — the server boots correctly but the browser is **never opened**, and after 80 polls (20 s) the user sees *"Chưa mở được trang"*; (b) second start — the reachable-but-unmatched branch fires, so the app is reported as a **different** application occupying port 3003 and the process exits 1. Operators reasonably conclude the app is broken or launch duplicate copies.
- **Remediation:** make `/api/license/status` (or a dedicated `/api/health`) return `product:'TiecCuoiLive'` sourced from `BUILD_INFO.json`, or compare on a field that actually exists; treat any 200 from the expected endpoint as "ours".

### F-02 — Dashboard writes land on the wrong state path

- **Files/lines:** `panel.js:120-124`, `:133-140`, `:155-159` vs `server.cjs:682-686`.
- **Behaviour:** the dashboard posts `{config:{groom,bride,…}}`, `{goals:{…}}` and `{config:{speech,…}}`; the endpoint spreads the payload into `state.config`, creating `state.config.config` and `state.config.goals` while leaving `state.config.groom`, `state.goals`, etc. untouched.
- **Why it matters:** these are the product's primary configuration controls, and the UI reports success (`alert`) regardless.
- **Impact:** bride/groom/title/slogan/date/auction/min-coins/goals/voice can never be changed from the UI; the state document accumulates junk (`config.config` is already present in `app/wedding_state.json`); after the next `state` broadcast `renderAdminState` overwrites the operator's typed values, so edits visibly revert.
- **Remediation:** either post flat bodies from the client or nest the merge server-side per key (`config`, `goals`, `stats`); validate the accepted keys and return an error for unknown ones.

### F-03 — Unauthenticated API, wildcard CORS, all-interface bind

- **Files/lines:** `server.cjs:622` (`Access-Control-Allow-Origin: *`), `server.cjs:897` (`listen(PORT,'0.0.0.0')`); no auth check in any of the 13 routes.
- **Why it matters:** the server controls a live broadcast, wipes session data, and can trigger spoken announcements on stream.
- **Impact:** any device on the LAN (or any web page the operator visits, via wildcard CORS and simple `POST`s) can: fire ceremonies and banners on the LIVE overlay (`/api/action`), replace the groom (`/api/config` with a flat body), reset the registry (`/api/reset`), change BGM, inject fake gifts/comments (`/api/demo`, `/api/tikfinity`), and read the entire state including top-donor amounts (`/api/state`). `POST /api/action` needs no preflight for `text/plain`, so a cross-site form post is enough for some vectors.
- **Remediation:** bind `127.0.0.1` by default; drop the wildcard CORS; require a per-session token (header or cookie) on every mutating route; reject non-loopback `Host`/`Origin` where possible.

### F-04 — Stored XSS in the dashboard registry

- **Files/lines:** `panel.js:270-280` builds `<tr>` with `innerHTML` interpolating `d.name` (and `d.total`), where `d.name` derives from the TikTok `nickname` via `parseUser` (`server.cjs:506`) and is persisted in `state.scores` (`:257-263`).
- **Why it matters:** the nickname is attacker-controlled and is never escaped anywhere it reaches `innerHTML`.
- **Impact:** a viewer whose nickname is `<img src=x onerror=…>` executes script in the operator's dashboard origin the next time the registry renders — full control of the control plane (drive `/api/reset`, `/api/config`, exfiltrate state). Gift names flow into `textContent` elsewhere, so the registry is the primary vector.
- **Remediation:** build nodes with `textContent` (as `renderRegistry` already does in `overlay.js:327-366`), or escape before interpolation; add a CSP without `unsafe-inline`.

---

## HIGH

### F-05 — TikFinity auto-reconnect can never run

- **Lines:** `server.cjs:591-597` guarded by `!userDisconnected && !activeTikFinityClient`; `activeTikFinityClient` is only cleared in `disconnectTikFinity()` (`:546`) and at the start of the next `connectTikFinity()` (`:560`).
- **Behaviour:** on socket `close`, `emit('disconnected')` schedules the retry, but the module global still holds the dead client, so the condition is always false and the retry callback does nothing.
- **Impact:** any TikFinity restart, sleep/wake, or network blip permanently ends event reception until the operator clicks Connect. Tokens/diamonds sent during that window are lost with no indication on the overlay.
- **Remediation:** null the global inside the `disconnected` handler before scheduling; add attempt counting/backoff and surface an error state.

### F-06 — No server error handler

- **Line:** `server.cjs:897-899` — `server.listen(...)` with no `server.on('error', …)`.
- **Impact:** when port 3003 is taken (e.g. a duplicate launch — which F-01 makes likely), Node throws `EADDRINUSE` as an uncaught exception and the process exits immediately; the operator sees a raw stack trace instead of an actionable message.
- **Remediation:** handle `error` on the server (report port conflicts clearly), and probe the port before spawning.

### F-07 — Comment simulator is non-functional

- **Lines:** `panel.js:80` sends `{type:'comment'}`; `server.cjs:735` accepts only `chat`/`gift`; `:763` returns `400 {error:'Unknown demo type'}`.
- **Impact:** the operator's main rehearsal tool for chat keywords silently does nothing; `panel.js` ignores the response status, so there is no visible error at all. All 5 quick-keyword tags inherit the failure.
- **Remediation:** send `type:'chat'` (client) or accept `comment` as an alias (server); surface non-2xx responses in the UI.

### F-08 — "Cướp Chú Rể" button is inert

- **Lines:** `panel.js:62` sends `action:'steal_groom'`; `overlay.js:789-798` handles only `marry|kiss|cheers|dance|cake|champagne|petal`.
- **Impact:** the most prominent ceremony control in the UI does nothing visible, and it also never changes `config.groom` (the route only broadcasts). Operators will believe the groom changed when nothing happened.
- **Remediation:** send `marry` with an explicit initiator, or implement `steal_groom` server-side (mutate `config.groom`, broadcast `action`, persist).

### F-09 — 18 of 24 guest seats are unreachable

- **Lines:** `server.cjs:189`, `:216`, `:276` (`table: Math.floor(seatIdx/2) % 6`) vs `overlay.js:310` (`seatIdx = p.table % 24`).
- **Impact:** every TikTok viewer is placed on `banquetTables[0..5]` — the six back-left seats — stacked on top of the seeded guests that already occupy those tables. The two 12-seat rows are decorative after the first few guests; later guests visually overlap and their name badges collide, which is highly visible on stream.
- **Remediation:** assign `table` across `0..23` (or store a real seat index) and keep `seat` meaningful, or compute seats client-side from arrival order.

### F-10 — Duplicate SSE connections in the overlay

- **Lines:** `overlay.js:10-15` — `onerror` schedules `connect()` which constructs a new `EventSource` without closing the previous one; browsers also auto-reconnect natively.
- **Impact:** repeated errors create parallel streams. Duplicated `state` renders are wasteful, and duplicated `focus`/`action` deliveries would run ceremonies and queue the same gift multiple times. Handlers registered on the old instance stop firing after a reconnect (`:758-805` attaches to the first instance), so behaviour is inconsistent.
- **Remediation:** close the old source before reconnecting, or rely solely on native reconnect and just re-render on `open`; register listeners in a way that survives reconnects.

### F-11 — Blocking persistence and full-state fan-out per event

- **Lines:** `server.cjs:150-156` (`writeFileSync` of the whole document) called from `:308`, `:235`, `:195`, `:688`, `:726`, `:843`; `broadcast('state', state)` at `:349`, `:236`, `:193`.
- **Impact:** on a busy live (dozens of comments/gifts per minute) each event performs a synchronous disk write of a growing JSON document and serialises the whole state to every SSE client (which the overlay then re-renders, including `renderRegistry`'s `replaceChildren` at `overlay.js:329`). Event-loop stalls delay all clients simultaneously; the overlay can visibly lag the live.
- **Remediation:** debounce/coalesce persistence (e.g. 250-1000 ms, atomic temp+rename), persist only dirty keys, and broadcast deltas or throttled state instead of the full document per event.

---

## MEDIUM

### F-12 — Unbounded growth

`state.people` (`server.cjs:277`), `state.scores` (`:257`) and the overlay's `guestNodes` (`overlay.js:210`, populated in `:262-325`) grow for every unique viewer and are never evicted; only `recentGivers` is capped (`:287`). A long live yields a multi-megabyte state file, megabytes per SSE `state` event, and hundreds of absolutely-positioned DOM nodes all clustered on 6 seats (F-09). **Remediation:** cap the roster (e.g. top N by score plus a ring buffer of recent guests), evict in the overlay on the same rule.

### F-13 — Streak gifts may be silently dropped

`parseGift` returns `null` for `giftType === 1` until `repeatEnd` (`server.cjs:514`). If TikFinity does not set `repeatEnd` on the terminal frame — unverified — every combo gift is discarded with no counter, no score, no ceremony. **Remediation:** buffer streak packets keyed by gift/user and flush on `repeatEnd` **or** on a short timer.

### F-14 — Duplicate ceremonies for one event

Two verified paths: (a) a keyword comment emits both `activity.triggeredAction` and a separate `action` (`server.cjs:230-234`), and the overlay handles both (`overlay.js:776-784`, `:789-798`) → the ceremony runs twice; (b) a gift that wins the auction emits `action:'marry'` immediately (`:335`) and the queued `focus` item calls `triggerMarry` again when the actor reaches the altar (`overlay.js:700-702`) → the groom is crowned twice, seconds apart. **Remediation:** send a single canonical event per consequence; drop one of the two attack surfaces.

### F-15 — Unbounded request bodies

`readJson()` (`server.cjs:636-644`) concatenates chunks until `end` with no size cap and no `Content-Type` check. A large POST (any LAN client, see F-03) can exhaust memory. **Remediation:** enforce a few-KB limit and reject early; validate `Content-Type: application/json`.

### F-16 — Open TTS proxy

`/api/speech` (`server.cjs:846-872`) forwards arbitrary text (≤300 chars) to Google Translate TTS from the operator's IP, unauthenticated, with no rate limit, and it is **not called by either front end** (both use `speechSynthesis`). It is a free relay and an unattributed outbound dependency. **Remediation:** remove it, or require auth + rate limit if it is kept for a future server-voice mode.

### F-17 — Keyword matching without boundaries

`server.cjs:224-229` uses `comment.toLowerCase().includes(...)` on substrings such as `'hoa'`, `'hon'`, `'banh'`, `'ruou'`, `'nhay'`. Common Vietnamese words contain these sequences (`hoàng`, `hoà`, `không hôn`…), so unrelated comments start ceremonies, and the checks run before any length or spam control. **Remediation:** match on normalised tokens with word boundaries, and require an explicit trigger phrase list.

### F-19 — Unhandled promise rejections

`processOfferingQueue` (`overlay.js:654-754`) awaits `actor.animate(...).finished` twice (`:715`, `:741`) with no `try/catch`, and is started fire-and-forget by `queueOffering` (`:649-652`). On the server, all route handlers run inside one `async` callback with no outer `try/catch` except `/api/connect` (`:769`), so a throw in e.g. `/api/bgm` rejects with no response (the client hangs). **Remediation:** wrap the queue loop in `try/finally` (reset `isOfferingBusy`), and add a top-level `try/catch` that answers 500.

### F-20 — Corrupt state is silently destroyed

`server.cjs:141-148` catches a parse/read error, logs, and continues with defaults; the next mutation calls `persistState()` and overwrites the damaged file (`:152`). There is no backup, no atomic replace, and no schema version. **Remediation:** rename the unreadable file to `wedding_state.corrupt-<ts>.json` before continuing, and write atomically.

---

## LOW / INFORMATIONAL

### F-18 — Missing stylesheet and unused font
`overlay.css:1` imports `/fonts/typography.css`, which does not exist (only `OFL.txt` and `noto-sans-vietnamese.ttf` are in `fonts/`), so every overlay load issues a 404 and the declared `'An Nhien Sans'` family (`:14`) never resolves; the 2 MB TTF is shipped but no `@font-face` references it. Cosmetic but it changes metrics from the design intent.

### F-21 — Licence is decorative
`server.cjs:660-670` returns a hard-coded `valid:true` object **including a literal licence-key string** (value intentionally not reproduced here) and an `expiresAt` in 2099. Nothing validates, signs, or enforces it; the launcher uses the endpoint only as a ping (and fails to recognise it, F-01). Treat as UI theatre, not protection.

### F-22 — Unused build manifest
`BUILD_INFO.json` declares `product`, `version`, `buildId`, `port`; nothing reads it. The port is hard-coded in `launcher.cjs:6` and `server.cjs:7`, so the documented port and the real port can diverge silently.

### F-23 — Dead code and unused surfaces
`WeddingRealtime.handlers` + `dispatch()` (`overlay.js:6-24`) are never used; `#fireworks-layer` is never written to and `config.showFireworks` is never read; `/api/state`, `/api/status` and `/api/speech` have no caller; `config.giftSlots` is never read; `panel.css` includes rules for elements not present. Each is a false affordance for the next maintainer.

### F-24 — Developer harness in the shipped tree
`capture_verify.cjs` hard-codes `C:\Users\ducqu\.gemini\antigravity\brain\<uuid>` and the Edge install path, launches a debug browser on port 9222 and writes JPEGs outside the project. It is not wired into the app, but shipping it leaks a local username/path and invites accidental execution.

---

## Stability summary

| Area | Assessment |
|---|---|
| Error handling | thin: silent `catch` on frame decode, no route-level guard, no server `error` listener, no global `unhandledRejection` handler |
| Race conditions | ceremony timers are unowned and can strip each other's classes; duplicate ceremony paths; reconnect guard deadlock |
| State sync | whole-document broadcast is consistent but expensive; no versioning, no ordering guarantee beyond SSE connection order |
| Unhandled rejections | plausible on both sides (F-19) |
| Unexpected shutdown | only via F-06 (port conflict) or an unguarded throw in the socket listener |
| OBS refresh | recovers data, loses in-flight ceremonies and audio unlock (see `08_OBS_OVERLAY.md`) |
| Memory | slow growth per unique viewer (F-12); `seen` correctly capped at 5 000 |
| CPU | WebAudio oscillators are per-effect and short-lived; particle counts are capped; the real cost is per-event disk I/O and full-state re-render (F-11) |
| Security posture | no authN/authZ, wildcard CORS, stored XSS, open proxy — acceptable only on a fully trusted single-user machine, and only if bound to loopback |

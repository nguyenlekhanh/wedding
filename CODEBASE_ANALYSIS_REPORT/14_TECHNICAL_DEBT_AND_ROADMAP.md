# 14 — TECHNICAL DEBT AND IMPROVEMENT ROADMAP

> Recommendations only. **Nothing here was implemented.**

## 14.1 Overall architectural assessment

The application is a **single-file monolith with a stateful browser client**. For its size (≈4 988 lines of source, zero dependencies) it is coherent: one state object, three shared processors, one event-emission helper, and a client that owns all presentation. A new developer can read `server.cjs` top-to-bottom in one sitting and understand the entire backend. That is a real strength and it is why the defects in this report are all shallow — they are contract mismatches, not architectural mazes.

The weakness is symmetrical: because **there is no contract layer**, correctness depends on two files agreeing on payload shapes by memory. Half of the high-severity findings (F-02, F-07, F-08) are exactly that failure mode.

| Dimension | Rating | Justification |
|---|---|---|
| Readability | Good | linear routing, Vietnamese comments, meaningful names |
| Cohesion | Good on the server (processors centralised), poor on the client (`overlay.js` mixes transport, audio, speech, rendering, choreography) |
| Coupling | Low file-to-file, **high contract coupling** (event names + payload shapes untyped) |
| Testability | Very poor | no test files, no dependency injection, browser globals everywhere, hard-coded timings |
| Observability | Very poor | no event log, no counters beyond user-facing stats, no error surface in the UI |
| Security | Poor | no authN/authZ, wildcard CORS, stored XSS, open proxy |
| Extensibility | Fair | adding a ceremony requires edits in 2 files; adding an event type requires edits in 4 places |
| Portability | Good | portable Node + browser, no native deps, no build |

## 14.2 Architectural patterns in use

| Pattern | Where | Note |
|---|---|---|
| Shared mutable state + fan-out | `state` → `broadcast` | no immutability, no versioning |
| EventEmitter adapter | `TikFinityClient extends EventEmitter` (`server.cjs:357`) | isolates transport from domain |
| Normaliser | `parseUser` / `parseGift` | only exists for the WebSocket door |
| Router-by-string | `if (pathname === …)` (`:646-872`) | 13 branches, no table |
| Delta + snapshot hybrid | `state` snapshots, `action`/`focus` deltas | client must handle both |
| Client-side state machine via CSS classes + timers | all ceremonies | state lives in the DOM |
| Producer/consumer queue | `offeringQueue` (`overlay.js:647`) | the only real queue in the system |

## 14.3 Strongest and most complex modules

**Strongest — `TikFinityClient` (`server.cjs:357-534`).** Defensive field mining (`roomInfo`), a clean connection promise with a 7 s timeout and single-settlement guard, msgId dedup with a bounded cache, and streak-aware gift parsing. It is the only part of the codebase that anticipates malformed input. Its one flaw is the reconnect guard that lives *outside* the class (`:591-597`).

**Most complex — `overlay.js` (805 lines, 40+ functions).** It owns six responsibilities: SSE transport, viewport scaling, YouTube BGM, WebAudio SFX, Web Speech, guest rendering, seven ceremony choreographies, four particle emitters, ambient chatter, and a serialised animation queue. It is the file most likely to break when touched, and it has no tests.

**Most fragile cooperations:**
1. `handleMessage` → `emit` → `connectTikFinity` listeners → processors (three files' worth of assumptions collapsed into one closure).
2. `processGiftEvent` → `focus`/`action`/`state` → `queueOffering`/`triggerMarry`/`renderState` (two independent ceremony paths for one gift).
3. `panel.js` → `/api/config` (the payload shape that does not match).

## 14.4 Critical dependencies

| Dependency | Type | Risk if it changes |
|---|---|---|
| TikFinity Desktop WebSocket protocol at `ws://127.0.0.1:21213/` | external, hard-coded | total event loss; no fallback except the webhook |
| Field names inside TikFinity frames (`giftDetails.giftName`, `repeatEnd`, `extendedGiftInfo.diamond_count`, …) | external | gifts silently dropped or zero-valued (`Math.max(1,…)` masks zeros) |
| Global `WebSocket` in Node ≥ 21 | runtime | `ReferenceError` on an older bundled runtime; no version assertion |
| YouTube IFrame API + a valid video id | network | silent BGM failure (autoplay also blocked without a gesture) |
| `speechSynthesis` voices | OS/browser | fallback to `voices[0]`, possibly a non-Vietnamese voice |
| Google Translate TTS | network | only `/api/speech`, which nothing calls |
| OBS Browser Source | external | no events at all |
| `app/wedding_state.json` shape | internal, unversioned | ad-hoc merge decides compatibility |

## 14.5 Areas of high coupling and bottlenecks

| Area | Coupling | Bottleneck behaviour |
|---|---|---|
| `state` object | every route and processor reads/writes it; the whole document is broadcast and persisted | grows with viewers; each event copies it to every client |
| Ceremony vocabulary | `action` strings are produced in `server.cjs` (4 sites) and consumed in `overlay.js` (2 switch blocks) with no shared constant | an unknown verb fails silently (F-08) |
| Config keys | written by 3 routes, read by 2 front ends, partially applied | nested-write defect (F-02) |
| Seat coordinates | `banquetTables` in the client vs `table`/`seat` in the server | only 6 of 24 seats used (F-09) |
| Disk I/O | `persistState` inside every processor | synchronous write per event blocks all SSE clients (F-11) |

## 14.6 Technical debt inventory

| # | Debt | Cost now | Cost if ignored |
|---|---|---|---|
| D1 | No shared contract/validation for API bodies | 3 broken controls (F-02, F-07, F-08) | every new control risks another silent no-op |
| D2 | No test harness at all | defects only found by hand | regressions are invisible |
| D3 | Presentation logic in CSS classes without ownership | double ceremonies, early class removal | choreography bugs that look like "random glitches" on stream |
| D4 | Whole-document persistence + broadcast | CPU/IO per event | lag and disk churn as audiences grow |
| D5 | Unbounded roster/score maps | memory + DOM growth (F-12) | long lives degrade and eventually stall OBS |
| D6 | Silent error handling (`catch {}`) | invisible failures everywhere | impossible field diagnosis |
| D7 | Dead configuration (`giftSlots`, `showFireworks`, `speechMode`, `voice`, `soundEffects`) | misleading UI/state | developers implement against phantom features |
| D8 | Licence theatre | false sense of enforcement | accidental redistribution is unimpeded |
| D9 | Hard-coded ports/host/endpoint in 4 places | F-01, F-06 | multi-instance use is impossible |
| D10 | Single 805-line client module | slow, risky edits | every UI change requires whole-file comprehension |
| D11 | No schema version in the state file | merge logic is guesswork | a future shape change silently loses data |
| D12 | Dev harness shipped in-tree | path/username leakage (F-24) | accidental execution during a live |

## 14.7 Risk profile when adding features

| Feature to add | Risk | Why |
|---|---|---|
| New TikTok event type (like/share/follow) | **Medium** | must touch the allowlist (`:461`), add a parser, add an `emit`, add a listener in `connectTikFinity`, add a processor, add an SSE event, add a client handler — six sites, no compiler help |
| New gift → action rule | **Medium-High** | the mapping is name-regex and `giftSlots` is dead; adding ID mapping means changing `parseGift` + `processGiftEvent` + the client |
| New ceremony | **Low-Medium** | add a `triggerX` in `overlay.js` + a branch in two dispatchers + the verb in `panel.js`; easy to forget one dispatcher (exactly F-08) |
| New seating scheme | **High** | server and client both encode seat maths and disagree (F-09) |
| Persistence change (e.g. SQLite) | **High** | every processor writes via `persistState`; state shape is unversioned |
| Authentication | **Medium** | 13 routes plus both front ends plus the launcher probe (which already breaks on identity) |
| Multiple simultaneous overlays with different scenes | **High** | one global broadcast stream, one state document, no per-client subscription |
| Localisation | **Medium** | Vietnamese strings are embedded in server processors, HTML, and JS |

### Modules that must not be modified without understanding their dependents

1. **`server.cjs:172-353` (the three processors).** They define every state mutation and every SSE payload. Changing a field name breaks the overlay silently.
2. **`server.cjs:357-534` (`TikFinityClient`).** Any change to `emit` names or payload shapes requires a matching change in `connectTikFinity` (`:571-595`), which is the only listener registration site.
3. **`overlay.js:646-754` (offering queue).** It is the only serialised animation pipeline; the `isOfferingBusy` flag has no `finally`, so an exception there stops all future gift ceremonies.
4. **`overlay.js:214-248` (`banquetTables`) + `server.cjs` seat maths.** They are two halves of one contract.
5. **`server.cjs:128-148` (boot merge).** It decides whether existing operator data survives a release.
6. **`launcher.cjs:16-36` (probe + spawn).** It is the only guard against double instances, and it is already wrong.

## 14.8 Recommended roadmap (phased, not implemented)

**Phase 0 — stop the bleeding (highest value, lowest risk)**
1. Fix the launcher identity contract (F-01) and add `server.on('error')` (F-06) so port problems are reported honestly.
2. Fix the three dashboard payload shapes (F-02) and the comment simulator's `type` (F-07).
3. Bind to loopback, remove wildcard CORS, add a session token on mutating routes (F-03).
4. Replace `innerHTML` donor rendering with `textContent` (F-04).
5. Repair the reconnect guard (F-05).

**Phase 1 — correctness and observability**
6. Single canonical ceremony event per consequence; remove the duplicate chat/action path and the double `triggerMarry` (F-14).
7. Assign real seats across all 24 (F-09), and cap/evict the roster (F-12).
8. Add an event log panel (ring buffer of the last N events with type, user, payload summary) — the single biggest diagnostic lever.
9. Add structured error reporting: route-level `try/catch`, a global `unhandledRejection` handler in both server and overlay, and a visible "connection lost" state on the overlay.

**Phase 2 — robustness and performance**
10. Debounce + atomic persistence (temp file + rename), persist dirty keys only (F-11, F-20).
11. Broadcast throttled deltas instead of the full state per event; keep the snapshot only for connect.
12. Buffer gift streaks and flush on `repeatEnd` or a timer (F-13).
13. Bound request bodies and validate `Content-Type` (F-15); remove or protect `/api/speech` (F-16).
14. Close-before-reconnect in the overlay and make handlers reconnect-safe (F-10).

**Phase 3 — architecture, only if the product grows**
15. Introduce an explicit schema for `state` (version field + migration function) and a shared constants module for action verbs and config keys.
16. Split `overlay.js` by concern (transport / audio / rendering / choreography) without changing behaviour.
17. Consider a per-client scene parameter if multi-overlay or "clean scene" variants are needed.
18. Make TikTok source configuration data (env or state) instead of hard-coded literals — the only way to support a non-default TikFinity port or a remote host.
19. If chat volume justifies it, move gift/chat handling behind a small queue with backpressure, and add per-user rate limiting.

**Deliberately not recommended:** adding a framework, a bundler, or a database. The current stack is appropriate to the deployment (one operator, one machine, one live at a time); the debt is in contracts and error handling, not in the absence of tooling.

# 10 — DATA STORAGE AND CONFIGURATION

## 10.1 Storage inventory

| Store | Location | Structure | Purpose | Read by | Written by |
|---|---|---|---|---|---|
| **State file (JSON)** | `app/wedding_state.json` (path built as `path.join(__dirname,'wedding_state.json')`, `server.cjs:8`) | one object: `config`, `stats`, `goals`, `people[]`, `scores{}`, `recentGivers[]`, `status{}` | the only durable persistence | `server.cjs:128-148` at boot | `persistState()` `server.cjs:150-156` |
| In-memory state | `let state` (`server.cjs:128`) | same shape | authoritative live copy | all processors and routes | all processors and routes |
| Seed defaults | `defaultState` (`server.cjs:11-126`) | same shape | bootstrap + per-key fallback merge | boot merge | never written |
| SSE client set | `clients` (`server.cjs:159`) | `Set<ServerResponse>` | fan-out targets | `broadcast` | `/api/events` add / `req.close` delete |
| TikTok client | `activeTikFinityClient`, `tikfinityReconnectTimer`, `userDisconnected` (`server.cjs:536-538`) | module globals | connection lifecycle | connect/disconnect | connect/disconnect |
| Dedup cache | `TikFinityClient.seen` (`server.cjs:362`) | `Set<string>` capped 5 000, FIFO eviction | duplicate frame suppression | `handleMessage` | `handleMessage` |
| Overlay locals | `currentState`, `guestNodes`, `offeringQueue`, `isOfferingBusy`, `ceremonyTimer`, `kissTimeout`, `ytPlayer`, `audioCtx` | browser memory | render/animation state | overlay functions | SSE handlers |
| Browser persistent storage | **none** | — | — | — | — |

**Verified absences:** no `localStorage`, `sessionStorage`, `IndexedDB`, cookie, SQLite, Postgres, Redis, or temp-file usage anywhere in `server.cjs`, `panel.js`, `overlay.js` or the HTML files. `public/audio/` is empty and unused. The only files the app writes are `app/wedding_state.json` (server) and, if executed manually, JPEGs outside the project by `capture_verify.cjs`.

## 10.2 `wedding_state.json` shape

| Top-level key | Type | Contents | Persisted across restart? |
|---|---|---|---|
| `config` | object | `groom`, `bride`, `title`, `slogan`, `date`, `showRosePetals`, `showHearts`, `showFireworks`, `showBubbles`, `speech`, `voice`, `speechMode`, `volume`, `voicePitch`, `voiceRate`, `soundEffects`, `enableMarryAuction`, `minCoinsToMarry`, `funnyVoiceEnabled`, `bgm{enabled,youtubeUrl,youtubeId,title,volume,playing}`, `thanksTemplate`, `funnyJokes[]`, `marryJokes[]`, `wishes[]`, `giftSlots[]` | ✅ yes |
| `stats` | object | `guests`, `outside`, `envelopes`, `wishes` | ✅ yes |
| `goals` | object | `rose{current,target,label}`, `cake{current,target,label}` | ✅ yes |
| `people` | array | guest objects `{id,name,avatar,sprite,table,seat,statusTag}` | ✅ yes |
| `scores` | object | id → `{id,name,total,avatar}` | ✅ yes |
| `recentGivers` | array | last ≤8 `{id,name,gift,count,diamonds,total}` | ✅ yes |
| `status` | object | `{state,message,username,roomId,mode}` — persisted but **reset to a stale value on boot** (the saved `offline` message is simply reloaded) | ✅ (stale) |

Mutating routes (`/api/config`, `/api/bgm`, `/api/reset`, `/api/demo`) and all three processors call `persistState()`. `POST /api/action`, `POST /api/connect` and `/api/disconnect` do **not** write the file (they only mutate `state.status` in memory and broadcast).

## 10.3 Boot merge semantics

```js
state = { ...defaultState, ...parsed,
          config: {...defaultState.config, ...(parsed.config||{})},
          stats:  {...defaultState.stats,  ...(parsed.stats||{})},
          goals:  {...defaultState.goals,  ...(parsed.goals||{})},
          scores: {...defaultState.scores, ...(parsed.scores||{})},
          status: {...defaultState.status, ...(parsed.status||{})} };
if (parsed.people?.length) state.people = parsed.people;
```

(`server.cjs:128-140`.) Notes:

- The merge is **two levels deep only**. A missing nested key such as `config.bgm` would be dropped wholesale rather than merged, because `bgm` is only deep-merged at write time in `/api/config` (`:685`).
- `people` is replaced **only when the saved array is non-empty**; otherwise `state.people` keeps the *reference* to `defaultState.people`, so pushes during that session mutate the in-code defaults (harmless per-process, but it means an empty saved roster behaves differently from a 1-guest roster).
- A corrupt file is logged and ignored, and then **overwritten** on the first mutation (`:145-156`) — the previous session's data is lost.
- `app/wedding_state.json` in the repository already contains a nested `config.config` block. That is runtime evidence of the `panel.js` → `/api/config` payload-shape defect described in `09_DASHBOARD_UI.md` §9.4.

## 10.4 What actually survives a restart

| Survives | Does not survive |
|---|---|
| groom (including the last auction winner), bride, title, slogan, date | TikFinity connection (always starts `offline`; must click Connect) |
| auction toggles, min coins, speech/voice settings (only if written directly to the file — the UI cannot change them) | SSE connections and in-flight ceremonies |
| BGM URL/id/title/volume/playing (UI **can** change these) | the offering queue, banner timers, particle nodes |
| jokes/wishes/templates arrays | `seen` dedup cache (correct — it is per-connection) |
| all counters, goals, guests, scores, registry | `activeTikFinityClient` / reconnect timer |
| `status` object as last written (stale) | overlay animation state and the YouTube player instance |

## 10.5 Concurrency and integrity characteristics

- Writes are **synchronous, whole-document** (`writeFileSync`, `server.cjs:152`) on every comment, gift, join, config change, BGM change and reset. On a busy live this is the single most expensive operation per event and it blocks the event loop, including the SSE fan-out that follows it.
- There is **no atomic write** (no temp file + rename) and no backup, so a crash mid-write can leave truncated JSON; the next boot then falls into the catch path and silently discards everything.
- There is **no schema version field**, so future shape changes must rely on the ad-hoc merge.
- `people`, `scores` and `recentGivers` grow without eviction (`recentGivers` is capped at 8, `scores` and `people` are not). A long live with thousands of unique viewers produces an ever-growing JSON document, an ever-growing `state` payload on every SSE broadcast, and ever-growing browser DOM nodes.
- The file is tracked by git and mutated at runtime, so every broadcast session dirties the working tree.

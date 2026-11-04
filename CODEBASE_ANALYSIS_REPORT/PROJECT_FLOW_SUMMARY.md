# PROJECT_FLOW SUMMARY — Tiệc Cưới Online Pro (TiecCuoiLive)

> The single-file technical overview. Reading only this document should let a developer understand the architecture and the life of a LIVE event. Every claim maps to `app/server.cjs` (899 lines), `app/public/overlay.js` (805), `app/public/panel.js` (412), `launcher.cjs` (72) or the HTML/CSS.

---

## 1. How the application starts

```
BAT_DAU.bat  →  runtime\node.exe launcher.cjs  →  runtime\node.exe app/server.cjs  →  http://localhost:3003
```

- `BAT_DAU.bat` switches the console to UTF-8, verifies `runtime\node.exe` exists, then runs `launcher.cjs` (`BAT_DAU.bat:2-9`).
- `launcher.cjs` resolves the port from `TIECCUOI_PORT` (default **3003**, `:6`), probes `GET /api/license/status` with a 700 ms timeout (`:16-23`), and then either decides the app is already up, reports a foreign process, or spawns the server with `cwd=app`, `env.PORT`, and inherited stdio (`:39-49`).
- `server.cjs` reads `app/wedding_state.json` at boot, merges it over `defaultState` (`:128-148`), and listens on **0.0.0.0:3003** (`:897`).
- The browser is opened with `rundll32.exe url.dll,FileProtocolHandler` (`launcher.cjs:9-14`).

**Verified defect:** the identity test is `data.product === 'TiecCuoiLive'` (`:27`, `:59`) but the endpoint never returns `product` (`:660-670`). Net effect: on a clean start the browser is never opened and the launcher prints a failure after 20 s; on a second start it wrongly claims port 3003 belongs to another application. There is **no licence enforcement anywhere**; the licence route returns a hard-coded success object.

---

## 2. How it connects to TikFinity

The **backend** is the client. On `POST /api/connect` (`server.cjs:768`) it calls `connectTikFinity()` (`:554`), which instantiates `class TikFinityClient extends EventEmitter` (`:357`) and opens:

```
ws://127.0.0.1:21213/      ← hard-coded at server.cjs:358 and :568
```

- 7 000 ms connect timeout (`:412`); `open` resolves and status becomes `waiting`; the first event flips it to `connected`.
- There is **no subscription message** and **no heartbeat**; the server passively parses every frame.
- `POST /api/disconnect` (`:783`) tears the client down and clears listeners; status becomes `offline`.
- `POST /api/tikfinity` (`:798`) is an alternative webhook door into the same processors.
- **Auto-reconnect is coded but unreachable:** the 6 s retry at `:591-597` is guarded by `!activeTikFinityClient`, and that global is never cleared on socket close — so a dropped TikFinity connection stays dropped until the operator clicks Connect.

---

## 3. How TikTok LIVE events are received

Every frame lands in `ws.addEventListener('message')` (`:430`), is `JSON.parse`d inside a silent `try/catch`, and is handed to `TikFinityClient.handleMessage` (`:456`), which:

1. reads `msg.event` / `msg.data` and opportunistically mines room identity (`roomInfo`, `:377`);
2. enforces an allowlist of **7** names (`:461`): `chat`, `gift`, `member`, `join`, `leave`, `memberLeave`, `userLeave`;
3. deduplicates on `event + '|' + msgId` with a 5 000-entry FIFO cache (`:463-471`);
4. normalises the sender via `parseUser` (`:501`: `userId`→`idStr`→`id`→`uniqueId`→`displayId`, nickname truncated to 60, avatar from 4 URL shapes) and the gift via `parseGift` (`:511`);
5. emits `chat` / `gift` / `join`.

**Only three of the seven are handled.** `leave`/`memberLeave`/`userLeave` are parsed and emitted (`:475`) but no listener exists, so viewers are never removed. **Like, follow, share and subscribe are not implemented at all** — they are not in the allowlist and the strings do not appear in the backend.

---

## 4. How gifts are processed

`processGiftEvent` (`server.cjs:240-353`), the single funnel for TikFinity, webhook and demo gifts:

| Step | Line | Effect |
|---|---|---|
| guard | 241 | drop if `id` missing/`'unknown'` |
| value | 246 | `totalCoins = count * diamonds` |
| counters | 248-254 | `stats.envelopes += count`; rose goal `+= count` if the **name** matches `/hoa|rose/i`; cake goal `+= totalCoins*100` |
| leaderboard | 257-263 | `scores[id].total += totalCoins` |
| roster | 266-283 | create the guest (random sprite 0-5, `table = floor(len/2)%6`) or set tag `👑 Đại gia` |
| registry | 286-287 | `recentGivers` keeps the giver once, max 8 |
| **auction** | 288-306 | if enabled and `totalCoins >= config.minCoinsToMarry` (default **10**): **`config.groom = donor nickname`**, capture `previousGroom`, build `funnyMessage` from `config.marryJokes` |
| persist | 308 | blocking whole-file write |
| emit | 333-349 | `focus{becameGroom,prayer,isRobbed,funnyMessage,previousGroom}`, at most one `action`, then `state` |

Gift *streaks*: `parseGift` returns `null` while `giftType === 1 && !repeatEnd` (`:514`), so only the terminal combo packet counts, at full `repeatCount`.

---

## 5. How the Chibi action is chosen

There is **no gift-ID table**. `config.giftSlots` (five entries with ids `rose`/`peach`/`clarinet`/`beer`/`ring` and actions `envelope`/`gold`/`dance`/`cheers`/`ring`) is declared at `server.cjs:66-72` and **read by nothing**.

The decision is a two-input rule set:

```
1) auction test   : totalCoins >= minCoinsToMarry  → action 'marry'   (and config.groom changes)
2) else gift-name : /hoa|rose/       → 'petal'
                    /bánh|cake/      → 'cake'
                    /rượu|champagne|wine/ → 'champagne'
3) else           : no action — only the red-carpet 'focus' ceremony
4) comments       : substring scan of the raw text (:224-229)
                    hôn→kiss, dzô/zô/cụng ly→cheers, nhảy/quẩy→dance,
                    bánh→cake, rượu/sâm panh→champagne, hoa→petal
5) dashboard      : any verb POSTed to /api/action is broadcast verbatim
```

Note the chain is `if/else if` (`:334-347`), so a rose gift that also wins the auction produces **only** `marry`.

---

## 6. How the Chibi engine controls characters

Three controllers, all CSS/DOM, no sprite sheets:

| Controller | Node | Mechanism |
|---|---|---|
| **Couple** | `#couple-sprite` (255×280) | swap `background-image` between `couple_standing.png` and `couple_kissing.png` by toggling `couple-idle` / `couple-kissing` (`overlay.css:322-341`); the groom's *name* is separate text (`#groom-name`) |
| **Guest crowd** | `.wedding-guest` × N in `#guests-container` | `renderGuests()` (`overlay.js:262-325`) creates/updates nodes, positions them on 24 fixed seats (`banquetTables`, `:214-248`), sets `sprite`, badge, status tag; `dancing` / `cheering` classes drive crowd reactions |
| **Red-carpet donor** | `#procession-actor` | `processOfferingQueue()` (`:654-754`) walks one donor up the carpet with WAAPI (3.8 s), crowns/presents, holds a card 4.8 s, walks back (2.8 s) |

Animation state lives in the DOM plus module timers (`ceremonyTimer`, `kissTimeout`, `isOfferingBusy`, `offeringQueue`). Ceremonies are **not** queued or exclusive; a single `#ceremony-alert-banner` is overwritten by whichever ceremony fired last. The gift procession **is** serialised.

**Verified defect:** the server assigns `table` in `0..5`, and the overlay indexes `banquetTables[p.table % 24]`, so only **6 of the 24 seats** are ever used by TikTok viewers; newcomers stack on top of the seeded guests.

---

## 7. How animations are rendered

Two mechanisms only:

1. **CSS keyframes toggled by class** — breathing couple, kiss bounce, crown float/flash, guest sway/dance/cheer, banner pop, toast glow, petal fall, bubble float, heart float (`overlay.css` throughout). Durations are hard-coded in the client and **unknown to the server**.
2. **Web Animations API** — only the red-carpet walk uses `actor.animate([...], {duration, fill:'forwards'})` (`overlay.js:693-712`, `:735-744`).

Audio is generated, not loaded: `playClink`, `playWeddingBell`, `playFanfare` build oscillator graphs (`:136-188`); the MC voice is `speechSynthesis` with a Vietnamese voice and `pitch/rate/volume` from config (`:191-207`); background music is a YouTube IFrame player driven by `config.bgm` (`:47-120`). `public/audio/` is empty.

---

## 8. How OBS receives and displays the overlay

OBS does not receive data. It loads a page:

```
http://localhost:3003/overlay.html      #frame = 1080 × 1920, opaque background
```

- `fit()` (`overlay.js:27-42`) scales the fixed frame into whatever viewport OBS provides, letterboxed and centred, recomputed on resize/load/ResizeObserver.
- The page opens `new EventSource('/api/events')` (`:10`, `:756`) and reacts to **6 SSE events**:
  `state` → `renderState`; `bgm` → YouTube player; `activity` → chat bubble (+ optional ceremony); `action` → ceremony; `focus` → red-carpet queue. (`status` is emitted but the overlay has no listener, so connection health is invisible on stream.)
- Server side, `broadcast(event, data)` writes `event: <name>\ndata: <JSON>\n\n` to every response in the `clients` Set (`server.cjs:160-170`), and a new subscriber immediately receives one `state` + one `status` snapshot (`:651-652`).
- On refresh: data is restored from the snapshot; **in-flight ceremonies, the offering queue and audio unlock are lost**. BGM/SFX/speech may remain silent in OBS because the page can never receive the pointer/key gesture it waits for (`:118-130`).

---

## 9. How application state is stored

| Store | What |
|---|---|
| `app/wedding_state.json` | the **only** durable store: `config`, `stats`, `goals`, `people[]`, `scores{}`, `recentGivers[]`, `status{}` |
| `let state` (`server.cjs:128`) | authoritative in-memory copy, merged over `defaultState` at boot |
| `clients` Set | SSE fan-out targets |
| `activeTikFinityClient` + globals | connection lifecycle |
| `TikFinityClient.seen` | msgId dedup, capped 5 000 |
| browser memory | `currentState`, `guestNodes`, `offeringQueue`, timers, `ytPlayer`, `audioCtx` |

No SQLite, no `localStorage`/`sessionStorage`/IndexedDB, no cookies. Writes are **synchronous whole-document rewrites** on every mutation (`:150-156`), with no atomic replace, no backup and no schema version. What survives a restart: identities, settings, BGM, all counters, guests, scores and the current groom (including the last auction winner). What does not: the TikFinity connection, ceremonies in flight, and the overlay's animation state.

**Verified defect:** the dashboard saves couple/goals/voice settings as `{config:{…}}` / `{goals:{…}}` while the endpoint merges into `state.config` (`panel.js:120` vs `server.cjs:682`), so those controls cannot work and the file accumulates a nested `config.config` — a block already present in the shipped `wedding_state.json`.

---

## 10. The files that own the important workflows

| Workflow | Owning file(s) |
|---|---|
| Process start / single-instance / port | `BAT_DAU.bat`, `launcher.cjs` |
| All HTTP routes, SSE, state, TikFinity client, gift/chat/join logic | `app/server.cjs` |
| LIVE visual composition, ceremonies, particles, red-carpet queue, audio | `app/public/overlay.js` + `overlay.html` + `overlay.css` |
| Operator console, connection control, simulator, BGM | `app/public/panel.js` + `index.html` + `panel.css` |
| Persistent session data | `app/wedding_state.json` |
| Shipped metadata (unused) | `BUILD_INFO.json` |
| Developer screenshot harness (not in the flow) | `app/capture_verify.cjs` |

---

## 11. One-paragraph mental model

A portable Node process is the **authority**: it owns one mutable wedding state, ingests TikTok activity through a hard-coded WebSocket client (or a webhook), decides consequences in three shared processors (counters, leaderboard, and a coin-threshold "marry the donor" auction), persists the whole document to one JSON file, and re-broadcasts the document plus a few named deltas over SSE. Every browser — the dashboard and the OBS overlay — is a **passive renderer** that turns those deltas into CSS-animated Chibi scenes. There is no authentication, no schema, no queue on the server, and no feedback from the renderer, which is why the system is trivial to understand and fragile at exactly the seams where two files must agree.

---

## 12. Five things to know before changing anything

1. `server.cjs:172-353` (the processors) define every state mutation and every SSE payload — renaming a field breaks the overlay silently.
2. `server.cjs:357-534` + `:571-595` are one contract: `emit` names here are listened for only there.
3. `overlay.js:646-754` is the only serialised animation pipeline, and `isOfferingBusy` has no `finally` — one throw stops all future gift ceremonies.
4. Seat maths is split across `server.cjs` (`table`/`seat`) and `overlay.js` (`banquetTables`); they already disagree.
5. `server.cjs:128-148` (boot merge) decides whether an operator's existing session data survives your release.

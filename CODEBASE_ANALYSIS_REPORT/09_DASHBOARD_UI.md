# 09 — DASHBOARD AND USER INTERFACE

## 9.1 Structure

`index.html` (518 lines) is a three-column shell: `.sidebar` (brand, 7-tab nav, author card), `.main-content` (topbar + 7 `.tab-pane` sections), `.preview-sidebar` (9:16 phone frame with `iframe#preview-iframe`). Tabs are switched purely client-side by toggling `.active` (`panel.js:14-23`); no routing, no URL state, no deep links.

| Tab (`data-tab`) | Title | Purpose | Section id |
|---|---|---|---|
| `tab-overview` | Tổng quan & Điều khiển LIVE | TikFinity connect card, 4 stat cards, 7 ceremony buttons, demo simulator | `#tab-overview` |
| `tab-couple` | Cô dâu & Chú rể | groom/bride/title/slogan/date, auction toggle, min coins | `#tab-couple` |
| `tab-registry` | Sổ Mừng Cưới & Khách | top-giver table + reset session | `#tab-registry` |
| `tab-goals` | Quà Tặng & Mục Tiêu | rose + cake targets | `#tab-goals` |
| `tab-voice` | Âm Thanh & Giọng Đọc AI | speech toggles, pitch/rate/volume, thanks template, test | `#tab-voice` |
| `tab-bgm` | Nhạc Nền Cưới (YouTube) | URL, title, volume, playing, 5 presets | `#tab-bgm` |
| `tab-tikfinity` | Kết Nối TikTok / TikFinity | 3-step guide, live status line, webhook fallback | `#tab-tikfinity` |

## 9.2 Control → API → handler mapping

| Control (element id) | Frontend handler | Request | Server handler | State touched | Feedback |
|---|---|---|---|---|---|
| `#connect` (⚡ Kết nối TikFinity) | `panel.js:386-405` | `POST /api/connect` | `server.cjs:768-781` → `connectTikFinity():554` | `state.status`, opens WS | button disabled; status pill/message; failure → `alert` with 3-step remedy |
| `#disconnect` | `panel.js:407-411` | `POST /api/disconnect` | `server.cjs:783-789` → `disconnectTikFinity():540` | `state.status` → offline | pill update |
| `#btn-copy-link` | `panel.js:26-34` | — | — | — | `alert` / `prompt` fallback |
| `#btn-copy-webhook` | `panel.js:36-42` | — | — | — | `alert` with `/api/tikfinity` |
| `#btn-refresh-preview` | `panel.js:44-48` | — | — | — | iframe reload |
| `#btn-action-steal-groom` | `panel.js:62` → `sendAction('steal_groom')` | `POST /api/action` | `server.cjs:695-702` → `broadcast('action')` | **none** | **no effect on overlay** (no `steal_groom` branch in `overlay.js:789-798`) |
| `#btn-action-kiss` | `panel.js:63` | `POST /api/action` `{action:'kiss'}` | same | none | `triggerKiss()` |
| `#btn-action-cake` | `panel.js:64` | `{action:'cake'}` | same | none | `triggerCake()` |
| `#btn-action-champagne` | `panel.js:65` | `{action:'champagne'}` | same | none | `triggerChampagne()` |
| `#btn-action-cheers` | `panel.js:66` | `{action:'cheers'}` | same | none | `triggerCheers()` |
| `#btn-action-dance` | `panel.js:67` | `{action:'dance'}` | same | none | `triggerDance()` |
| `#btn-action-petal` | `panel.js:68` | `{action:'petal'}` | same | none | `triggerPetal()` |
| `#btn-send-sim-comment` + `.tag-btn` | `panel.js:71-90` | `POST /api/demo` `{type:'comment'}` | `server.cjs:733-766` | **rejected** | **`400 Unknown demo type`** — feature is non-functional |
| `.btn-gift` (4 buttons) | `panel.js:92-108` | `POST /api/demo` `{type:'gift', gift, count, diamonds}` | same | full gift pipeline | overlay ceremony |
| `#btn-save-couple` | `panel.js:111-127` | `POST /api/config` `{config:{...}}` | `server.cjs:680-693` | **creates `state.config.config`**; groom/bride/title/slogan/date/auction/minCoins **unchanged** | `alert` claims success |
| `#btn-save-goals` | `panel.js:129-145` | `POST /api/config` `{goals:{...}}` | same | **`state.config.goals`**; `state.goals` unchanged | `alert` claims success |
| `#btn-save-voice` | `panel.js:147-162` | `POST /api/config` `{config:{...}}` | same | **`state.config.config`**; speech settings unchanged | `alert` claims success |
| `#btn-test-voice` | `panel.js:164-187` | — | — | — | local `speechSynthesis` only (does **not** read saved config) |
| `#btn-reset-session` | `panel.js:189-194` | `POST /api/reset` | `server.cjs:829-844` | clears people/scores/recentGivers, zeroes stats/goals | `confirm()` then `alert` |
| `#btn-apply-bgm` / `#btn-save-bgm` / `#btn-toggle-bgm` / `.bgm-preset-btn` | `panel.js:222-252` via `saveBgm():196-220` | `POST /api/bgm` | `server.cjs:704-731` | `state.config.bgm` (correct path) | `alert`s; broadcasts `state` + `bgm` |
| SSE `state` | `panel.js:321-328` → `renderAdminState():254-318` | — | — | — | stat cards, registry table, form prefill |
| SSE `status` | `panel.js:329-335` → `updateConnectionStatus():337-384` | — | — | — | pills, message, dot colour, button enablement |

## 9.3 State management (frontend)

- **No framework, no store.** `renderAdminState` is a full re-render of the stat cards and the registry `<tbody>` on every `state` event (`panel.js:254-318`), plus a form prefill that is skipped while an `INPUT`/`TEXTAREA` has focus (`:295`).
- The registry table is rebuilt with `innerHTML` from donor data (`panel.js:270-280`) — **donor names are attacker-controlled TikTok nicknames** (see audit finding F-05).
- Inputs are seeded from HTML defaults and then overwritten from server state; unsaved operator edits survive only while the field has focus.
- `#cfg-marry-auction`, `#cfg-speech-enabled`, `#cfg-funny-voice`, `#cfg-bgm-playing` are `<select>`s forced to `"true"`/`"false"` strings, then compared with `=== 'true'` in JS.
- No optimistic UI anywhere: the UI only changes when a `state`/`status` broadcast arrives.

## 9.4 Verifiable UI/API contract mismatches

| # | Mismatch | Evidence | Consequence |
|---|---|---|---|
| 1 | Couple save posts `{config:{…}}` but the endpoint merges into `state.config` | `panel.js:120-124` vs `server.cjs:682-686` | groom/bride/title/slogan/date/auction never change; a stray `config.config` key is persisted (already visible in `app/wedding_state.json`) |
| 2 | Goals save posts `{goals:{…}}` | `panel.js:133-140` | `state.goals` never updates |
| 3 | Voice save posts `{config:{…}}` | `panel.js:155-159` | speech/pitch/rate/volume/template never update |
| 4 | Comment simulator posts `type:'comment'` | `panel.js:80` vs `server.cjs:735` | `400`; no guest, no wish, no ceremony |
| 5 | `steal_groom` action has no overlay branch | `panel.js:62` vs `overlay.js:789-798` | headline ceremony button is inert |
| 6 | `updateConnectionStatus` styles a `retry` state | `panel.js:340` | never emitted by the server (states are `offline/connecting/waiting/connected/error`) |
| 7 | `#tab-status-desc` only updates on `status` SSE | `panel.js:361-363` | after a disconnect+refresh it shows the initial HTML text until the next status broadcast |
| 8 | "Test voice" ignores saved config | `panel.js:164-187` | operator hears an unsaved voice |

## 9.5 UI inventory beyond the dashboard

| Surface | Element | Notes |
|---|---|---|
| Live status | `#status`, `#global-status`, `#notice-dot`, `#connection-message` | four separate indicators driven by one function |
| Stat cards | `#card-guests`, `#card-envelopes`, `#card-wishes`, `#card-top-giver` | top giver derived client-side by sorting `scores` |
| Logs / event monitor | **none** | no log viewer, no raw event inspector, no per-event feed |
| Licence settings | **none** | the licence endpoint exists but no UI surfaces it |
| Character settings | only groom/bride/title in `tab-couple` | no sprite/position/scale controls |
| Animation settings | **none** | durations are hard-coded in `overlay.js` |
| Overlay settings | only "copy link" and preview refresh | no resolution/theme/opacity controls |
| Gift settings | only the rose/cake goal targets | `giftSlots` is not editable anywhere |

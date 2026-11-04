# 07 — GIFT SYSTEM

## 7.1 What the gift pipeline actually computes

`processGiftEvent(giftData)` — `server.cjs:240-353`. Input contract (already normalised by the caller):

```js
{ id, name, avatar, gift, giftId, count, diamonds }
```

Steps, in order:

| # | Line | Operation |
|---|---|---|
| 1 | 241 | reject when `id` is missing / `'unknown'` (returns `null`) |
| 2 | 242-245 | `id = 'tik-'+id`, defaults `'Người Tặng'` / `'Mừng Cưới'`; `count = max(1, Number(count)\|\|1)`; `diamonds = max(1, Number(diamonds)\|\|1)` |
| 3 | 246 | `totalCoins = count * diamonds` (**the only "value" concept in the system**) |
| 4 | 248 | `stats.envelopes += count` |
| 5 | 251-253 | if gift **name** matches `/hoa\|rose/i` → `goals.rose.current += count`, capped at `target*2` |
| 6 | 254 | `goals.cake.current += totalCoins*100`, capped at `target*2` |
| 7 | 257-263 | create/update `scores[id]` (**id-keyed**), `total += totalCoins`, refresh `name` |
| 8 | 266-283 | ensure a guest exists (new → random sprite 0-5, `table = floor(len/2)%6`, `seat = len%2`, tag `👑 Đại gia`); existing → tag becomes `👑 Đại gia` |
| 9 | 286-287 | push to `recentGivers`, keep the giver once, cap 8 |
| 10 | 288-306 | **marriage auction** (below) — may rewrite `config.groom` |
| 11 | 308 | `persistState()` |
| 12 | 311-333 | build the `focus` payload and `broadcast('focus', …)` |
| 13 | 334-347 | one follow-up `broadcast('action', …)` at most (else-if chain) |
| 14 | 349 | `broadcast('state', state)` |
| 15 | 350 | return the `focus` payload (used by `/api/demo` to echo `becameGroom`) |

## 7.2 Gift → action mapping (the entire verified table)

| Gift (matched by **name regex only**) | ID used? | Condition | Action broadcast | Animation / effect on overlay | Score effect |
|---|---|---|---|---|---|
| any name matching `/hoa/` or `/rose/` (e.g. `Hoa Hồng`, `Rose`) | **no** | not the auction winner | `petal` | `triggerPetal()`: 45-petal burst, bell sound, banner `🌹 MƯA HOA HỒNG…` | `goals.rose += count`; `scores += count*diamonds` |
| any name matching `/bánh/` or `/cake/` | **no** | not the auction winner | `cake` | `triggerCake()`: fanfare, 16 hearts, `couple-kissing` 3.2 s, banner `🎂 NGHI THỨC CẮT BÁNH…` | `scores` |
| any name matching `/rượu/`, `/champagne/`, `/wine/` | **no** | not the auction winner | `champagne` | `triggerChampagne()`: clink, 16 hearts, banner `🍾 RÓT THÁP SÂM PANH…` | `scores` |
| **any gift at all** with `count*diamonds >= config.minCoinsToMarry` (default 10) | **no** | `config.enableMarryAuction !== false` | `marry` (+ always `focus`) | `triggerMarry()`: crown flash 6 s, name swap, fanfare + bell, forced kiss, 20 hearts | `config.groom = donor name` |
| everything else | **no** | — | nothing | only the red-carpet `focus` ceremony | `stats.envelopes`, `goals.cake`, `scores` |

Reference points in code: rose at `server.cjs:252`; the else-if chain at `:341-347`; the auction at `:288-306`.

### Three end-to-end gift examples (verified paths)

**Example A — "Mừng Phong Bì" ×1 @1 diamond (the 1-coin envelope mapping shown in the UI)**
`gift` does not match any regex, `totalCoins = 1 < 10` → no `action`. `stats.envelopes +1`, `goals.cake += 100`, donor added to `scores` with 1, guest tagged `👑 Đại gia`, `recentGivers` updated, `focus` broadcast → the overlay queues a red-carpet walk, shows the celebration card with a random `config.wishes` line and speaks a random `config.funnyJokes` template.

**Example B — "Hoa Hồng" ×10 @1 diamond**
Rose regex hits → `goals.rose += 10`; `totalCoins = 10 >= 10` → **also becomes groom** → `config.groom` is replaced by the donor's name, `focus` carries `becameGroom: true` and `prayer: "💍 <name> chính thức làm Chú Rể mới!"`, and `action:'marry'` is broadcast. The rose action is **suppressed** because the marry branch is first in the `if` chain (`:334`). Overlay: immediate crown swap + kiss, then ~seconds later the queued `focus` ceremony crowns the same person again.

**Example C — "Nhẫn Kim Cương" ×1 @100 diamonds (the 100-coin demo button)**
`totalCoins = 100` → groom replacement with `previousGroom` captured for the `isRobbed` flag (`:329`) and `text: "🎉 CHÚC MỪNG <name> ĐÃ ĐẮT GIÁ LÀM CHÚ RỂ MỚI! 💕"`. Overlay `triggerMarry` shows `👑 CHÚC MỪNG TÂN LANG: <NAME>` for 7 s and toasts `🎉 BÁO ĐỘNG HỶ SỰ…`.

## 7.3 Gift ID mapping — **does not exist**

`config.giftSlots` is declared in the seed state with five entries and their intended actions:

| id | name | coins | action | prayer | Read by any handler? |
|---|---|---|---|---|---|
| `rose` | Mừng Phong Bì | 1 | `envelope` | Mừng phong bì cưới | **No** |
| `peach` | Mừng Chỉ Vàng | 5 | `gold` | Mừng 1 chỉ vàng | **No** |
| `clarinet` | Góp Vui Nhảy Múa | 10 | `dance` | Góp vui điệu nhảy | **No** |
| `beer` | Đãi Rượu Bàn | 1 | `cheers` | Đãi 1 bàn rượu | **No** |
| `ring` | Làm Chú Rể / Trao Nhẫn | 10 | `ring` | Trao nhẫn cưới | **No** |

Source: `server.cjs:66-72` (and mirrored in `app/wedding_state.json`). `giftSlots` appears **nowhere else** in `server.cjs`, `panel.js` or `overlay.js`. The TikTok `giftId` is parsed (`server.cjs:522`) and then only used to build a fallback display name (`Quà <giftId>`) — it is never mapped, never persisted, and never compared. Therefore:

- the `envelope`, `gold`, `dance`, `cheers`, `ring` **actions declared in config are unreachable via gifts**;
- "Mừng Phong Bì" is described in the UI as an envelope gift (`index.html` gift guide, `overlay.html:129`) but in code it triggers only the generic procession;
- gift identity is whatever free-text name TikFinity sends (`giftDetails.giftName || gift.name || extendedGiftInfo.name || giftName`), so localisation or a TikTok rename silently changes behaviour.

## 7.4 Combo / streak behaviour

| Concern | Implementation |
|---|---|
| Combo counting | Discarded mid-streak: `parseGift` returns `null` while `giftType === 1 && !repeatEnd` (`server.cjs:514`) |
| Final combo | The terminal frame's `repeatCount` becomes `count`, so the score jump is applied once, at full size |
| Incremental UI | None — no combo banner, no per-tick counter |
| Streak dedup | The msgId dedup runs **before** `parseGift` (`:463` vs `:493`), so repeated frames sharing an id are also suppressed |
| Risk | If a streak frame lacks `repeatEnd`, that gift is **never** counted (**UNKNOWN**: depends on TikFinity's payload, not verifiable here) |

## 7.5 Special behaviours

- **Marriage auction ("cướp rể")**: `config.enableMarryAuction` (default on) and `config.minCoinsToMarry` (default 10, `server.cjs:30`) gate it. The donor's **display nickname becomes the groom**, immediately and permanently (persisted), until someone else outbids. `previousGroom` is captured before the swap so the overlay can say who was dethroned. There is no cooldown, no per-user cap, no "only once per session" rule, and no way to restore the original groom from the UI (only editing `config.groom` directly in the JSON, or `/api/reset` which does not restore it either).
- **Joke/template rendering**: `{name}`, `{count}`, `{gift}`, `{groom}`, `{bride}` substituted with `String.replace` (first occurrence only) at `server.cjs:298-304` (marry) and `:309-315` (normal). Template arrays come from `config.funnyJokes` / `config.marryJokes`.
- **Two independent announcement paths** for the same gift: `funnyMessage` (server, random joke) and `thanksTemplate` (client, deterministic template) — the overlay prefers `item.funnyMessage` and only falls back to `thanksTemplate` when absent (`overlay.js:724-733`).
- **Speech**: spoken only if `config.speech !== false` (`overlay.js:735`), using `config.voiceRate`/`voicePitch`/`volume`.
- **Custom gift rules**: none. There is no rule editor, no per-gift amount, no per-gift animation binding, no gift catalogue refresh.

## 7.6 End-to-end gift flow

```mermaid
sequenceDiagram
  autonumber
  participant V as TikTok viewer
  participant TF as TikFinity Desktop
  participant WS as TikFinityClient
  participant GP as processGiftEvent
  participant ST as state / JSON
  participant SSE as SSE broadcast
  participant OV as overlay.js
  participant OBS as OBS Browser Source

  V->>TF: sends gift (e.g. Hoa Hồng x10)
  TF->>WS: {event:"gift", data:{...}}
  WS->>WS: handleMessage: allowlist, msgId dedup
  WS->>WS: parseGift: streak gate, count, diamonds
  WS->>GP: emit('gift', g)
  GP->>ST: envelopes+count, goals, scores, guest, recentGivers
  alt count*diamonds >= minCoinsToMarry
    GP->>ST: config.groom = sender name
    GP->>SSE: focus{becameGroom:true, previousGroom, funnyMessage}
    GP->>SSE: action{action:"marry", text:"🎉 CHÚC MỪNG ..."}
  else name matches /hoa|rose/
    GP->>SSE: focus{...} + action{action:"petal"}
  else otherwise
    GP->>SSE: focus{...}
  end
  GP->>SSE: state (full document)
  SSE->>OV: event: focus / action / state
  OV->>OV: queueOffering(focus) OR triggerMarry/triggerPetal immediately
  OV->>OBS: banner, crown flash, couples kiss, particles, card, speech
  Note over OV,OBS: the DOM overlay is what OBS captures;<br/>OBS receives no data of its own
```

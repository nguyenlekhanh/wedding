# 13 — END-TO-END EVENT TRACING

Five real traces taken from the implementation. Each stage names the file, the function, the data in, the data out, the state change, the condition and the next call. **No step is invented**; where the chain cannot be verified from source it is marked `UNKNOWN`.

Shared preamble for every TikTok-originated trace:

| # | Stage | File / function | Detail |
|---|---|---|---|
| 0 | Viewer acts in TikTok LIVE | external | not observable here (`UNKNOWN`) |
| 1 | TikFinity Desktop receives it | external | requires the operator to have clicked Connect in TikFinity (`UNKNOWN` payload fidelity) |
| 2 | Frame delivered | `server.cjs:430` `ws.addEventListener('message')` | `{data}` string / Blob / Buffer |
| 3 | Decode | `server.cjs:432-436` | `JSON.parse(text)` inside `try{}catch{}` → object or silent drop |
| 4 | Dispatch | `server.cjs:456` `TikFinityClient.handleMessage(msg)` | `n = msg.event`, `r = msg.data` |
| 5 | Room identity | `server.cjs:460` → `roomInfo():377` | may set `hostId`, `roomId` |
| 6 | Allowlist | `server.cjs:461` | must be one of 7 names |
| 7 | Dedup | `server.cjs:463-471` | key `n + '|' + msgId`; skip if present; add + FIFO-cap 5 000 |

---

## TRACE 1 — Gift that wins the marriage auction ("Nhẫn Kim Cương" ×1 @100)

| # | Stage | File / function | Input | Output / state change | Condition | Next |
|---|---|---|---|---|---|---|
| 1 | Frame | `server.cjs:493` | `event:'gift'`, `data:{user:{…}, giftDetails:{giftName:'Nhẫn Kim Cương', diamondCount:100, giftType:0}, repeatCount:1}` | — | passes allowlist + dedup | `parseGift` |
| 2 | Gift parse | `server.cjs:511` `parseGift` | `t = data` | `{id:'tik-<uid>', name:'<nickname>', avatar, gift:'Nhẫn Kim Cương', giftId:'<id>', count:1, diamonds:100}` | `giftType!==1` → no streak gate | `emit('gift')` |
| 3 | Status side-effect | `server.cjs:496` `this.status('connected', …)` | name + gift | `state.status` message "TikFinity đang nhận quà LIVE: …" | always for gifts | SSE `status` |
| 4 | Listener | `server.cjs:583-586` | gift object | — | registered in `connectTikFinity` | `processGiftEvent` |
| 5 | Processor entry | `server.cjs:240-246` | gift object | `id='tik-<uid>'`, `totalCoins = 1*100 = 100` | `id !== 'unknown'` | counters |
| 6 | Counters | `server.cjs:248-254` | count, gift name, coins | `stats.envelopes += 1`; rose goal untouched (name has no `hoa`/`rose`); `goals.cake.current += 100*100 = 10 000` (capped at `target*2`) | always | score |
| 7 | Score | `server.cjs:257-263` | id, name, coins | `scores['tik-<uid>'] = {total: 100, name, avatar}` (created or incremented) | always | roster |
| 8 | Roster | `server.cjs:266-283` | id, name | if new: `people.push({sprite:rand 0-5, table:floor(len/2)%6, seat:len%2, statusTag:'👑 Đại gia'})`, `stats.guests++`; else `statusTag='👑 Đại gia'` | person missing? | registry |
| 9 | Registry | `server.cjs:286-287` | gift record | `recentGivers = [rec, …filter(id≠) ].slice(0,8)` | always | auction |
| 10 | Auction | `server.cjs:288-306` | `minMarry = config.minCoinsToMarry (10)`, `totalCoins = 100` | `becameGroom = true`; `previousGroom = config.groom`; **`config.groom = '<nickname>'`**; `funnyMessage` from a random `config.marryJokes` template | `config.enableMarryAuction !== false && 100 >= 10` | persist |
| 11 | Persist | `server.cjs:308` → `:150` | whole state | `wedding_state.json` rewritten (blocking) | — | broadcast |
| 12 | Focus payload | `server.cjs:311-333` | gift + flags | `{id,name,gift,count:1,diamonds:100,total:100,avatar,prayer:'💍 … làm Chú Rể mới!',becameGroom:true,previousGroom,isRobbed:true,funnyMessage}` → `broadcast('focus')` | always | overlay |
| 13 | Action | `server.cjs:334-340` | becameGroom | `broadcast('action',{action:'marry',initiator:name,previousGroom,text:'🎉 CHÚC MỪNG …'})` | `becameGroom` | overlay |
| 14 | Full state | `server.cjs:349` | whole state | `broadcast('state')` | always | overlay |
| 15 | SSE → overlay | `overlay.js:789-798` | `action:'marry'` | `triggerMarry(initiator, previousGroom, text)` | — | ceremony |
| 16 | Ceremony | `overlay.js:500-518` | new groom, previous | banner `👑 CHÚC MỪNG TÂN LANG: <NAME>` 7 s; `#groom-name` text → new name; `crown-flash` 6 s; `playFanfare()` + `playWeddingBell()`; `triggerKiss()` (4.5 s kiss + banner override); `spawnHearts(20)`; toast | — | speech wait |
| 17 | Focus queued | `overlay.js:800-804` → `queueOffering():649` | focus item | pushed to `offeringQueue`; `processOfferingQueue()` starts if idle | `isOfferingBusy === false` | walk |
| 18 | Walk | `overlay.js:654-712` | item | actor shows `guest_2.png`, badge "Nhẫn Kim Cương ×1", name; `actor.animate` 3.8 s from `(540,1980)` to `(540,1210)`; waits `.finished` | actor node exists | arrival |
| 19 | Arrival | `overlay.js:698-702` | item | bell + `triggerKiss()`; **`if (item.becameGroom) triggerMarry(...)` → a second crown ceremony** | `becameGroom` | card |
| 20 | Card | `overlay.js:704-719` | item, wishes | `#celebration-card.show`, donor name, `Mừng <gift> ×<count>`, random wish; toast | always | speech |
| 21 | Speech | `overlay.js:721-737` → `speakThankYou():191` | `funnyMessage` (preferred) | `speechSynthesis.speak`, vi voice, pitch/rate/volume from config | `config.speech !== false` | return walk |
| 22 | Dwell + return | `overlay.js:739-753` | — | 4.8 s card; 2.8 s reverse walk; hides actor; `isOfferingBusy=false`; next queue item after 400 ms | — | — |
| 23 | OBS | external | painted `#frame` | the crown, banner, kiss and card are visible on stream | Browser Source loaded the overlay | — |

**State changes:** `stats.envelopes`, `goals.cake.current`, `scores`, `people`, `recentGivers`, `config.groom` (persisted). **Conditions of note:** auction enabled and `count*diamonds ≥ 10`. **Verified defect:** stages 13/15 and 17/19 both crown the groom.

---

## TRACE 2 — Small gift below the auction threshold ("Mừng Phong Bì" ×1 @1)

Stages 1-9 identical, with `totalCoins = 1`.

| # | Stage | Detail |
|---|---|---|
| 10 | Auction | `1 >= 10` false → `becameGroom = false`; `funnyMessage` from `config.funnyJokes` (`server.cjs:309-315`) |
| 11 | Persist | full write |
| 12 | Focus | `prayer:'Mừng hạnh phúc trăm năm'`, `becameGroom:false`, `isRobbed:false` |
| 13 | Action | **none** — name matches none of `/hoa|rose/`, `/bánh|cake/`, `/rượu|champagne|wine/` (`:341-347`) |
| 14 | State | broadcast |
| 15-22 | Overlay | identical red-carpet sequence, minus the crown: no `triggerMarry` at arrival (`overlay.js:700`), so the card + thanks speech is the entire visible outcome |
| 23 | OBS | actor walks, card and toast appear, MC voice reads a random joke |

**Confirms:** the gift *name* alone decides ornamentation; the numeric value decides only the auction.

---

## TRACE 3 — Comment containing a keyword ("1 2 3 DZÔ!")

| # | Stage | File / function | Input | Output / state change | Condition | Next |
|---|---|---|---|---|---|---|
| 1 | Frame | `server.cjs:486-492` | `event:'chat'`, `data:{user:{…}, comment:'1 2 3 DZÔ!'}` | — | comment non-empty after `trim`, id known | `emit('chat')` |
| 2 | Processor | `server.cjs:198-238` | `{id,name,avatar,comment}` | person created if new (`table:floor(len/2)%6`), `stats.wishes++` | — | keyword scan |
| 3 | Keyword scan | `server.cjs:224-229` | `comment.toLowerCase()` | `'1 2 3 dzô!'` contains `'dzô'` → `triggeredAction = 'cheers'` | first match wins (`hôn`→kiss, `dzô`→cheers, `nhảy`→dance, `bánh`→cake, `rượu`→champagne, `hoa`→petal) | broadcast |
| 4 | Activity | `server.cjs:230` | — | `broadcast('activity',{type:'chat',id,name,comment,avatar,triggeredAction:'cheers'})` | always | SSE |
| 5 | Action | `server.cjs:231-234` | — | `broadcast('action',{action:'cheers',initiator:name})` | `triggeredAction` truthy | SSE |
| 6 | State + persist | `server.cjs:235-236` | — | broadcast `state`, rewrite JSON | always | — |
| 7 | Overlay activity | `overlay.js:772-785` | activity payload | `showChatBubble(id, comment)` on that guest node (4.2 s, `:520-532`); then `triggerCheers(name)` | `d.type === 'chat'` and matching action | ceremony |
| 8 | Overlay action | `overlay.js:787-798` | `{action:'cheers'}` | `triggerCheers(initiator)` **again** | — | duplicate |
| 9 | Cheers routine | `overlay.js:449-459` | initiator | `playClink()`; every `.wedding-guest` gets `.cheering` for 2 500 ms; banner `🍻 1 2 3 DZÔ!`; toast | guests exist | OBS |

**Verified defect:** one comment runs the cheer routine twice (stages 7 and 8) — two clink sounds and two overlapping `.cheering` timers.

**Unknown:** whether a *new* guest's node exists before the `activity` handler runs. `activity` is broadcast at `:230` **before** `state` at `:235`, and `renderGuests` only runs on `state`, so for a first-time commenter `guestNodes.get(id)` is empty and `showChatBubble` returns silently (`overlay.js:522-523`) — the bubble appears only for guests seen in a prior `state`.

---

## TRACE 4 — Viewer joins

| # | Stage | File / function | Detail |
|---|---|---|---|
| 1 | Frame | `server.cjs:478-485` | `event:'member'` or `'join'`; `parseUser`; `status('connected', '<name> vào phòng')` |
| 2 | Emit | `server.cjs:484` | `emit('join', u)`; dropped if `id === 'unknown'` |
| 3 | Processor | `server.cjs:175-196` | creates `tik-<id>` guest with random sprite, `table:floor(len/2)%6`, `seat:len%2`, tag `✨ Khách quý`; `stats.guests++` |
| 4 | Broadcast | `server.cjs:193-195` | `activity{type:'join',id,name,avatar}` + `state`; persist |
| 5 | Overlay | `overlay.js:758-764` → `renderState` → `renderGuests` | node created, seated on one of 6 tables, badge + status tag; idle sway begins |
| 6 | Overlay activity | `overlay.js:772-776` | `type==='join'` matches nothing — **no join animation, no greeting** |
| 7 | OBS | — | a new guest simply appears at a seat |

**Defect exposure:** the seat collision (F-09) is most visible here — the newcomer lands on a seat already occupied by a seeded guest.

---

## TRACE 5 — Gift below the threshold, name matched ("Hoa Hồng" ×3 @1)

| # | Stage | Detail |
|---|---|---|
| 1-9 | as TRACE 2 | `totalCoins = 3`; `goals.rose.current += 3` (`server.cjs:252`); `stats.envelopes += 3`; `scores += 3` |
| 10 | Auction | `3 >= 10` false |
| 11-12 | Focus + persist | `prayer:'Mừng hạnh phúc trăm năm'` |
| 13 | Action | `/hoa|rose/i.test('Hoa Hồng')` → `broadcast('action',{action:'petal',initiator})` (`:341-342`) |
| 14 | Overlay | `triggerPetal()` (`overlay.js:492-498`): bell sound, `spawnPetalsBurst(45)`, banner `🌹 MƯA HOA HỒNG…`, toast — **immediately**, while the focus item is also queued for the red carpet |
| 15 | OBS | petals burst at once, then seconds later a donor walks up with the card |

**Consequence:** one gift produces an immediate effect and a deferred ceremony, which is intentional in spirit but undocumented and can desynchronise on a busy queue.

---

## TRACE 6 — Manual dashboard action that fails

| # | Stage | File / line | Detail |
|---|---|---|---|
| 1 | Click | `index.html:160` → `panel.js:62` | `sendAction('steal_groom')` |
| 2 | Request | `panel.js:52-58` | `POST /api/action` `{action:'steal_groom'}` |
| 3 | Route | `server.cjs:695-702` | `readJson()` → `broadcast('action', data)` → `200 {ok:true,action}`; **no state change, no persistence** |
| 4 | Overlay | `overlay.js:789-798` | no branch matches `steal_groom` → **nothing happens** |
| 5 | Result | — | silence; `config.groom` unchanged; the button's promise ("soán ngôi làm tân lang mới") is unfulfilled |

This trace exists to document a verified dead path, not a hypothetical one.

---

## TRACE 7 — Leave event (documented dead end)

| # | Stage | File / line | Detail |
|---|---|---|---|
| 1 | Frame | `server.cjs:473-477` | `event ∈ {leave, memberLeave, userLeave}` → `parseUser` → `emit('leave', u)` |
| 2 | Listeners | `server.cjs:571-595` | **none registered for `'leave'`** |
| 3 | Result | — | no state change, no broadcast, guest stays on the roster and on screen for the rest of the session |

---

## Full lifecycle (composite, verified stages only)

```mermaid
sequenceDiagram
  autonumber
  participant TK as TikTok LIVE
  participant TF as TikFinity Desktop
  participant SRV as server.cjs
  participant FS as wedding_state.json
  participant OV as overlay.js
  participant OBS as OBS Browser Source

  TK->>TF: comment / gift / join
  TF->>SRV: WebSocket frame {event,data}
  SRV->>SRV: JSON.parse (silent catch)
  SRV->>SRV: allowlist + msgId dedup
  SRV->>SRV: roomInfo / parseUser / parseGift
  SRV->>SRV: processJoinEvent | processChatEvent | processGiftEvent
  SRV->>FS: persistState() writeFileSync (whole document)
  SRV-->>OV: SSE activity / focus
  SRV-->>OV: SSE action (ceremony)
  SRV-->>OV: SSE state (whole document)
  OV->>OV: renderState / showChatBubble / ceremony / queueOffering
  OV->>OBS: DOM paint (CSS keyframes + WAAPI)
  OBS->>TK: captured into the live stream

  Note over SRV,OV: no acknowledgement path exists;<br/>the overlay never reports success or failure back
```

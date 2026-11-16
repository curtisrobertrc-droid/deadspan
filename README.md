# Deadspan: hold the bridge

A free, fast zombie bridge-runner for **Telegram Mini Apps** that also runs in any mobile browser.
Drag to steer your squad, which fires automatically. Pick the better gate (+N, ×2, −N, ÷2), shoot gates to raise their numbers, smash crates for weapons (SMG, shotgun, railgun), set off barrels, and survive scaling hordes. There's a boss on every 5th level.

**Play:** https://curtisrobertrc-droid.github.io/deadspan/

Part of **Deadspan Arcade**, a separate brand for a small family of simple, addictive Telegram games.

## Features (v0.1.0)
- Plain HTML5 canvas, with no framework and no build step. All sprites are drawn in code and all sound is synthesised (Web Audio), so there are no third-party assets.
- Juicy feedback: screen shake, number pops, particles, hit flashes, Telegram haptics, and quick retry.
- Progression: level saved to localStorage and mirrored to **Telegram CloudStorage** inside Telegram.
- Soft currency (coins) and an upgrade shop (fire rate, damage, starting squad).
- 7-day daily-reward streak.
- Monetisation hooks, **disabled until configured** in `js/config.js`:
  - Rewarded ads via **AdsGram** (double coins, revive once per run, double daily reward). Set `ADSGRAM_BLOCK_ID`.
  - **Telegram Stars** fixed-content coin packs (no random rewards). Set `BACKEND_URL` once `backend/worker.js` is deployed.
- Referral: invite button builds a `t.me/<bot>?startapp=ref_<id>` link, and new players arriving through one get a coin bonus.
- Dev flags: `?devads=1` simulates rewarded ads in a browser; `?bot=1` autoplays (for screenshots and X/TikTok clips).

More from Deadspan Arcade: [Deadspan: Outpost](https://curtisrobertrc-droid.github.io/deadspan-outpost/), a merge tower defence.

## v0.2.0
- **Endless mode** (∞ on the menu): waves never stop, difficulty climbs 0.6 levels per wave, squad capped at 150, run ends on death.
  Separate best (waves + distance), separate leaderboard (`mode: 'endless'` on the Worker's /score and /lb, no weekly prizes).
  Coins are halved per kill, +3 per wave, capped per run (80 + 22 × campaign level) and at 3 runs' worth per day.
- **Final-wave sprint**: no gates or pickups after a level's last wave; once it's down the squad auto-runs to the line at up to 2.8× speed with no damage.
- **Crisp text** on 3× phones: lighter text shadows, no group-opacity dimming on pass rows, no looping filter animation in panels, canvas up to DPR 3 (drops to 2 if the phone can't hold 40 fps).

## Layout
```
index.html, style.css      game shell + UI
js/game.js                 engine: level gen, combat, perspective sprite renderer
js/assets.js               sprite loader (WebP, pre-scaled mips, hit-flash silhouettes, fallback)
assets/img/                v2 art (AI-generated, original; ~230 KB total)
js/main.js                 UI, save, shop, daily, results
js/platform.js             Telegram WebApp SDK wrapper + storage + haptics
js/ads.js                  AdsGram rewarded ads (off until blockId set)
js/payments.js             Telegram Stars client (off until backend set)
js/audio.js                Web Audio synth SFX
backend/                   Cloudflare Worker: bot webhook, Stars invoices (not deployed yet)
docs/AUTOMATION-PLAN.md    how the business runs with minimal owner time
privacy.html, credits.html
```

## Compliance notes (UK)
- No crypto token and no token promotion in this game.
- No paid random rewards (no loot boxes) and no paid-entry prize contests.
- Stars products are fixed amounts of soft currency, which can't be withdrawn or traded.

## Run locally
`python3 -m http.server 8000` then open http://localhost:8000/

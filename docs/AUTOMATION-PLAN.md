# Deadspan Arcade: automation plan

Goal: a family of simple, addictive Telegram Mini App games that earn from **rewarded ads (AdsGram)** and **Telegram Stars**. It should run on free hosting and need as little of the owner's (Rob's) time as possible. Fun comes first. There's **no token at launch**. A token or tradable items are only considered once retention is proven (D1 ≥ 35%, D30 ≥ 5%) and after UK legal advice.

---

## 0. What's already done (no action needed)
| Item | Status |
|---|---|
| Game #1 "Deadspan" (zombie bridge runner) | Live on GitHub Pages |
| Telegram SDK (ready, expand, theme colours, haptics, user id, CloudStorage) | Built in |
| AdsGram rewarded-ad code | Built, **off** until a blockId is pasted into `js/config.js` |
| Telegram Stars client + Cloudflare Worker backend | Written and initData check unit-tested, **not deployed** |
| Referral link + new-player bonus | Built (inviter reward needs the backend) |
| Bot profile picture and Mini App cover image | `assets/telegram/botpic-640.png`, `assets/telegram/miniapp-photo-640x360.png` |
| Privacy policy | `privacy.html` |

---

## 1. Rob: create the bot (about 2 minutes, on your phone)
Only Rob can do this, because the bot belongs to his Telegram account.

1. In Telegram, open **@BotFather** and tap **Start**.
2. Send `/newbot`.
3. Name: `Deadspan`
4. Username (must end in `bot`): try `DeadspanGameBot`. If it's taken, try `DeadspanArcadeBot` or `PlayDeadspanBot`.
5. BotFather replies with a **token** (looks like `123456789:AA...`). **Keep it private.** Only paste it where step 3 below says (the Cloudflare secret). Don't post it in chats or on GitHub.
6. Turn the game on as the bot's **Main Mini App**: send `/mybots` → pick the bot → **Bot Settings** → **Configure Mini App** → **Enable Mini App** → send the URL `https://curtisrobertrc-droid.github.io/deadspan/`
   (This adds a **Play** button on the bot's profile and lets people open `t.me/<bot>?startapp`.)
7. Menu button: `/mybots` → bot → **Bot Settings** → **Menu Button** → URL `https://curtisrobertrc-droid.github.io/deadspan/`, text `Play`.
8. Text and picture (copy and paste):
   - `/setdescription` → `🧟 The horde is on the bridge. Grow your squad through the gates, grab weapons, beat the boss every 5 levels. Free, instant, no sign-up. Tap PLAY.`
   - `/setabouttext` → `Zombie bridge-runner. Free to play. Hold the line!`
   - `/setuserpic` → send `assets/telegram/botpic-640.png` (we'll send it to you).
9. Optional, for a `t.me/<bot>/play` direct link: `/newapp` → pick bot → title `Deadspan` → short description → photo `miniapp-photo-640x360.png` → GIF: `/empty` → URL as above → short name `play`.

Then send us **the bot username**. Don't send the token in chat; you'll paste that straight into Cloudflare in step 3.

## 2. Rob: AdsGram signup (about 5 minutes, once the bot exists)
AdsGram is the main ad network for Telegram Mini Apps and pays out in USDT (on TON).
1. Go to https://partner.adsgram.ai and sign in with Telegram.
2. **Add platform**: name `Deadspan`, Mini App URL `https://t.me/<botusername>` (or the app URL), category Games.
3. Wait for moderation (usually a few days). Then create an ad block: format **Rewarded**, name `deadspan-rewarded`.
4. Copy the **blockId** (a number) and send it to us. We put it in `ADSGRAM_BLOCK_ID`, test with `ADSGRAM_DEBUG: true` first, then go live.
5. Payouts need a TON wallet address (for example Telegram's built-in Wallet). Rob adds it in the AdsGram dashboard himself. **Tax:** ad income is trading income, so keep the AdsGram monthly statements. It's separate from MTP and Brick & Budget.

## 3. Free bot backend: Cloudflare Workers (needed for Stars, /start replies and referral rewards)
Free tier: 100k requests/day and a free D1 database, with no card needed. **Exact current steps: [LEADERBOARDS.md](LEADERBOARDS.md)** (leaderboards, weekly rewards and Stars cosmetics).
1. Rob creates a free Cloudflare account (or uses an existing one) and stays signed in on the bot's computer. We do the rest:
2. `npx wrangler d1 create deadspan-arcade` → paste the id into `backend/wrangler.toml`, then `npx wrangler d1 execute deadspan-arcade --remote --file=schema.sql`.
3. `npx wrangler secret put BOT_TOKEN` (**Rob pastes the token here himself**) and `npx wrangler secret put WEBHOOK_SECRET` (random string).
4. `npx wrangler deploy` → gives `https://deadspan-bot.<sub>.workers.dev`.
5. Register the webhook once (Rob can paste this URL into a browser, or we run it with the token from step 3):
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://deadspan-bot.<sub>.workers.dev/webhook&secret_token=<WEBHOOK_SECRET>&allowed_updates=["message","pre_checkout_query"]`
6. Set `BACKEND_URL` in `js/config.js` and push. The Stars shop goes live:
   - Mini App → `POST /invoice` → Worker calls `createInvoiceLink` (currency `XTR`, empty `provider_token`) → `Telegram.WebApp.openInvoice`.
   - Webhook answers `pre_checkout_query`, stores `successful_payment` in D1 (cosmetics / premium pass only), and the game claims it via `POST /claim`.
   - All requests verify Telegram `initData` (HMAC). Charge ids are kept for refunds (`refundStarPayment`).
   - Telegram requires a `/paysupport` command for Stars bots, and the Worker answers it.
7. Stars → money: Stars accumulate in the bot's balance and can be withdrawn through Fragment (as TON) after Telegram's hold period, or spent on Telegram Ads to promote the bot. Rob does any withdrawal himself.

## 4. Automated growth (we run these, at £0)
| Channel | How it's automated | Rob's input |
|---|---|---|
| **Telegram channel** `@DeadspanArcade` | Rob creates a public channel (1 min) and adds the bot as admin. A scheduled routine then posts a daily "Level of the day" challenge, a weekly leaderboard image, and update notes via `sendPhoto` / `sendMessage` with a Play button. | Create channel, add bot as admin |
| **In-game referral** | `t.me/<bot>?startapp=ref_<id>`: the new player gets +300 coins now. When the backend is live, inviter and friend appear on each other's Friends leaderboard. | None |
| **Share card** | After a big win, offer "Share" → Telegram share sheet with a challenge message. | None |
| **Short clips (X, TikTok, Shorts)** | `?bot=1` autoplay plus headless Chromium recording on the box produces 10 to 20 s vertical clips ("can you pick the right gate?"). These are posted from a **new Deadspan X account** (not @Nufc_fnd). | Create the X/TikTok accounts if wanted (optional) |
| **Mini App catalogues** | Submit to Telegram's Apps Center (@tapps_bot / tApps Center) and FindMini.app once the bot is live. | Possibly confirm a submission as the bot owner |
| **Cross-promo** | Each new Deadspan Arcade game links the others on its menu and result screens. | None |

Nothing is posted on @Nufc_fnd, MTP or Brick & Budget channels.

## 5. Measuring retention before any token talk
- Phase 1: count opens and level-ups per user in the Worker D1 database. No third-party analytics, which keeps the privacy policy simple.
- Weekly routine posts D1, D7, D30, ad views and Stars revenue to Rob.
- **Gate for token/NFT discussion:** D1 ≥ 35%, D30 ≥ 5%, ≥ 10k monthly players, plus UK legal advice (FCA financial promotions regime). Until then: ads and Stars only.

## 6. Shipping pipeline: games #2 and #3 on the same shell
Shared pieces to lift into `/shared` when game #2 starts: `platform.js` (Telegram, storage, haptics), `ads.js`, `payments.js`, `audio.js`, the menu, shop, daily and result UI, the backend Worker (add a `game` field to payloads), and the autoplay/screenshot harness.

| # | Working title | Core loop | Reuse |
|---|---|---|---|
| 2 | **Deadspan: Outpost** (merge tower defence). **LIVE:** https://curtisrobertrc-droid.github.io/deadspan-outpost/ (renamed from "Last Outpost", which is an existing Steam zombie TD by Troyd Games) | Zombies walk a fixed lane toward your outpost. Tap to place and merge turrets (gun → MG → flamer). Every wave there's a choice of 3 perks. Boss every 5 waves. | Sprites (zombies, boss), particles and pops, shop, daily, ads, Stars, backend |
| 3 | **Deadspan: Survivor Merge** (merge/multiplier survival) | Merge survivors 2→1 to level them, they auto-fight nightly hordes, and multiplier tiles (×2 squad) appear between nights. Idle earnings while offline (cap 8 h, ×2 with a rewarded ad). | Engine loop, gates/multiplier logic, save, ads, Stars |

Per-game checklist (about 1 to 2 days each, by the bot):
1. Fork the shell into a new repo (`deadspan-outpost`, `deadspan-merge`) and enable Pages.
2. Build the core loop. Balance it with a headless autoplay simulation (as done for #1: levels 1 to 20 beatable with upgrades, first real wall around level 20).
3. Screenshots and clips, then the privacy page.
4. Rob does `/newapp` on the **same bot** (adds a second Mini App with short name `outpost`/`merge`), or the games are linked from the main menu. No new bot needed.
5. Add an AdsGram block per game in the same AdsGram account.

## 7. What's stubbed in v0.1.0
- Rewarded ads: real AdsGram code, but `ADSGRAM_BLOCK_ID` is empty, so ad buttons are hidden (use `?devads=1` to preview).
- Stars shop: client and Worker written. Buttons show "opens soon" until `BACKEND_URL` is set.
- Inviter referral reward and stats: need the Worker.
- Leaderboards: built (Worker + D1), off until deployed; see LEADERBOARDS.md.

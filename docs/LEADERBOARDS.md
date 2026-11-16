# Leaderboards, weekly rewards and Stars cosmetics: backend deploy

One free Cloudflare Worker (`backend/worker.js`) plus one free D1 database serve **both** games (Deadspan and Deadspan: Outpost run on the same Telegram bot).
Until it's deployed, both games already work offline: personal bests (today / this week / all-time) and a "global leaderboards coming soon" note. Nothing breaks if the backend is down.

## What it does
| Endpoint | Purpose |
|---|---|
| `POST /score` | Records a finished run (levels/nights cleared × 10,000 + run points). Keeps the best per day, ISO week and all-time. |
| `POST /lb` | Top 50 plus your own rank, for **Today / This week / All-time / Friends**. |
| `POST /rewards` | Pays last week's prizes once: **#1** 15,000 coins (same as the 120⭐ coin pack) + Gold frame + "Weekly Champion" title · **#2–3** 5,000 coins (same as the 50⭐ pack) + Silver · **#4–10** 1,500 + Bronze · **top 100** 500 coins + Top 100 frame. In-game only. No cash, crypto or anything tradeable. |
| `POST /invoice`, `/claim`, `/webhook` | Telegram Stars: premium season pass (150⭐) and Gold bundle (100⭐) per game. **Cosmetic only.** Upgrades are coin-earned and capped, so Stars buy no power. |

Friends: a player who first arrives through someone's invite link (`?startapp=ref_<id>`) becomes friends with the inviter, in both games.

Safety and anti-cheat: every request checks Telegram's signed `initData` (HMAC with the bot token, max age 24h). Other checks:
- At most 1 score per 8 s per player.
- A score must match its level.
- Level can rise by at most 3 above the player's best known to the server.
- A win needs at least 12 s.
- Weekly badges are only shown for players the server actually awarded.
- Stars webhook retries can't double-deliver (keyed by charge id).

These are sanity checks. A determined cheater with a modified client can still post plausible scores, so keep an eye on the top of the board. To remove someone: `npx wrangler d1 execute deadspan-arcade --remote --command "DELETE FROM scores WHERE uid='<id>'"`.

Free-tier fit: D1 free tier is 5M row reads/day, 100k writes/day and 5 GB. A daily cron prunes old daily/weekly rows.

## Deploy (about 15 minutes, once)
Steps 1 and 4 are Rob's. Everything else we can run once Rob is signed in to Cloudflare on the machine.
1. **Rob:** create a free Cloudflare account at https://dash.cloudflare.com/sign-up (no card needed, and don't pick any paid plan). Then in a terminal in `deadspan/backend/` run `npx wrangler login` and approve in the browser.
2. Create the database:
   `npx wrangler d1 create deadspan-arcade`
   Copy the `database_id` it prints into `backend/wrangler.toml` (replace `REPLACE_WITH_D1_ID`).
3. Create the tables:
   `npx wrangler d1 execute deadspan-arcade --remote --file=schema.sql`
4. **Rob** sets the secrets himself, so the token never leaves his hands:
   `npx wrangler secret put BOT_TOKEN` (paste the @BotFather token)
   `npx wrangler secret put WEBHOOK_SECRET` (any long random string)
5. Deploy:
   `npx wrangler deploy`
   This prints `https://deadspan-bot.<your-subdomain>.workers.dev` and also installs the daily cron (00:05 UTC), which freezes last week's prizes on Mondays.
6. Point the bot at it. Open this once in a browser, with the real token and secret:
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://deadspan-bot.<sub>.workers.dev/webhook&secret_token=<WEBHOOK_SECRET>&allowed_updates=["message","pre_checkout_query"]`
7. Quick check: `curl -X POST https://deadspan-bot.<sub>.workers.dev/lb -d '{}'` should answer `{"error":"unauthorized"}`. That means it's running and rejects unsigned requests.
8. Switch the games on. In **both** `deadspan/js/config.js` and `outpost/js/config.js`, set:
   `BACKEND_URL: 'https://deadspan-bot.<sub>.workers.dev'` and `LEADERBOARDS: true`
   Then commit and push. The Ranks tab goes online, and the Stars shop rows can be bought.

Rollback: set `LEADERBOARDS: false` and push. The games return to offline personal bests. Saves are never stored on the server.

## Optional extras
- The premium pass note switches from "coming soon" automatically once LEADERBOARDS/BACKEND_URL are set; the track unlocks when a `ds_pass`/`op_pass` purchase is claimed.
- Post a weekly leaderboard image to a Telegram channel: a later step, using the same Worker (`sendPhoto`).

## Local test (no account needed)
`cd backend && npx wrangler d1 execute deadspan-arcade --local --file=schema.sql && npx wrangler dev --local`, with a `.dev.vars` file containing `BOT_TOKEN=123:TEST` and `WEBHOOK_SECRET=x`. `lbtest.js` in the workspace drives both games against it with a fake signed Telegram user.

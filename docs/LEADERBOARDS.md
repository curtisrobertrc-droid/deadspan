# Leaderboards, weekly rewards and Stars cosmetics: backend deploy

One free Cloudflare Worker (`backend/worker.js`) plus one free D1 database serve **both** games (Deadspan and Deadspan: Outpost run on the same Telegram bot).
Until `LEADERBOARDS` is switched on, both games already work offline: personal bests (today / this week / all-time) and a "global leaderboards coming soon" note. Nothing breaks if the backend is down.

**Live Worker (deployed):** `https://deadspan-bot.curtis-robert-rc.workers.dev`  
**Worker name:** `deadspan-bot`  
**D1 database:** `deadspan-arcade` (`0d096ccc-93f9-4a7e-bfdb-a135540bef82`)  
**Health:** `GET https://deadspan-bot.curtis-robert-rc.workers.dev/health` — returns `{ok, service, botTokenConfigured, db}` and works before `BOT_TOKEN` is set.

`BACKEND_URL` is already set in both games. `LEADERBOARDS` stays `false` until Rob adds the `BOT_TOKEN` secret below. Score and leaderboard routes reject unsigned requests (`{"error":"unauthorized"}`) and need that token to validate Telegram `initData`.

## What it does
| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness: Worker + D1 are up. Does not need `BOT_TOKEN`. |
| `POST /score` | Records a finished run (levels/nights cleared × 10,000 + run points). Keeps the best per day, ISO week and all-time. |
| `POST /lb` | Top 50 plus your own rank, for **Today / This week / All-time / Friends**. Requires valid Telegram `initData` (not a public unauthenticated read). |
| `POST /ref` | Invite rewards. Stores referrer→invitee once per invitee. After the invitee finishes level/night 1, both players get **500 coins** (once). The client applies `bonus` (invitee) and `claim` (inviter). Coins only, no cash. |
| `POST /shareprep` | Optional prepared Telegram message id for `Telegram.WebApp.shareMessage`. Needs `BOT_TOKEN`; the client falls back to `t.me/share` if this fails. |
| `POST /rewards` | Pays last week's prizes once: **#1** 15,000 coins (same as the 120⭐ coin pack) + Gold frame + "Weekly Champion" title · **#2–3** 5,000 coins (same as the 50⭐ pack) + Silver · **#4–10** 1,500 + Bronze · **top 100** 500 coins + Top 100 frame. In-game only. No cash, crypto or anything tradeable. |
| `POST /invoice`, `/claim`, `/webhook` | Telegram Stars: premium season pass (150⭐) and Gold bundle (100⭐) per game. **Cosmetic only.** Upgrades are coin-earned and capped, so Stars buy no power. |

Friends and invites: a player who first arrives through someone's invite link (`https://t.me/DeadspanGameBot?startapp=ref_<id>`) is stored as their invitee (once) and becomes friends with the inviter, in both games. The share button and Invite panel work before leaderboards are on; coin rewards stay queued until `LEADERBOARDS` is enabled and `BOT_TOKEN` is set.

Safety and anti-cheat: every request checks Telegram's signed `initData` (HMAC with the bot token, max age 24h). Other checks:
- At most 1 score per 8 s per player.
- A score must match its level.
- Level can rise by at most 3 above the player's best known to the server.
- A win needs at least 12 s.
- Weekly badges are only shown for players the server actually awarded.
- Stars webhook retries can't double-deliver (keyed by charge id).

These are sanity checks. A determined cheater with a modified client can still post plausible scores, so keep an eye on the top of the board. To remove someone: `npx wrangler d1 execute deadspan-arcade --remote --command "DELETE FROM scores WHERE uid='<id>'"`.

Free-tier fit: D1 free tier is 5M row reads/day, 100k writes/day and 5 GB. A daily cron prunes old daily/weekly rows.

## Remaining steps (Rob, then we finish)

The Worker, D1 database, schema, and `WEBHOOK_SECRET` are already in place. Do **not** paste the BotFather token into chat.

### 1. Rob: add `BOT_TOKEN` as a Worker secret
1. Open the Cloudflare dashboard: https://dash.cloudflare.com/a8713fc89f7eaa2a760c9772f346f1d8
2. Go to **Workers & Pages** → **deadspan-bot** → **Settings** → **Variables and Secrets**.
3. Click **Add** → choose **Secret**.
4. Name: `BOT_TOKEN` (exactly).
5. Value: paste the token you got from @BotFather (the full `number:secret` string). Save.

Do not change or delete the existing `WEBHOOK_SECRET` secret. We already set that.

When this is done, `GET https://deadspan-bot.curtis-robert-rc.workers.dev/health` will show `"botTokenConfigured": true`.

### 2. After `BOT_TOKEN` is set, we will attach the bot webhook
We'll run this once (token and webhook secret stay off the record — not in this doc or in chat):

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://deadspan-bot.curtis-robert-rc.workers.dev/webhook&secret_token=<WEBHOOK_SECRET>&allowed_updates=["message","pre_checkout_query"]
```

That makes `/start` reply with a Play button, and lets Stars pre-checkout and payment updates reach the Worker.

### 3. Then we will switch the games on
In **both** `deadspan/js/config.js` and `outpost/js/config.js`, set `LEADERBOARDS: true`, commit and push. The Ranks tab goes online, and the Stars shop rows can be bought.

Rollback: set `LEADERBOARDS: false` and push. The games return to offline personal bests. Saves are never stored on the server.

## Already done
- D1 `deadspan-arcade` created and `schema.sql` applied remotely.
- Worker `deadspan-bot` deployed to `https://deadspan-bot.curtis-robert-rc.workers.dev` (cron `5 0 * * *` installed).
- `WEBHOOK_SECRET` set on the Worker (name only in git; value is not in this repo).
- Both games point `BACKEND_URL` at the Worker, with `LEADERBOARDS: false` until step 3.

## Optional extras
- The premium pass note switches from "coming soon" automatically once LEADERBOARDS/BACKEND_URL are set; the track unlocks when a `ds_pass`/`op_pass` purchase is claimed.
- Post a weekly leaderboard image to a Telegram channel: a later step, using the same Worker (`sendPhoto`).

## Local test (no account needed)
`cd backend && npx wrangler d1 execute deadspan-arcade --local --file=schema.sql && npx wrangler dev --local`, with a `.dev.vars` file containing `BOT_TOKEN=123:TEST` and `WEBHOOK_SECRET=x`. `lbtest.js` in the workspace drives both games against it with a fake signed Telegram user.

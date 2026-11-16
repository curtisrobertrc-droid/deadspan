# Leaderboards, weekly rewards and Stars cosmetics: backend deploy

One free Cloudflare Worker (`backend/worker.js`) plus one free D1 database serve **both** games (Deadspan and Deadspan: Outpost run on the same Telegram bot).
Leaderboards are **on** in Telegram (`LEADERBOARDS: true`). In a normal browser the Ranks tab still shows personal bests and points players to open the game from @DeadspanGameBot. Nothing breaks if the backend is down: scores stay on the device.

**Live Worker (deployed):** `https://deadspan-bot.curtis-robert-rc.workers.dev`  
**Worker name:** `deadspan-bot`  
**D1 database:** `deadspan-arcade` (`0d096ccc-93f9-4a7e-bfdb-a135540bef82`)  
**Health:** `GET https://deadspan-bot.curtis-robert-rc.workers.dev/health` — returns `{ok, service, botTokenConfigured, db}` and works before `BOT_TOKEN` is set.

`BACKEND_URL` is set in both games and `LEADERBOARDS` is `true`. Score and leaderboard routes reject unsigned requests (`{"error":"unauthorized"}`) and validate Telegram `initData` with `BOT_TOKEN`.

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
| `POST /admin/setup` | Sets the Telegram webhook and the chat menu Play button. Requires header `X-Admin-Secret` equal to `WEBHOOK_SECRET`. Returns sanitized webhook info (never the token). |

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

## Status

Done:
- D1 `deadspan-arcade` created and `schema.sql` (plus the invites migration) applied remotely.
- Worker `deadspan-bot` deployed to `https://deadspan-bot.curtis-robert-rc.workers.dev` (cron `5 0 * * *` installed).
- `WEBHOOK_SECRET` and `BOT_TOKEN` set on the Worker (values are not in this repo or in chat).
- Webhook and chat menu Play button attached via `POST /admin/setup` (header `X-Admin-Secret` must match `WEBHOOK_SECRET`).
- Both games point `BACKEND_URL` at the Worker, with `LEADERBOARDS: true`.

Rollback: set `LEADERBOARDS: false` and push. The games return to offline personal bests. Saves are never stored on the server.

To re-run setup after a domain or secret change (do not paste secrets into chat): `POST https://deadspan-bot.curtis-robert-rc.workers.dev/admin/setup` with header `X-Admin-Secret: <WEBHOOK_SECRET>`.

## Optional extras
- The premium pass note switches from "coming soon" automatically once LEADERBOARDS/BACKEND_URL are set; the track unlocks when a `ds_pass`/`op_pass` purchase is claimed.
- Post a weekly leaderboard image to a Telegram channel: a later step, using the same Worker (`sendPhoto`).

## Local test (no account needed)
`cd backend && npx wrangler d1 execute deadspan-arcade --local --file=schema.sql && npx wrangler dev --local`, with a `.dev.vars` file containing `BOT_TOKEN=123:TEST` and `WEBHOOK_SECRET=x`. `lbtest.js` in the workspace drives both games against it with a fake signed Telegram user.

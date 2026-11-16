// Deadspan Arcade backend: one Cloudflare Worker (free tier) for BOTH games (Deadspan + Deadspan: Outpost).
// NOT DEPLOYED. Deploy steps: docs/LEADERBOARDS.md.
//   POST /webhook   Telegram updates: /start (Play button), /paysupport, Stars pre-checkout + successful_payment
//   POST /invoice   {sku, initData}            -> {link}  Telegram Stars invoice (cosmetics / premium pass only)
//   POST /claim     {initData, game}           -> {items:[], premium}  undelivered purchases for this game
//   POST /score     {initData, game, level, score, kills, win, dur, cos:{frame,title}, ref}  -> {ok}
//   POST /lb        {initData, game, board: day|week|all|friends} -> {top:[{name,score,frame,title,me}], me:{rank,score}}
//   POST /rewards   {initData, game}           -> {rewards:[{week,rank,coins,badges}]}  last week's prizes, once
// Bindings: BOT_TOKEN (secret), WEBHOOK_SECRET (secret), GAME_URL (var), DB (D1 database, schema.sql)
// Rewards are in-game coins and cosmetic badges only. No cash, crypto or anything transferable.

// Stars buy cosmetics or the premium pass track only: nothing here changes gameplay power.
const PRODUCTS = {
  ds_pass: { game: 'deadspan', title: 'Premium season pass', description: "Unlocks this month's premium cosmetic track in Deadspan.", stars: 150, premium: true },
  ds_gold: { game: 'deadspan', title: 'Gold Squad bundle', description: 'Solid Gold uniform + Solar muzzle flash + Rainbow tracers (cosmetic only).', stars: 100, items: ['sk_gold', 'fl_solar', 'tr_rainbow'] },
  op_pass: { game: 'outpost', title: 'Premium season pass', description: "Unlocks this month's premium cosmetic track in Deadspan: Outpost.", stars: 150, premium: true },
  op_gold: { game: 'outpost', title: 'Gold Outpost bundle', description: 'Gold Plated turrets + Gold Bars wall + Rainbow tracers (cosmetic only).', stars: 100, items: ['tu_gold', 'wl_gold', 'tr_rainbow'] },
};
const GAMES = ['deadspan', 'outpost'];
// Weekly prizes (ISO week, UTC): in-game coin bundles sized like the Stars coin packs + exclusive badges. Badge ids must exist in both games' js/catalog.js.
const PRIZES = [
  { upTo: 1, coins: 15000, badges: ['badge_gold', 'ti_champ'] },  // = the old 120-Star coin pack
  { upTo: 3, coins: 5000, badges: ['badge_silver'] },              // = the old 50-Star coin pack
  { upTo: 10, coins: 1500, badges: ['badge_bronze'] },
  { upTo: 100, coins: 500, badges: ['badge_top100'] },
];
const BADGES = new Set(PRIZES.flatMap(p => p.badges));
const MAX_LEVEL = 1000, LEVEL_JUMP = 3, MIN_GAP_MS = 8000, MIN_WIN_SECS = 12, TOP_N = 50;

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });
const pad = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
function weekKey(d = new Date()) { // ISO week, UTC; identical to js/meta.js
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() + '-W' + pad(Math.ceil(((t - y0) / 864e5 + 1) / 7));
}
const lastWeekKey = () => weekKey(new Date(Date.now() - 7 * 864e5));
const cleanName = u => (String(u.username || [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Player').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) || 'Player');
const cid = v => (typeof v === 'string' && /^[a-z0-9_]{1,24}$/.test(v) ? v : null);

async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? new TextEncoder().encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
// Validates Mini App initData per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verifyInitData(env, initData) {
  const p = new URLSearchParams(initData); const hash = p.get('hash'); if (!hash) return null; p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac('WebAppData', env.BOT_TOKEN);
  if (hex(await hmac(secret, dcs)) !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 86400) return null;
  try { const u = JSON.parse(p.get('user')); return u && u.id ? u : null; } catch { return null; }
}

// ---- leaderboards ----
async function submitScore(env, user, b) {
  const game = b.game, uid = String(user.id), now = Date.now();
  const level = Math.floor(Number(b.level)), score = Math.floor(Number(b.score));
  // sanity checks (a modified client can still lie within these bounds; see docs/LEADERBOARDS.md)
  if (!(level >= 1 && level <= MAX_LEVEL)) return { error: 'bad_level' };
  if (!(score >= level * 10000 && score < (level + 1) * 10000)) return { error: 'bad_score' };
  if (b.win && !(Number(b.dur) >= MIN_WIN_SECS)) return { error: 'too_fast' };
  const u = await env.DB.prepare('SELECT best_level, last_at FROM users WHERE game=? AND uid=?').bind(game, uid).first();
  if (u && now - u.last_at < MIN_GAP_MS) return { error: 'rate_limited' };
  if (u && u.best_level > 0 && level > u.best_level + LEVEL_JUMP) return { error: 'level_jump' };
  const name = cleanName(user); let frame = cid(b.cos && b.cos.frame), title = cid(b.cos && b.cos.title);
  // weekly badges can only be shown by players the server actually awarded them to
  if (BADGES.has(frame) || BADGES.has(title)) {
    const won = new Set((await env.DB.prepare('SELECT badges FROM rewards WHERE uid=?').bind(uid).all()).results.flatMap(r => JSON.parse(r.badges || '[]')));
    if (BADGES.has(frame) && !won.has(frame)) frame = null; if (BADGES.has(title) && !won.has(title)) title = null;
  }
  const keep = 'ON CONFLICT(game, period, pkey, uid) DO UPDATE SET score=MAX(score, excluded.score), level=MAX(level, excluded.level), name=excluded.name, frame=excluded.frame, title=excluded.title, at=excluded.at';
  const ins = (period, pkey) => env.DB.prepare(`INSERT INTO scores (game, period, pkey, uid, score, level, name, frame, title, at) VALUES (?,?,?,?,?,?,?,?,?,?) ${keep}`).bind(game, period, pkey, uid, score, level, name, frame, title, now);
  const stmts = [
    env.DB.prepare('INSERT INTO users (game, uid, best_level, last_at) VALUES (?,?,?,?) ON CONFLICT(game, uid) DO UPDATE SET best_level=MAX(best_level, excluded.best_level), last_at=excluded.last_at').bind(game, uid, level, now),
    ins('day', dayKey()), ins('week', weekKey()), ins('all', 'all'),
  ];
  // friends: first score from a player who arrived via ref_<inviterId> links the two (both games)
  const ref = /^\d{1,15}$/.test(String(b.ref || '')) ? String(b.ref) : null;
  if (ref && ref !== uid && !u) for (const [a, c] of [[uid, ref], [ref, uid]]) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO friends (a, b) VALUES (?,?)').bind(a, c));
  await env.DB.batch(stmts);
  return { ok: true };
}

async function board(env, user, game, which) {
  const uid = String(user.id);
  const [period, pkey] = which === 'day' ? ['day', dayKey()] : which === 'week' ? ['week', weekKey()] : ['all', 'all'];
  let rows, me;
  if (which === 'friends') {
    rows = (await env.DB.prepare(`SELECT uid, name, score, frame, title FROM scores WHERE game=? AND period='all' AND pkey='all' AND (uid=? OR uid IN (SELECT b FROM friends WHERE a=?)) ORDER BY score DESC, at ASC LIMIT ?`).bind(game, uid, uid, TOP_N).all()).results;
    const i = rows.findIndex(r => r.uid === uid); me = i >= 0 ? { rank: i + 1, score: rows[i].score } : null;
  } else {
    rows = (await env.DB.prepare('SELECT uid, name, score, frame, title FROM scores WHERE game=? AND period=? AND pkey=? ORDER BY score DESC, at ASC LIMIT ?').bind(game, period, pkey, TOP_N).all()).results;
    const mine = await env.DB.prepare('SELECT score, at FROM scores WHERE game=? AND period=? AND pkey=? AND uid=?').bind(game, period, pkey, uid).first();
    if (mine) {
      const above = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE game=? AND period=? AND pkey=? AND (score>? OR (score=? AND at<?))').bind(game, period, pkey, mine.score, mine.score, mine.at).first();
      me = { rank: above.n + 1, score: mine.score };
    }
  }
  return { top: rows.map(r => ({ name: r.name, score: r.score, frame: r.frame, title: r.title, me: r.uid === uid })), me: me || null };
}

// Freezes last week's top 100 into the rewards table once per game (cron Monday 00:05 UTC, or lazily on first /rewards).
async function finalizeWeek(env, game, week) {
  const done = await env.DB.prepare('INSERT OR IGNORE INTO weeks_done (game, week, at) VALUES (?,?,?)').bind(game, week, Date.now()).run();
  if (!done.meta || !done.meta.changes) return;
  const top = (await env.DB.prepare("SELECT uid FROM scores WHERE game=? AND period='week' AND pkey=? ORDER BY score DESC, at ASC LIMIT 100").bind(game, week).all()).results;
  const stmts = top.map((r, i) => { const p = PRIZES.find(x => i + 1 <= x.upTo); return env.DB.prepare('INSERT OR IGNORE INTO rewards (game, week, uid, rank, coins, badges, claimed) VALUES (?,?,?,?,?,?,0)').bind(game, week, r.uid, i + 1, p.coins, JSON.stringify(p.badges)); });
  if (stmts.length) await env.DB.batch(stmts);
}
async function claimRewards(env, user, game) {
  await finalizeWeek(env, game, lastWeekKey());
  const rows = (await env.DB.prepare('UPDATE rewards SET claimed=1 WHERE game=? AND uid=? AND claimed=0 RETURNING week, rank, coins, badges').bind(game, String(user.id)).all()).results;
  return { rewards: rows.map(r => ({ week: r.week, rank: r.rank, coins: r.coins, badges: JSON.parse(r.badges || '[]') })) };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'POST') return new Response('Deadspan Arcade backend', { headers: CORS });

    if (url.pathname === '/webhook') {
      if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      const u = await req.json();
      if (u.pre_checkout_query) {
        const ok = !!PRODUCTS[(u.pre_checkout_query.invoice_payload || '').split(':')[1]];
        await tg(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: u.pre_checkout_query.id, ok, error_message: ok ? undefined : 'Item unavailable' });
      } else if (u.message && u.message.successful_payment) {
        const sp = u.message.successful_payment; const [uid, sku] = sp.invoice_payload.split(':'); const prod = PRODUCTS[sku];
        if (prod) {
          // charge id kept for refunds (refundStarPayment) and so a retried webhook can't double-deliver
          await env.DB.prepare('INSERT OR IGNORE INTO purchases (charge_id, uid, sku, game, at, delivered) VALUES (?,?,?,?,?,0)').bind(sp.telegram_payment_charge_id, uid, sku, prod.game, Date.now()).run();
          await tg(env, 'sendMessage', { chat_id: u.message.chat.id, text: `Thanks! ${prod.title} unlocks next time you open the game.` });
        }
      } else if (u.message && /^\/start/.test(u.message.text || '')) {
        const param = (u.message.text.split(' ')[1] || '');
        await tg(env, 'sendMessage', {
          chat_id: u.message.chat.id,
          text: '🧟 The horde is on the bridge. Grow your squad, pick the right gates, hold the line.\n\nTap PLAY to start, free, with no sign-up.',
          reply_markup: { inline_keyboard: [[{ text: '▶ PLAY DEADSPAN', web_app: { url: env.GAME_URL + (param ? `?startapp=${encodeURIComponent(param)}` : '') } }]] },
        });
      } else if (u.message && /^\/paysupport/.test(u.message.text || '')) {
        await tg(env, 'sendMessage', { chat_id: u.message.chat.id, text: 'For help with a Stars purchase, reply here with what you bought and when, and we will sort it out.' });
      }
      return new Response('ok');
    }

    let b; try { b = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
    const user = await verifyInitData(env, (b && b.initData) || '');
    if (!user) return json({ error: 'unauthorized' }, 401);
    const game = GAMES.includes(b.game) ? b.game : 'deadspan';

    if (url.pathname === '/invoice') {
      const prod = PRODUCTS[b.sku]; if (!prod) return json({ error: 'bad_sku' }, 400);
      const r = await tg(env, 'createInvoiceLink', {
        title: prod.title, description: prod.description, payload: `${user.id}:${b.sku}:${crypto.randomUUID()}`,
        provider_token: '', currency: 'XTR', prices: [{ label: prod.title, amount: prod.stars }],
      });
      return r.ok ? json({ link: r.result }) : json({ error: 'tg_error' }, 502);
    }
    if (url.pathname === '/claim') {
      const rows = (await env.DB.prepare('UPDATE purchases SET delivered=1 WHERE uid=? AND game=? AND delivered=0 RETURNING sku').bind(String(user.id), game).all()).results;
      const out = { items: [], premium: false };
      for (const r of rows) { const p = PRODUCTS[r.sku]; if (!p) continue; if (p.items) out.items.push(...p.items); if (p.premium) out.premium = true; }
      return json(out);
    }
    if (url.pathname === '/score') { const r = await submitScore(env, user, Object.assign({}, b, { game })); return json(r, r.error ? (r.error === 'rate_limited' ? 429 : 422) : 200); }
    if (url.pathname === '/lb') return json(await board(env, user, game, ['day', 'week', 'all', 'friends'].includes(b.board) ? b.board : 'day'));
    if (url.pathname === '/rewards') return json(await claimRewards(env, user, game));
    return json({ error: 'not_found' }, 404);
  },
  // Cron (wrangler.toml): freeze last week's prizes and prune old daily/weekly rows (free D1 limits are generous, this keeps it small).
  async scheduled(event, env) {
    for (const g of GAMES) await finalizeWeek(env, g, lastWeekKey());
    const oldDay = dayKey(new Date(Date.now() - 8 * 864e5));
    await env.DB.batch([
      env.DB.prepare("DELETE FROM scores WHERE period='day' AND pkey < ?").bind(oldDay),
      env.DB.prepare("DELETE FROM scores WHERE period='week' AND pkey < ? AND pkey <> ?").bind(weekKey(new Date(Date.now() - 21 * 864e5)), lastWeekKey()),
    ]);
  },
};

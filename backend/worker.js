// Deadspan bot backend: Cloudflare Worker (free tier). NOT DEPLOYED YET; see docs/AUTOMATION-PLAN.md.
// Handles: Telegram webhook (/start reply with Play button, Stars pre-checkout + successful_payment),
//          POST /invoice (creates a Telegram Stars invoice link for the Mini App),
//          POST /claim   (returns coins credited from completed purchases, then clears them).
// Secrets/bindings (set in Cloudflare dashboard or wrangler):
//   BOT_TOKEN       secret, from @BotFather
//   WEBHOOK_SECRET  secret, any random string; also passed to setWebhook as secret_token
//   GAME_URL        var,    e.g. https://curtisrobertrc-droid.github.io/deadspan/
//   KV              KV namespace binding, stores pending credits per Telegram user id
const PRODUCTS = {
  coins_5k:  { title: '5,000 coins',  description: 'Adds exactly 5,000 coins to your Deadspan account.',  stars: 50,  coins: 5000 },
  coins_15k: { title: '15,000 coins', description: 'Adds exactly 15,000 coins to your Deadspan account.', stars: 120, coins: 15000 },
};
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });

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
  try { return JSON.parse(p.get('user')); } catch { return null; }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/webhook' && req.method === 'POST') {
      if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      const u = await req.json();
      if (u.pre_checkout_query) {
        const ok = !!PRODUCTS[(u.pre_checkout_query.invoice_payload || '').split(':')[1]];
        await tg(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: u.pre_checkout_query.id, ok, error_message: ok ? undefined : 'Item unavailable' });
      } else if (u.message && u.message.successful_payment) {
        const sp = u.message.successful_payment; const [uid, sku] = sp.invoice_payload.split(':'); const prod = PRODUCTS[sku];
        if (prod) {
          const key = 'credit:' + uid; const cur = Number(await env.KV.get(key) || 0);
          await env.KV.put(key, String(cur + prod.coins));
          await env.KV.put('charge:' + sp.telegram_payment_charge_id, JSON.stringify({ uid, sku, at: Date.now() })); // keep for refunds
          await tg(env, 'sendMessage', { chat_id: u.message.chat.id, text: `Thanks! ${prod.title} will be added next time you open Deadspan.` });
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

    if (url.pathname === '/invoice' && req.method === 'POST') {
      const { sku, initData } = await req.json(); const user = await verifyInitData(env, initData || ''); const prod = PRODUCTS[sku];
      if (!user || !prod) return json({ error: 'bad_request' }, 400);
      const r = await tg(env, 'createInvoiceLink', {
        title: prod.title, description: prod.description, payload: `${user.id}:${sku}:${crypto.randomUUID()}`,
        provider_token: '', currency: 'XTR', prices: [{ label: prod.title, amount: prod.stars }],
      });
      return r.ok ? json({ link: r.result }) : json({ error: 'tg_error' }, 502);
    }

    if (url.pathname === '/claim' && req.method === 'POST') {
      const { initData } = await req.json(); const user = await verifyInitData(env, initData || '');
      if (!user) return json({ error: 'bad_request' }, 400);
      const key = 'credit:' + user.id; const coins = Number(await env.KV.get(key) || 0);
      if (coins) await env.KV.delete(key);
      return json({ coins });
    }
    return new Response('Deadspan backend', { headers: CORS });
  },
};

import { CFG, AUTOPLAY, DEVOK } from './config.js';
import { IS_PORTAL, TARGET, gameplay, loadingDone, PortalAds, onAdMute } from './portal.js';
import { tg, initPlatform, inTelegram, loadLocal, loadCloud, save, haptic, startParam, shareInvite, userId } from './platform.js';
import { Ads } from './ads.js';
import { Payments } from './payments.js';
import { setSound, setAdMute, unlockAudio, SFX } from './audio.js';
onAdMute(setAdMute);
import { Game, fmt, levelInfo } from './game.js?v7';
import { loadAssets } from './assets.js?v7';
import { createMeta } from './meta.js?v8';
import { CATALOG, CATS, applyTo } from './catalog.js?v7';

initPlatform();
const $ = s => document.querySelector(s);
const DEF = { v: 1, level: 1, coins: 0, best: 0, up: { rate: 0, dmg: 0, squad: 0 }, daily: { last: '', streak: 0 }, runs: 0, sound: true, refClaimed: false, created: Date.now() };
let S = Object.assign({}, DEF, loadLocal() || {}); S.up = Object.assign({}, DEF.up, S.up); S.daily = Object.assign({}, DEF.daily, S.daily);
const persist = () => save(S);
loadCloud().then(c => { if (c && (c.level > S.level || (c.level === S.level && c.coins > S.coins))) { S = Object.assign({}, DEF, c); S.up = Object.assign({}, DEF.up, c.up); S.daily = Object.assign({}, DEF.daily, c.daily); persist(); refresh(); if (typeof meta !== "undefined") meta.reapply(); } });
setSound(S.sound);

// referral bonus for new players arriving via ?startapp=ref_<id> (inviter reward needs the bot backend)
const sp = startParam();
if (sp && /^ref_/.test(sp) && !S.refClaimed && sp !== 'ref_' + userId()) { S.refClaimed = true; S.coins += CFG.REFERRAL_BONUS; persist(); setTimeout(() => toast(`Welcome bonus: +${CFG.REFERRAL_BONUS} coins from your friend's invite!`), 600); }

const UPS = [
  { id: 'rate', name: 'Fire rate', icon: '⚡', desc: '+12% shots per second', base: 40, g: 1.5, max: 30 },
  { id: 'dmg', name: 'Damage', icon: '💥', desc: '+20% bullet damage', base: 50, g: 1.55, max: 30 },
  { id: 'squad', name: 'Starting squad', icon: '🪖', desc: '+1 soldier at the start', base: 60, g: 1.6, max: 25 },
];
const cost = u => Math.round(u.base * Math.pow(u.g, S.up[u.id]));
const startSquad = () => 1 + S.up.squad;

const game = new Game($('#cv'), {
  onTick: g => {
    $('#hudLevel').textContent = 'LEVEL ' + g.L + (g.info.boss ? ' · BOSS' : '');
    $('#hudCoins').textContent = fmt(S.coins + g.coins - (g.banked || 0));
    $('#hudBar').style.width = (Math.min(1, g.dist / g.finishAt) * 100).toFixed(1) + '%';
  },
  onWeapon: name => { $('#hudWeapon').textContent = name; },
  onEnd: res => showResult(res),
});
if (DEVOK) window.__game = game; // for automated screenshot tests

// cosmetics, daily shop, season pass, leaderboards (cosmetic only; see js/meta.js)
const net = {
  enabled: () => !!(CFG.LEADERBOARDS && CFG.BACKEND_URL && inTelegram),
  post: (path, body) => fetch(CFG.BACKEND_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ initData: tg.initData }, body)) }).then(r => r.json()),
};
const CAT_BY_ID = Object.fromEntries(CATALOG.map(i => [i.id, i]));
const meta = createMeta({ getS: () => S, persist, game: 'deadspan', catalog: CATALOG, cats: CATS, toast: m => toast(m), fmt, sfx: () => SFX.coin(),
  apply: eq => applyTo(game, eq, CAT_BY_ID), net, refresh: () => refresh(), metricLabel: v => `Lv ${Math.floor(v / 10000)} · ${fmt(v % 10000)} pts` });
if (DEVOK) window.__meta = meta;

let revived = false;
let lastWin = false, lastReviveOffer = -1e9;
async function play() {
  unlockAudio(); haptic('medium'); revived = false;
  if (IS_PORTAL) await PortalAds.beforePlay({ afterWin: lastWin });
  show('hud'); $('#hudWeapon').textContent = 'Rifle';
  game.banked = 0; game.start(S.level, startSquad(), S.up); game.runT0 = game.t; gameplay(true);
}

function show(id) { for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === id); }
if (DEVOK) window.__fps = () => game.fps;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); }

function today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function yesterday() { const d = new Date(Date.now() - 864e5); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
const dailyReady = () => S.daily.last !== today();
const dailyAmount = () => { const st = S.daily.last === yesterday() ? S.daily.streak + 1 : 1; return { st, amt: 100 + (Math.min(st, 7) - 1) * 50 + (st % 7 === 0 ? 300 : 0) + S.level * 5 }; };

function refresh() {
  $('#menuLevel').textContent = S.level;
  $('#menuCoins').textContent = fmt(S.coins);
  $('#menuBoss').textContent = levelInfo(S.level).boss ? '☠ BOSS LEVEL' : `Boss in ${5 - (S.level % 5)} level${5 - (S.level % 5) === 1 ? '' : 's'}`;
  $('#dailyDot').style.display = dailyReady() ? 'block' : 'none';
  if (typeof meta !== 'undefined') $('#passDot').style.display = meta.claimable() ? 'block' : 'none';
  $('#btnSound').textContent = S.sound ? '🔊' : '🔇';
  $('#shopCoins').textContent = fmt(S.coins);
  const list = $('#upList'); list.innerHTML = '';
  for (const u of UPS) {
    const lv = S.up[u.id], c = cost(u), maxed = lv >= u.max;
    const row = document.createElement('div'); row.className = 'up';
    row.innerHTML = `<div class="ic">${u.icon}</div><div class="t"><b>${u.name}</b> <span class="lv">Lv ${lv}</span><br><small>${u.desc}</small></div><button class="buy" ${maxed || S.coins < c ? 'disabled' : ''}>${maxed ? 'MAX' : '🪙 ' + fmt(c)}</button>`;
    row.querySelector('button').onclick = () => { if (S.coins < c || maxed) return; S.coins -= c; S.up[u.id]++; persist(); SFX.coin(); haptic('light'); refresh(); };
    list.appendChild(row);
  }
  const st = $('#starList'); st.innerHTML = '';
  for (const p of CFG.STAR_PRODUCTS) {
    const row = document.createElement('div'); row.className = 'up';
    row.innerHTML = `<div class="ic">⭐</div><div class="t"><b>${p.title}</b><br><small>${p.desc || ''} · cosmetic only, fixed contents</small></div><button class="buy star">${p.stars} ⭐</button>`;
    row.querySelector('button').onclick = async () => {
      if (!Payments.enabled()) return toast('Telegram Stars shop opens soon!');
      const r = await Payments.buy(p.sku);
      if (r.ok) { applyGrant(r.grant); toast('Thanks! Unlocked.'); } else if (r.reason !== 'cancelled') toast('Purchase not completed.');
    };
    st.appendChild(row);
  }
}

function renderMore() {
  const mg = $('#moreGames'); if (!mg || IS_PORTAL) return; mg.innerHTML = '';
  for (const g of CFG.MORE_GAMES || []) { const a = document.createElement('a'); a.className = 'more'; a.href = g.url; a.innerHTML = `<img src="${g.icon}" alt=""><span><span class="k">MORE GAMES</span><br><b>${g.name}</b><small>${g.tag}</small></span>`; mg.appendChild(a); }
}
renderMore();

function showResult(r) {
  S.runs++; gameplay(false); lastWin = r.win;
  const box = $('#result');
  $('#resTitle').textContent = r.win ? (levelInfo(r.L).boss ? 'BOSS DOWN!' : 'BRIDGE CLEARED!') : 'OVERRUN!';
  $('#resTitle').className = r.win ? 'win' : 'lose';
  $('#resSub').textContent = r.win ? `Level ${r.L} · ${r.kills} zombies · peak squad ${fmt(r.peak)}` : `Level ${r.L} · ${Math.round(r.progress * 100)}% across · ${r.kills} zombies`;
  $('#resCoins').textContent = '+' + fmt(r.coins);
  // bank coins straight away (closing the app on this screen used to lose them); a revive only banks the new coins
  const earned = Math.max(0, r.coins - (game.banked || 0)); game.banked = r.coins;
  // season XP + personal best / leaderboard (score = levels cleared x10000 + run points)
  meta.addXp(r.kills * 0.6 + (r.win ? 40 + r.L * 2 : 10));
  const cleared = r.win ? r.L : r.L - 1, pts = Math.min(9999, r.kills * 3 + (r.peak || 0));
  if (cleared > 0) meta.recordRun(cleared * 10000 + pts, cleared, { kills: r.kills, win: r.win, dur: Math.round(game.t - (game.runT0 || 0)), ref: refBy() });
  S.coins += earned; if (r.win) { S.level = Math.max(S.level, r.L + 1); S.best = Math.max(S.best, r.L); } persist(); refresh();
  let doubled = false; const collect = mult => { if (mult > 1 && !doubled) { doubled = true; S.coins += earned * (mult - 1); persist(); refresh(); } };
  const adBtn = $('#btnDouble'), revBtn = $('#btnRevive');
  adBtn.style.display = Ads.available() && earned > 0 ? '' : 'none';
  // portals: don't offer a revive ad on every death (CrazyGames rule), at most one offer every 3 minutes
  const offerRevive = !r.win && !revived && Ads.available() && (!IS_PORTAL || performance.now() - lastReviveOffer > 180000);
  if (offerRevive && IS_PORTAL) lastReviveOffer = performance.now();
  revBtn.style.display = offerRevive ? '' : 'none';
  adBtn.onclick = async () => { adBtn.disabled = true; const ok = await Ads.showRewarded(); adBtn.disabled = false; if (ok) { collect(2); SFX.coin(); toast(`Doubled! +${fmt(earned * 2)} coins`); adBtn.style.display = 'none'; $('#resCoins').textContent = '+' + fmt(earned * 2); } else toast('No ad available right now'); };
  revBtn.onclick = async () => { revBtn.disabled = true; const ok = await Ads.showRewarded(); revBtn.disabled = false; if (ok) { revived = true; lastWin = false; show('hud'); game.revive(); gameplay(true); } else toast('No ad available right now'); };
  $('#btnNext').textContent = r.win ? `NEXT: LEVEL ${r.L + 1} ▶` : 'TRY AGAIN ↻';
  $('#btnNext').onclick = () => { collect(1); play(); };
  $('#btnMenu').onclick = () => { collect(1); refresh(); show('menu'); };
  show('result');
  if (AUTOPLAY) setTimeout(() => $('#btnNext').click(), 2500);
}

Game.prototype.revive = function () {
  this.over = false; this.squad = Math.max(5, Math.round(this.peakSquad * 0.3)); this.state = 'play'; this.last = performance.now();
  for (const it of this.items) if (it.k === 'z') { const y = this.sy(it.at); if (y > this.PY - 260) it.dead = true; }
  if (this.boss && !this.boss.dead) this.boss.at = this.dist + 330;
  this.pop(200, this.PY - 80, 'REVIVED!', '#4dabf7', 34); this.burst(this.px, this.PY, '#4dabf7', 30, 260);
};

// daily reward modal
function openDaily() {
  const { st, amt } = dailyAmount();
  const done = dailyReady() ? (st - 1) % 7 : ((S.daily.streak - 1) % 7) + 1;
  $('#dailyDays').innerHTML = Array.from({ length: 7 }, (_, i) => `<div class="day ${i < done ? 'got' : ''} ${dailyReady() && i === done ? 'now' : ''}">D${i + 1}</div>`).join('');
  $('#dailyAmt').textContent = dailyReady() ? `🪙 ${fmt(amt)}` : 'Come back tomorrow!';
  $('#btnClaim').style.display = dailyReady() ? '' : 'none';
  $('#btnClaim2').style.display = dailyReady() && Ads.available() ? '' : 'none';
  const claim = mult => { S.coins += amt * mult; S.daily = { last: today(), streak: st }; persist(); refresh(); SFX.coin(); haptic('success'); toast(`+${fmt(amt * mult)} coins · ${st}-day streak`); $('#daily').classList.remove('on'); };
  $('#btnClaim').onclick = () => claim(1);
  $('#btnClaim2').onclick = async () => { const ok = await Ads.showRewarded(); if (ok) claim(2); else toast('No ad available right now'); };
  $('#daily').classList.add('on');
}

function applyGrant(c) { if (!c) return; for (const id of c.items || []) meta.grant(id, 'Unlocked'); if (c.premium) meta.premium(true); persist(); refresh(); }
const refBy = () => { const p = startParam(); return p && /^ref_\d+$/.test(p) ? p.slice(4) : undefined; };
$('#btnStyle').onclick = () => meta.open('daily');
$('#btnPass').onclick = () => meta.open('pass');
$('#btnRanks').onclick = () => meta.open('ranks');
$('#btnPlay').onclick = play;
$('#btnShop').onclick = () => { refresh(); $('#shop').classList.add('on'); };
$('#btnDaily').onclick = openDaily;
$('#btnInvite').onclick = () => shareInvite(CFG.BOT_USERNAME, `I'm holding the bridge in Deadspan. Bet you can't beat level ${S.best || S.level}! 🧟`);
$('#btnSound').onclick = () => { S.sound = !S.sound; setSound(S.sound); persist(); refresh(); };
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => b.closest('.modal').classList.remove('on');
document.addEventListener('visibilitychange', () => { const po = document.getElementById('pauseOv'); if (document.hidden || !(po && po.classList.contains('on'))) game.pause(document.hidden); });
if (inTelegram && window.Telegram.WebApp.onEvent) window.Telegram.WebApp.onEvent('viewportChanged', () => game.resize());
if (IS_PORTAL) {
  // no Telegram invites, no Stars shop, no cross-links or outgoing links on web portals
  for (const sel of ['#btnInvite', '#starList', '#moreGames', '#menu footer']) { const el = $(sel); if (el) el.style.display = 'none'; }
  const sl = $('#starList'); if (sl && sl.previousElementSibling && sl.previousElementSibling.tagName === 'H3') sl.previousElementSibling.style.display = 'none';
  // Poki/CrazyGames ad UX: 🎬 icon on every rewarded button, plain continue button above them
  for (const b of document.querySelectorAll('button.ad')) b.textContent = b.textContent.replace(/^▶/, '🎬');
  const nx = $('#btnNext'), first = $('#btnDouble'); if (nx && first) first.parentNode.insertBefore(nx, first);
  // Esc / P pauses (keyboard players), tap or key resumes
  const pv = document.createElement('div'); pv.id = 'pauseOv'; pv.innerHTML = '<div>PAUSED<small>Tap or press Esc to resume</small></div>'; document.body.appendChild(pv);
  const setPause = v => { if (!$('#hud').classList.contains('on')) return; if (v && game.state !== 'play') return; if (!v && game.state !== 'paused') return; game.pause(v); pv.classList.toggle('on', v); gameplay(!v); };
  window.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') setPause(game.state === 'play'); });
  pv.onclick = () => setPause(false);
}
Ads.preload();
if (!IS_PORTAL) Payments.claim().then(c => { if (c && ((c.items || []).length || c.premium)) { applyGrant(c); toast('Purchase delivered!'); } });
meta.checkRewards();
refresh();
loadAssets(p => { $('#loadFill').style.width = Math.round(p * 100) + '%'; }).then(() => {
  game.bg = null; meta.reapply(); show('menu'); loadingDone();
  if (AUTOPLAY) setTimeout(play, 400);
});

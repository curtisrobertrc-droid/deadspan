import { CFG, AUTOPLAY, DEVOK } from './config.js';
import { IS_PORTAL, TARGET, gameplay, loadingDone, PortalAds, onAdMute, portalScore } from './portal.js?v2';
import { tg, initPlatform, inTelegram, loadLocal, loadCloud, save, haptic, startParam, shareInvite, copyInvite, inviteLink, userId } from './platform.js';
import { Ads } from './ads.js';
import { Payments } from './payments.js';
import { setSound, setAdMute, unlockAudio, SFX } from './audio.js';
onAdMute(setAdMute);
import { Game, fmt, levelInfo, ENDLESS } from './game.js?v8';
import { loadAssets } from './assets.js?v8';
import { createMeta } from './meta.js?v12';
import { CATALOG, CATS, applyTo } from './catalog.js?v8';

initPlatform();
const $ = s => document.querySelector(s);
const DEF = { v: 1, level: 1, coins: 0, best: 0, up: { rate: 0, dmg: 0, squad: 0 }, daily: { last: '', streak: 0 }, runs: 0, sound: true, refClaimed: false, created: Date.now() };
let S = Object.assign({}, DEF, loadLocal() || {}); S.up = Object.assign({}, DEF.up, S.up); S.daily = Object.assign({}, DEF.daily, S.daily);
const persist = () => save(S);
loadCloud().then(c => { if (c && (c.level > S.level || (c.level === S.level && c.coins > S.coins))) { const ref = S.referrer, pend = S.refPending, paid = S.refInviteePaid; S = Object.assign({}, DEF, c); S.up = Object.assign({}, DEF.up, c.up); S.daily = Object.assign({}, DEF.daily, c.daily); if (ref && !S.referrer) { S.referrer = ref; S.refPending = S.refPending || pend; S.refInviteePaid = S.refInviteePaid || paid; } persist(); refresh(); if (typeof meta !== "undefined") meta.reapply(); } });
setSound(S.sound);

// Store the referrer locally. Coin rewards (both players, once the invitee finishes level 1) are paid by the Worker when leaderboards are on; until then they are queued quietly.
{
  const p = startParam(); const me = userId();
  if (p && /^ref_\d{1,15}$/.test(p)) {
    const id = p.slice(4);
    if (id && id !== String(me || '') && !S.referrer) { S.referrer = id; persist(); }
  }
}

const UPS = [
  { id: 'rate', name: 'Fire rate', icon: '⚡', desc: '+12% shots per second', base: 40, g: 1.5, max: 30 },
  { id: 'dmg', name: 'Damage', icon: '💥', desc: '+20% bullet damage', base: 50, g: 1.55, max: 30 },
  { id: 'squad', name: 'Starting squad', icon: '🪖', desc: '+1 soldier at the start', base: 60, g: 1.6, max: 25 },
];
const cost = u => Math.round(u.base * Math.pow(u.g, S.up[u.id]));
const startSquad = () => 1 + S.up.squad;
// ---- Endless mode economy: coins are halved per kill (game.js), +3 per wave, then capped per run and per day so it
// never beats grinding the campaign. Run cap ~ 60% of what clearing your current campaign level pays.
const fmtDist = d => (d >= 10000 ? (d / 10000).toFixed(1) + ' km' : Math.floor(d / 10) + ' m');
const endlessDay = () => { const k = today(); if (!S.endless || S.endless.day !== k) S.endless = Object.assign({ best: 0, bestDist: 0, runs: 0 }, S.endless || {}, { day: k, dayCoins: 0 }); return S.endless; };
const endlessRunCap = () => 80 + S.level * 22;
const endlessRoom = () => { const e = endlessDay(); return Math.max(0, Math.min(endlessRunCap(), endlessRunCap() * 3 - e.dayCoins)); };
let mode = 'campaign';

const game = new Game($('#cv'), {
  onTick: g => {
    if (g.endless) {
      $('#hudLevel').textContent = `∞ WAVE ${g.wave + 1} · ${fmtDist(g.dist)}`;
      $('#hudCoins').textContent = fmt(S.coins + Math.min(Math.floor(g.coins), g.endlessRoom0 || 0) - (g.banked || 0));
      $('#hudBar').style.width = ((g.wave % 10) * 10) + '%';
      return;
    }
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
  configured: () => !!(CFG.LEADERBOARDS && CFG.BACKEND_URL),
  post: (path, body) => fetch(CFG.BACKEND_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ initData: tg.initData }, body)) }).then(r => r.json()),
};
const CAT_BY_ID = Object.fromEntries(CATALOG.map(i => [i.id, i]));
const meta = createMeta({ portal: IS_PORTAL, getS: () => S, persist, game: 'deadspan', catalog: CATALOG, cats: CATS, toast: m => toast(m), fmt, sfx: () => SFX.coin(),
  apply: eq => applyTo(game, eq, CAT_BY_ID), net, refresh: () => refresh(), modes: [['campaign', '🌉 Campaign'], ['endless', '∞ Endless']],
  metricLabel: (v, m) => m === 'endless' ? `Wave ${Math.floor(v / 10000)} · ${fmtDist((v % 10000) * 10)}` : `Lv ${Math.floor(v / 10000)} · ${fmt(v % 10000)} pts` });
if (DEVOK) window.__meta = meta;

let revived = false;
let lastWin = false, lastReviveOffer = -1e9;
async function play(m) {
  mode = m === 'endless' ? 'endless' : 'campaign';
  unlockAudio(); haptic('medium'); revived = false;
  if (IS_PORTAL) await PortalAds.beforePlay({ afterWin: lastWin });
  show('hud'); $('#hudWeapon').textContent = 'Rifle';
  game.banked = 0;
  if (mode === 'endless') { endlessDay(); game.endlessRoom0 = endlessRoom(); game.startEndless(startSquad(), S.up); }
  else game.start(S.level, startSquad(), S.up);
  game.runT0 = game.t; gameplay(true);
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
  { const e = endlessDay(); const eb = $('#endlessBest'); if (eb) eb.textContent = e.best ? `Best: wave ${e.best} · ${fmtDist(e.bestDist)}` : 'Waves never stop. How far can you get?'; }
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
  if (r.endless) return showEndlessResult(r);
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
  if (cleared > 0 && IS_PORTAL) portalScore(cleared * 10000 + pts);
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
  $('#resBest').style.display = 'none';
  $('#btnMenu').onclick = () => { collect(1); refresh(); show('menu'); };
  const shareBtn = $('#btnShareScore');
  if (shareBtn) {
    shareBtn.style.display = IS_PORTAL ? 'none' : '';
    const shareText = r.win
      ? `I cleared level ${r.L} in Deadspan! Think you can beat my score? 🧟`
      : `I made it ${Math.round(r.progress * 100)}% through level ${r.L} in Deadspan. Bet you can beat my score! 🧟`;
    shareBtn.onclick = () => doShare(shareText);
  }
  const clearedNow = r.win ? r.L : r.L - 1;
  if (S.referrer && clearedNow >= 1) { S.refPending = true; persist(); }
  syncInvites(Math.max(0, clearedNow));
  show('result');
  if (AUTOPLAY) setTimeout(() => $('#btnNext').click(), 2500);
}

// Endless results: separate best (waves + distance), capped coins, own leaderboard board ('endless' mode on /score and /lb)
function showEndlessResult(r) {
  S.runs++; gameplay(false); lastWin = false;
  const e = endlessDay();
  const total = Math.min(Math.floor(r.coins), game.endlessRoom0 || 0); // whole run incl. before a revive, capped
  const earned = Math.max(0, total - (game.banked || 0)); game.banked = (game.banked || 0) + earned;
  e.dayCoins += earned; e.runs++;
  const isBest = r.wave > e.best || (r.wave === e.best && r.dist > e.bestDist);
  if (isBest) { e.best = r.wave; e.bestDist = Math.floor(r.dist); }
  meta.addXp(Math.min(120, r.kills * 0.4 + r.wave * 3));
  if (r.wave >= 1) meta.recordRun(r.wave * 10000 + Math.min(9999, Math.floor(r.dist / 10)), r.wave, { mode: 'endless', kills: r.kills, win: false, dur: Math.round(game.t - (game.runT0 || 0)) });
  S.coins += earned; persist(); refresh();
  $('#resTitle').textContent = 'RUN OVER!'; $('#resTitle').className = 'lose';
  $('#resSub').textContent = `Endless · wave ${r.wave} · ${fmtDist(r.dist)} · ${r.kills} zombies`;
  $('#resCoins').textContent = '+' + fmt(game.banked);
  const rb = $('#resBest'); rb.style.display = ''; rb.textContent = isBest ? '🏅 NEW BEST!' : `Best: wave ${e.best} · ${fmtDist(e.bestDist)}`;
  if (endlessRoom() <= 0) rb.textContent += ' · daily endless coins reached (campaign still pays)';
  let doubled = false; const adBtn = $('#btnDouble'), revBtn = $('#btnRevive');
  adBtn.style.display = Ads.available() && earned > 0 ? '' : 'none';
  adBtn.onclick = async () => { adBtn.disabled = true; const ok = await Ads.showRewarded(); adBtn.disabled = false; if (ok && !doubled) { doubled = true; S.coins += earned; persist(); refresh(); SFX.coin(); toast(`Doubled! +${fmt(earned * 2)} coins`); adBtn.style.display = 'none'; $('#resCoins').textContent = '+' + fmt(game.banked + earned); } else if (!ok) toast('No ad available right now'); };
  const offerRevive = !revived && Ads.available() && (!IS_PORTAL || performance.now() - lastReviveOffer > 180000);
  if (offerRevive && IS_PORTAL) lastReviveOffer = performance.now();
  revBtn.style.display = offerRevive ? '' : 'none';
  revBtn.onclick = async () => { revBtn.disabled = true; const ok = await Ads.showRewarded(); revBtn.disabled = false; if (ok) { revived = true; show('hud'); game.revive(); gameplay(true); } else toast('No ad available right now'); };
  $('#btnNext').textContent = 'RUN AGAIN ↻';
  $('#btnNext').onclick = () => play('endless');
  $('#btnMenu').onclick = () => { refresh(); show('menu'); };
  const shareBtn = $('#btnShareScore');
  if (shareBtn) { shareBtn.style.display = IS_PORTAL ? 'none' : ''; shareBtn.onclick = () => doShare(`I survived ${r.wave} waves (${fmtDist(r.dist)}) in Deadspan Endless! Think you can last longer? 🧟`); }
  show('result');
  if (AUTOPLAY) setTimeout(() => $('#btnNext').click(), 2500);
}

Game.prototype.revive = function () {
  this.over = false; this.squad = Math.max(5, Math.round(this.peakSquad * 0.3)); this.state = 'play'; this.last = performance.now();
  for (const it of this.items) if (it.k === 'z' && !it.dead) { const y = this.sy(it.at); if (y > this.PY - 260) this.zgone(it); }
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
const refBy = () => S.referrer || undefined;
const clearedBest = () => Math.max(S.best || 0, Math.max(0, (S.level || 1) - 1));
async function tryPreparedShare(text) {
  if (!net.enabled()) return null;
  try {
    const r = await Promise.race([
      net.post('/shareprep', { game: 'deadspan', text }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1200)),
    ]);
    return r && r.id ? r.id : null;
  } catch (e) { return null; }
}
async function syncInvites(cleared) {
  const cl = Math.max(clearedBest(), cleared || 0);
  if (S.referrer && cl >= 1 && !S.refInviteePaid) { S.refPending = true; persist(); }
  if (!net.enabled()) return null;
  try {
    const r = await net.post('/ref', { game: 'deadspan', ref: S.referrer || undefined, cleared: cl });
    if (!r || r.error) return r;
    let got = 0;
    if (r.bonus && !S.refInviteePaid) { S.coins += r.bonus; S.refInviteePaid = true; S.refPending = false; got += r.bonus; toast(`Invite bonus: +${fmt(r.bonus)} coins!`); }
    if (r.claim) { S.coins += r.claim; got += r.claim; toast(`A friend finished level 1! +${fmt(r.claim)} coins`); }
    S.inviteStats = { invites: r.invites || 0, cleared: r.cleared || 0, earned: r.earned || 0 };
    persist(); if (got) { SFX.coin(); haptic('success'); } refresh(); renderInviteStats();
    return r;
  } catch (e) { return null; }
}
async function doShare(text) {
  const preparedId = await tryPreparedShare(text);
  const res = await shareInvite(CFG.BOT_USERNAME, text, { preparedId, title: CFG.GAME_NAME });
  if (res.aborted) return;
  if (res.method === 'copy' && res.ok) toast('Link copied — send it to a friend!');
  else if (!res.ok) toast('Could not share just now. Try Copy link in Invite.');
}
function renderInviteStats() {
  const box = $('#inviteStats'); if (!box) return;
  if (net.enabled() && S.inviteStats) {
    const s = S.inviteStats;
    box.innerHTML = `<div><b class="n">${s.invites || 0}</b> friend${(s.invites === 1) ? '' : 's'} joined</div><div>${s.cleared || 0} finished level 1 · you've earned 🪙 ${fmt(s.earned || 0)}</div>`;
  } else {
    box.innerHTML = `<p class="blurb">Your link works now. Coin rewards (🪙 ${fmt(CFG.REFERRAL_BONUS)} each, once a friend finishes level 1) start when leaderboards go live.${S.refPending ? ' Your own bonus is saved and will be added then.' : ''}</p>`;
  }
}
function openInvite() {
  const el = $('#inviteLink'); if (el) el.textContent = inviteLink(CFG.BOT_USERNAME);
  renderInviteStats();
  $('#invite').classList.add('on');
  syncInvites();
}

$('#btnStyle').onclick = () => meta.open('daily');
$('#btnPass').onclick = () => meta.open('pass');
$('#btnRanks').onclick = () => meta.open('ranks');
$('#btnPlay').onclick = () => play();
$('#btnEndless').onclick = () => play('endless');
$('#btnShop').onclick = () => { refresh(); $('#shop').classList.add('on'); };
$('#btnDaily').onclick = openDaily;
$('#btnInvite').onclick = openInvite;
$('#btnShareInvite').onclick = () => doShare(`I'm holding the bridge in Deadspan. Bet you can't beat level ${S.best || S.level}! 🧟`);
$('#btnCopyInvite').onclick = async () => { const r = await copyInvite(CFG.BOT_USERNAME, `I'm holding the bridge in Deadspan. Bet you can't beat my score! 🧟`); toast(r.ok ? 'Link copied — send it to a friend!' : 'Could not copy the link'); };
$('#btnSound').onclick = () => { S.sound = !S.sound; setSound(S.sound); persist(); refresh(); };
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => b.closest('.modal').classList.remove('on');
document.addEventListener('visibilitychange', () => { const po = document.getElementById('pauseOv'); if (document.hidden || !(po && po.classList.contains('on'))) game.pause(document.hidden); });
if (inTelegram && window.Telegram.WebApp.onEvent) window.Telegram.WebApp.onEvent('viewportChanged', () => game.resize());
if (IS_PORTAL) {
  // no Telegram invites, no Stars shop, no cross-links or outgoing links on web portals
  for (const sel of ['#btnInvite', '#btnShareScore', '#starList', '#moreGames', '#menu footer']) { const el = $(sel); if (el) el.style.display = 'none'; }
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
syncInvites();
refresh();
loadAssets(p => { $('#loadFill').style.width = Math.round(p * 100) + '%'; }).then(() => {
  game.bg = null; meta.reapply(); show('menu'); loadingDone();
  if (AUTOPLAY) setTimeout(play, 400);
});

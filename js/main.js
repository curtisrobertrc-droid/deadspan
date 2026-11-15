import { CFG, AUTOPLAY } from './config.js';
import { initPlatform, inTelegram, loadLocal, loadCloud, save, haptic, startParam, shareInvite, userId } from './platform.js';
import { Ads } from './ads.js';
import { Payments } from './payments.js';
import { setSound, unlockAudio, SFX } from './audio.js';
import { Game, fmt, levelInfo } from './game.js';

initPlatform();
const $ = s => document.querySelector(s);
const DEF = { v: 1, level: 1, coins: 0, best: 0, up: { rate: 0, dmg: 0, squad: 0 }, daily: { last: '', streak: 0 }, runs: 0, sound: true, refClaimed: false, created: Date.now() };
let S = Object.assign({}, DEF, loadLocal() || {}); S.up = Object.assign({}, DEF.up, S.up); S.daily = Object.assign({}, DEF.daily, S.daily);
const persist = () => save(S);
loadCloud().then(c => { if (c && (c.level > S.level || (c.level === S.level && c.coins > S.coins))) { S = Object.assign({}, DEF, c); S.up = Object.assign({}, DEF.up, c.up); S.daily = Object.assign({}, DEF.daily, c.daily); persist(); refresh(); } });
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
    $('#hudCoins').textContent = fmt(S.coins + g.coins);
    $('#hudBar').style.width = (Math.min(1, g.dist / g.finishAt) * 100).toFixed(1) + '%';
  },
  onWeapon: name => { $('#hudWeapon').textContent = name; },
  onEnd: res => showResult(res),
});
window.__game = game; // for automated screenshot tests

let revived = false;
function play() {
  unlockAudio(); haptic('medium'); revived = false;
  show('hud'); $('#hudWeapon').textContent = 'Rifle';
  game.start(S.level, startSquad(), S.up);
}

function show(id) { for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === id); }
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
    row.innerHTML = `<div class="ic">⭐</div><div class="t"><b>${p.title}</b><br><small>Fixed amount, no random rewards</small></div><button class="buy star">${p.stars} ⭐</button>`;
    row.querySelector('button').onclick = async () => {
      if (!Payments.enabled()) return toast('Telegram Stars shop opens soon!');
      const r = await Payments.buy(p.sku);
      if (r.ok) { S.coins += r.coins; persist(); refresh(); toast('Thanks! Coins added.'); } else if (r.reason !== 'cancelled') toast('Purchase not completed.');
    };
    st.appendChild(row);
  }
}

function showResult(r) {
  S.runs++;
  const box = $('#result');
  $('#resTitle').textContent = r.win ? (levelInfo(r.L).boss ? 'BOSS DOWN!' : 'BRIDGE CLEARED!') : 'OVERRUN!';
  $('#resTitle').className = r.win ? 'win' : 'lose';
  $('#resSub').textContent = r.win ? `Level ${r.L} · ${r.kills} zombies · peak squad ${fmt(r.peak)}` : `Level ${r.L} · ${Math.round(r.progress * 100)}% across · ${r.kills} zombies`;
  $('#resCoins').textContent = '+' + fmt(r.coins);
  let earned = r.coins; let collected = false;
  const collect = mult => { if (collected) return; collected = true; S.coins += earned * mult; if (r.win) { S.level = r.L + 1; S.best = Math.max(S.best, r.L); } persist(); refresh(); };
  const adBtn = $('#btnDouble'), revBtn = $('#btnRevive');
  adBtn.style.display = Ads.available() && earned > 0 ? '' : 'none';
  revBtn.style.display = !r.win && !revived && Ads.available() ? '' : 'none';
  adBtn.onclick = async () => { adBtn.disabled = true; const ok = await Ads.showRewarded(); adBtn.disabled = false; if (ok) { collect(2); SFX.coin(); toast(`Doubled! +${fmt(earned * 2)} coins`); adBtn.style.display = 'none'; $('#resCoins').textContent = '+' + fmt(earned * 2); } else toast('No ad available right now'); };
  revBtn.onclick = async () => { revBtn.disabled = true; const ok = await Ads.showRewarded(); revBtn.disabled = false; if (ok) { revived = true; show('hud'); game.revive(); } };
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

$('#btnPlay').onclick = play;
$('#btnShop').onclick = () => { refresh(); $('#shop').classList.add('on'); };
$('#btnDaily').onclick = openDaily;
$('#btnInvite').onclick = () => shareInvite(CFG.BOT_USERNAME, `I'm holding the bridge in Deadspan. Bet you can't beat level ${S.best || S.level}! 🧟`);
$('#btnSound').onclick = () => { S.sound = !S.sound; setSound(S.sound); persist(); refresh(); };
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => b.closest('.modal').classList.remove('on');
document.addEventListener('visibilitychange', () => game.pause(document.hidden));
if (inTelegram && window.Telegram.WebApp.onEvent) window.Telegram.WebApp.onEvent('viewportChanged', () => game.resize());
Ads.preload();
Payments.claim().then(c => { if (c > 0) { S.coins += c; persist(); refresh(); toast(`Purchase delivered: +${fmt(c)} coins`); } });
refresh(); show('menu');
if (AUTOPLAY) setTimeout(play, 400);

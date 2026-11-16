// Deadspan — zombie bridge runner. Plain canvas, no dependencies. v2: sprite art with pseudo-3D perspective,
// falls back to the procedural shapes below if an image fails to load.
import { AUTOPLAY } from './config.js';
import { IMG, BG, pick } from './assets.js?v2';
import { haptic } from './platform.js';
import { SFX } from './audio.js';

const W = 400;
const ROAD_L = 48, ROAD_R = 352, ROAD_C = 200, HALF = ROAD_C - ROAD_L;
// perspective: depth constant, road half-width per px below the vanishing point, vanishing point height in bg art
const D = 400, K = 0.39, VPY = 0.332, BGW = 540, BGH = 960;
const ZH = { zombie: 56, runner: 54, brute: 88 }; // world heights
const ZIMG = { zombie: ['zombie1', 'zombie2'], runner: ['runner'], brute: ['brute'] };
function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(Math.floor(n));

// ---------- procedural sprites (cached offscreen) ----------
function mk(w, h, draw, s = 2) { const c = document.createElement('canvas'); c.width = w * s; c.height = h * s; const x = c.getContext('2d'); x.scale(s, s); draw(x); return c; }
function circ(x, cx, cy, r, col) { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
const SPR = {};
function buildSprites() {
  SPR.soldier = mk(20, 26, x => {
    x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(10, 23, 7, 3, 0, 0, 7); x.fill();
    x.fillStyle = '#2b3a55'; x.fillRect(5, 12, 10, 10);            // body
    x.fillStyle = '#3f8cff'; x.fillRect(5, 12, 10, 4);            // vest
    x.fillStyle = '#222'; x.fillRect(13, 2, 3, 12);               // rifle
    circ(x, 10, 9, 5, '#f1c27d');                                 // head
    x.fillStyle = '#3c5a2c'; x.beginPath(); x.arc(10, 8, 5.6, Math.PI, 0); x.fill(); // helmet
  });
  const zombie = (skin, shirt, size) => mk(size, size * 1.25, x => {
    const s = size / 24;
    x.scale(s, s);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(12, 27, 8, 3, 0, 0, 7); x.fill();
    x.fillStyle = shirt; x.fillRect(6, 13, 12, 12);
    x.fillStyle = skin; x.fillRect(2, 15, 4, 9); x.fillRect(18, 15, 4, 9); // arms reaching
    circ(x, 12, 9, 6.5, skin);
    x.fillStyle = '#ff2a2a'; x.fillRect(8, 8, 3, 2.5); x.fillRect(13.5, 8, 3, 2.5);
    x.fillStyle = '#1a1a1a'; x.fillRect(9, 12.5, 6, 1.5);
  });
  SPR.zombie = zombie('#7fb069', '#6b4f3a', 24);
  SPR.runner = zombie('#a3c45a', '#8a2b2b', 22);
  SPR.brute = zombie('#5d8a4a', '#3b3b55', 40);
  SPR.boss = mk(110, 120, x => {
    x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.ellipse(55, 112, 45, 8, 0, 0, 7); x.fill();
    x.fillStyle = '#4a2f5e'; x.fillRect(20, 50, 70, 55);
    x.fillStyle = '#6e9b4f'; x.fillRect(2, 55, 20, 45); x.fillRect(88, 55, 20, 45);
    circ(x, 55, 36, 30, '#6e9b4f');
    x.fillStyle = '#ffde3b'; x.fillRect(38, 28, 10, 7); x.fillRect(62, 28, 10, 7);
    x.fillStyle = '#2a0f0f'; x.fillRect(40, 47, 30, 7);
    x.fillStyle = '#eee'; for (let i = 0; i < 5; i++) x.fillRect(41 + i * 6, 47, 3, 3);
    x.fillStyle = '#8b1e1e'; x.fillRect(30, 60, 50, 6);
  });
  SPR.shadow = mk(64, 24, x => { const g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.scale(1, 24 / 64); x.beginPath(); x.arc(32, 32, 32, 0, 7); x.fill(); }, 1);
  SPR.crate = mk(34, 34, x => {
    x.fillStyle = '#9a6b34'; x.fillRect(1, 1, 32, 32); x.strokeStyle = '#5b3c19'; x.lineWidth = 3; x.strokeRect(2.5, 2.5, 29, 29);
    x.beginPath(); x.moveTo(3, 3); x.lineTo(31, 31); x.moveTo(31, 3); x.lineTo(3, 31); x.stroke();
  });
  SPR.barrel = mk(26, 32, x => {
    x.fillStyle = '#c0392b'; x.fillRect(2, 2, 22, 28); x.fillStyle = '#922b21'; x.fillRect(2, 8, 22, 3); x.fillRect(2, 21, 22, 3);
    x.fillStyle = '#ffd54a'; x.beginPath(); x.moveTo(13, 11); x.lineTo(18, 19); x.lineTo(8, 19); x.fill();
  });
}

const WEAPONS = {
  RIFLE: { name: 'Rifle', rate: 1, spread: 0, pierce: 1, col: '#ffe066' },
  SMG: { name: 'SMG', rate: 1.9, spread: 0.05, pierce: 1, col: '#9cf' },
  SHOTGUN: { name: 'Shotgun', rate: 0.8, spread: 0.32, pierce: 1, col: '#ffa94d', multi: 3 },
  RAIL: { name: 'Railgun', rate: 0.9, spread: 0, pierce: 4, col: '#d0a0ff' },
};
const PICKUPS = ['SMG', 'SHOTGUN', 'RAIL'];

export function levelInfo(L) { return { boss: L % 5 === 0, length: 2600 + Math.min(L, 30) * 140 }; }

export class Game {
  constructor(canvas, hooks) {
    this.cv = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.hooks = hooks; buildSprites();
    this.H = 720; this.state = 'idle'; this.t = 0; this.shake = 0;
    this.targetX = ROAD_C; this.px = ROAD_C;
    this.parts = []; this.pops = []; this.bullets = []; this.ghosts = []; this.cfly = []; this.dl = []; this.muz = 0; this.fps = 60; this.frames = 0; this.fpsT0 = performance.now(); this.shx = this.shy = 0;
    this.resize(); window.addEventListener('resize', () => this.resize());
    this.bindInput();
    this.last = performance.now();
    this.loop = this.loop.bind(this); requestAnimationFrame(this.loop);
    this.setupLevel(1, 1, {}); this.state = 'idle';
  }
  resize() {
    const vw = window.innerWidth, vh = (window.Telegram && Telegram.WebApp && Telegram.WebApp.viewportStableHeight) || window.innerHeight;
    this.H = clamp(Math.round(vh / vw * W), 620, 900);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(vw / W, vh / this.H);
    this.cssScale = scale;
    this.cv.style.width = W * scale + 'px'; this.cv.style.height = this.H * scale + 'px';
    this.cv.width = Math.round(W * scale * this.dpr); this.cv.height = Math.round(this.H * scale * this.dpr);
    this.PY = this.H - 150;
    this.bs = this.cv.width / W;
    const sc = Math.max(W / BGW, this.H / BGH); this.bgW = BGW * sc; this.bgH = BGH * sc; this.bgX = (W - this.bgW) / 2; this.bgY = this.H - this.bgH;
    this.hY = this.bgY + VPY * this.bgH;
    this.s0 = (this.PY - this.hY) * K / HALF;
    this.bg = null;
  }
  bindInput() {
    let dragging = false, lastX = 0;
    const toX = e => { const r = this.cv.getBoundingClientRect(); return (e.clientX - r.left) / r.width * W; };
    this.cv.addEventListener('pointerdown', e => { dragging = true; lastX = toX(e); this.cv.setPointerCapture && this.cv.setPointerCapture(e.pointerId); });
    this.cv.addEventListener('pointermove', e => { if (!dragging) return; const x = toX(e); this.targetX = clamp(this.targetX + (x - lastX) * 1.25 / (this.s0 || 1), ROAD_L + 14, ROAD_R - 14); lastX = x; });
    const up = () => dragging = false;
    this.cv.addEventListener('pointerup', up); this.cv.addEventListener('pointercancel', up);
    window.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') this.targetX = clamp(this.targetX - 40, ROAD_L + 14, ROAD_R - 14); if (e.key === 'ArrowRight') this.targetX = clamp(this.targetX + 40, ROAD_L + 14, ROAD_R - 14); });
  }

  // ---------- level generation ----------
  setupLevel(L, startSquad, up) {
    this.L = L; this.up = up; const info = levelInfo(L); this.info = info;
    this.squad = startSquad; this.peakSquad = startSquad; this.dist = 0; this.coins = 0; this.kills = 0;
    this.weapon = WEAPONS.RIFLE; this.fireCd = 0; this.items = []; this.bullets.length = 0; this.parts.length = 0; this.pops.length = 0; this.ghosts.length = 0; this.cfly.length = 0;
    this.boss = null; this.over = false; this.px = this.targetX = ROAD_C; this.endTimer = 0; this.biteCd = 0;
    const R = mulberry(L * 7919 + 13);
    const hpBase = 1.6 * Math.pow(1.2, L - 1);
    let at = 320, seg = 0;
    while (at < info.length - 250) {
      const prog = at / info.length;
      if (seg % 2 === 0) { this.items.push(this.makeGates(at, L, R)); }
      else {
        const n = Math.round((4 + L * 1.2) * (0.55 + 0.9 * prog) + R() * (2 + L * 0.5)); const rows = Math.ceil(n / 6);
        for (let i = 0; i < n; i++) {
          const row = Math.floor(i / 6), col = i % 6;
          let type = 'zombie';
          if (L >= 3 && prog > 0.3 && R() < 0.05 + Math.min(L, 30) * 0.004) type = 'brute'; else if (L >= 2 && R() < 0.18) type = 'runner';
          const hp = type === 'brute' ? hpBase * 9 : type === 'runner' ? hpBase * 0.7 : hpBase;
          this.items.push({ k: 'z', type, at: at + row * 34 + R() * 14, x: ROAD_L + 26 + col * 50 + R() * 16 - 8, hp, max: hp,
            r: type === 'brute' ? 19 : 11, sp: type === 'runner' ? 70 : type === 'brute' ? 22 : 38, bite: (type === 'brute' ? 4 : 1) * (1 + Math.floor(L / 6)), flash: 0, wob: R() * 6, v: R() < 0.5 ? 0 : 1 });
        }
        if (R() < 0.45) { const t = R() < 0.6 ? 'crate' : 'barrel'; this.items.push({ k: t, at: at - 90, x: ROAD_L + 40 + R() * (ROAD_R - ROAD_L - 80), hp: t === 'crate' ? 6 + L * 3.5 : 3 + L, max: t === 'crate' ? 6 + L * 3.5 : 3 + L, r: 16, flash: 0, pick: PICKUPS[Math.floor(R() * PICKUPS.length)] }); }
        at += rows * 34;
      }
      at += 250 + R() * 110; seg++;
    }
    if (info.boss) {
      const hp = 260 * Math.pow(1.22, L / 5) * L / 3;
      this.boss = { k: 'boss', at: info.length + 140, x: ROAD_C, hp, max: hp, r: 50, sp: 26, flash: 0, active: false };
    }
    this.finishAt = info.length;
  }
  makeGates(at, L, R) {
    const good = () => { const r = R(); if (r < 0.45) return { op: '+', v: Math.round(3 + R() * (4 + L * 1.5)) }; if (r < 0.75) return { op: 'x', v: R() < 0.8 ? 2 : 3 }; return { op: '+', v: Math.round(6 + L * 2) }; };
    const bad = () => { const r = R(); if (r < 0.6) return { op: '-', v: Math.round(2 + R() * (3 + L)) }; return { op: '÷', v: 2 }; };
    let a = good(), b = R() < 0.55 ? bad() : good();
    if (R() < 0.5) [a, b] = [b, a];
    return { k: 'g', at, L: a, R: b, done: false, hitL: 0, hitR: 0, need: 5 + Math.min(L, 20) * 0.5, cap: 12 + L * 2, flashL: 0, flashR: 0 };
  }

  start(L, startSquad, up) { this.setupLevel(L, startSquad, up); this.state = 'play'; }
  pause(v) { if (this.state === 'play' && v) this.state = 'paused'; else if (this.state === 'paused' && !v) { this.state = 'play'; this.last = performance.now(); } }

  // ---------- helpers ----------
  sy(at) { return this.PY - (at - this.dist); }
  squadR() { return 10 + Math.sqrt(Math.min(this.squad, 400)) * 4.2; }
  pop(x, y, txt, col = '#fff', size = 18) { if (this.pops.length > 40) this.pops.shift(); this.pops.push({ x, y, txt, col, size, t: 0 }); }
  burst(x, y, col, n = 8, sp = 160) { for (let i = 0; i < n && this.parts.length < 360; i++) { const a = Math.random() * 6.283, s = rnd(sp * 0.3, sp); this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.3, 0.7), t: 0, col, r: rnd(1.5, 3.5) }); } }
  addShake(v) { this.shake = Math.min(14, this.shake + v); }

  applyGate(g, side) {
    const o = g[side]; const before = this.squad; let s = this.squad;
    if (o.op === '+') s += o.v; else if (o.op === '-') s -= o.v; else if (o.op === 'x') s *= o.v; else s = Math.floor(s / o.v);
    s = Math.max(0, Math.min(s, 9999)); this.squad = s; this.peakSquad = Math.max(this.peakSquad, s);
    const goodG = s >= before;
    this.pop(this.px, this.PY - 40, (o.op === 'x' ? '×' : o.op) + o.v, goodG ? '#7CFC00' : '#ff4d4d', 34);
    this.burst(this.px, this.PY - 10, goodG ? '#7CFC00' : '#ff4d4d', 18, 240);
    if (goodG) { SFX.gateGood(); haptic('medium'); } else { SFX.gateBad(); haptic('warning'); this.addShake(6); }
    if (this.squad <= 0) this.lose();
  }
  killItem(it) {
    it.dead = true;
    if (it.k === 'z') {
      this.kills++; const c = (it.type === 'brute' ? 4 : 1) + Math.floor(this.L / 4); this.coins += c;
      const zn = ZIMG[it.type][it.v % ZIMG[it.type].length]; if (this.ghosts.length < 30) this.ghosts.push({ n: zn, fb: it.type, x: it.x, y: this.sy(it.at), h: ZH[it.type], t: 0 });
      if (this.cfly.length < 24) { this.P(it.x, this.sy(it.at)); this.cfly.push({ x: this._x, y: this._y - 20 * this._s, t: rnd(-0.05, 0) }); }
      this.burst(it.x, this.sy(it.at), '#6fbf4f', it.type === 'brute' ? 22 : 9, it.type === 'brute' ? 260 : 170);
      this.burst(it.x, this.sy(it.at), '#9b1c1c', 5, 120);
      if (it.type === 'brute') { this.addShake(5); this.pop(it.x, this.sy(it.at) - 20, '+' + c, '#ffd43b', 20); SFX.boom(); } else SFX.kill();
    } else if (it.k === 'crate') {
      const w = WEAPONS[it.pick]; this.weapon = w; SFX.power(); haptic('medium');
      this.pop(it.x, this.sy(it.at) - 10, w.name.toUpperCase() + '!', w.col, 28); this.burst(it.x, this.sy(it.at), '#c8913f', 16, 220);
      this.hooks.onWeapon && this.hooks.onWeapon(w.name);
    } else if (it.k === 'barrel') {
      const bx = it.x, by = this.sy(it.at); SFX.boom(); haptic('heavy'); this.addShake(10);
      this.burst(bx, by, '#ff9f1a', 30, 320); this.burst(bx, by, '#ffe066', 14, 200); this.burst(bx, by, '#555', 10, 120);
      this.pop(bx, by - 10, 'BOOM!', '#ff9f1a', 30);
      for (const z of this.items) if (!z.dead && z.k === 'z') { const dy = this.sy(z.at) - by, dx = z.x - bx; if (dx * dx + dy * dy < 110 * 110) { z.hp -= 40 + this.L * 12; if (z.hp <= 0) this.killItem(z); } }
    }
  }
  lose() { if (this.over) return; this.over = true; this.state = 'end'; SFX.lose(); haptic('error'); this.addShake(12); setTimeout(() => this.hooks.onEnd({ win: false, L: this.L, coins: this.coins, kills: this.kills, peak: this.peakSquad, progress: Math.min(1, this.dist / this.finishAt) }), 700); }
  win() { if (this.over) return; this.over = true; this.state = 'end'; SFX.win(); haptic('success'); const bonus = 30 + this.L * 10 + (this.info.boss ? 100 + this.L * 15 : 0) + Math.floor(this.squad / 2); this.coins += bonus; this.pop(ROAD_C, this.PY - 120, 'CLEARED!', '#ffd43b', 40); this.burst(ROAD_C, this.PY - 60, '#ffd43b', 40, 300); setTimeout(() => this.hooks.onEnd({ win: true, L: this.L, coins: this.coins, bonus, kills: this.kills, peak: this.peakSquad, squad: this.squad, progress: 1 }), 900); }

  // ---------- update ----------
  update(dt) {
    this.t += dt;
    for (const p of this.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    this.parts = this.parts.filter(p => p.t < p.life);
    for (const p of this.pops) { p.t += dt; p.y -= 40 * dt; }
    for (const g of this.ghosts) g.t += dt; if (this.ghosts.length) this.ghosts = this.ghosts.filter(g => g.t < 0.22);
    for (const f of this.cfly) f.t += dt; if (this.cfly.length) this.cfly = this.cfly.filter(f => f.t < 0.7);
    if (this.muz > 0) this.muz -= dt;
    this.pops = this.pops.filter(p => p.t < 1);
    this.shake *= Math.pow(0.02, dt);
    if (this.state !== 'play') return;

    if (AUTOPLAY) this.autopilot();
    this.px += (this.targetX - this.px) * Math.min(1, dt * 14);

    // scroll; stop before boss
    let speed = 125 + Math.min(this.L, 20) * 2;
    if (this.boss) { const bossY = this.sy(this.boss.at); if (bossY > -130) this.boss.active = true; if (bossY > 120) speed = 0; }
    this.dist += speed * dt;

    // firing
    const up = this.up; const w = this.weapon;
    const interval = 0.26 / (1 + 0.12 * (up.rate || 0)) / w.rate;
    const dmg = (1 + 0.2 * (up.dmg || 0)) * (w === WEAPONS.SHOTGUN ? 0.75 : w === WEAPONS.RAIL ? 1.6 : 1);
    this.fireCd -= dt;
    if (this.fireCd <= 0 && this.squad > 0) {
      this.fireCd += interval; if (this.fireCd < -interval) this.fireCd = 0;
      const shooters = Math.min(this.squad, 12); const per = dmg * Math.pow(this.squad / shooters, 0.5);
      const R = this.squadR(); const multi = w.multi || 1;
      for (let i = 0; i < shooters; i++) {
        const ox = shooters === 1 ? 0 : (i / (shooters - 1) - 0.5) * R * 1.6;
        for (let m = 0; m < multi; m++) {
          const a = -Math.PI / 2 + (multi > 1 ? (m - (multi - 1) / 2) * w.spread : rnd(-w.spread, w.spread));
          this.bullets.push({ x: this.px + ox, y: this.PY - 14 - Math.random() * 22, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, d: per, p: w.pierce, col: w.col, hit: null });
        }
      }
      SFX.shoot(); this.muz = 0.05;
    }

    // bullets
    const top = -40;
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < top || b.x < 0 || b.x > W) { b.dead = true; continue; }
      for (const it of this.items) {
        if (it.dead || it.done && it.k === 'g') continue;
        const y = this.sy(it.at); if (y < -30 || y > this.H) continue;
        if (it.k === 'g') {
          if (Math.abs(b.y - y) < 14) { const side = b.x < ROAD_C ? 'L' : 'R'; const o = it[side];
            if ((o.op === '+' || o.op === '-') && (o.grown || 0) < it.cap) { it['hit' + side] += 1; if (it['hit' + side] >= it.need) { it['hit' + side] = 0; o.grown = (o.grown || 0) + 1; if (o.op === '+') o.v++; else { o.v--; if (o.v <= 0) { o.op = '+'; o.v = 1; } } it['flash' + side] = 0.15; } }
            b.dead = true; break; }
          continue;
        }
        if (b.hit === it) continue;
        const dx = b.x - it.x, dy = b.y - y;
        if (dx * dx + dy * dy < (it.r + 4) * (it.r + 4)) {
          it.hp -= b.d; it.flash = 0.08; b.hit = it; SFX.hit();
          if (it.hp <= 0) this.killItem(it);
          if (--b.p <= 0) { b.dead = true; break; }
        }
      }
      if (!b.dead && this.boss && this.boss.active && !this.boss.dead) {
        const bo = this.boss, y = this.sy(bo.at); const dx = b.x - bo.x, dy = b.y - y;
        if (dx * dx + dy * dy < bo.r * bo.r) { bo.hp -= b.d; bo.flash = 0.06; b.dead = true; if (Math.random() < 0.15) this.burst(b.x, b.y, '#6e9b4f', 2, 90);
          if (bo.hp <= 0) { bo.dead = true; this.addShake(14); haptic('heavy'); SFX.boom(); this.burst(bo.x, y, '#6e9b4f', 60, 380); this.ghosts.push({ n: 'boss', fb: 'boss', x: bo.x, y, h: 200, t: 0 }); this.burst(bo.x, y, '#ffde3b', 30, 260); this.kills++; this.win(); } }
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead);

    // items: zombies walk, gates trigger, collisions
    const sr = this.squadR();
    for (const it of this.items) {
      if (it.dead) continue;
      if (it.flash > 0) it.flash -= dt;
      const y = this.sy(it.at);
      if (it.k === 'z') {
        if (y > -40) { it.at -= it.sp * dt; it.x += clamp(this.px - it.x, -1, 1) * it.sp * 0.35 * dt; it.x = clamp(it.x, ROAD_L + 8, ROAD_R - 8); }
        if (Math.abs(y - this.PY) < sr * 0.7 + it.r && Math.abs(it.x - this.px) < sr + it.r) {
          it.dead = true; this.squad = Math.max(0, this.squad - it.bite); SFX.bite(); haptic('rigid'); this.addShake(it.bite * 2.5);
          this.pop(this.px + rnd(-20, 20), this.PY - 30, '-' + it.bite, '#ff4d4d', 22); this.burst(this.px, this.PY, '#c0392b', 8, 160);
          if (this.squad <= 0) { this.lose(); return; }
        } else if (y > this.H + 40) it.dead = true;
      } else if (it.k === 'g') {
        if (it.flashL > 0) it.flashL -= dt; if (it.flashR > 0) it.flashR -= dt;
        if (!it.done && y >= this.PY) { it.done = true; this.applyGate(it, this.px < ROAD_C ? 'L' : 'R'); if (this.over) return; }
        if (y > this.H + 60) it.dead = true;
      } else {
        if (Math.abs(y - this.PY) < sr * 0.6 + it.r && Math.abs(it.x - this.px) < sr * 0.8 + it.r) { // ran into it
          if (it.k === 'barrel') { this.killItem(it); this.squad = Math.max(0, this.squad - 3); this.pop(this.px, this.PY - 30, '-3', '#ff4d4d', 22); if (this.squad <= 0) { this.lose(); return; } }
          else { it.dead = true; this.burst(it.x, y, '#c8913f', 10, 160); }
        } else if (y > this.H + 40) it.dead = true;
      }
    }
    if (this.items.length > 200) this.items = this.items.filter(i => !i.dead);

    // boss
    const bo = this.boss;
    if (bo && bo.active && !bo.dead) {
      if (bo.flash > 0) bo.flash -= dt;
      bo.x += Math.sin(this.t * 0.9) * 30 * dt;
      const y = this.sy(bo.at);
      if (y < this.PY - sr - 40) bo.at -= bo.sp * dt;
      else { this.biteCd -= dt; if (this.biteCd <= 0) { this.biteCd = 0.35; const b = Math.max(1, Math.ceil(this.squad * 0.08)); this.squad -= b; SFX.bite(); haptic('heavy'); this.addShake(5); this.pop(this.px, this.PY - 40, '-' + b, '#ff4d4d', 24); if (this.squad <= 0) { this.squad = 0; this.lose(); return; } } }
    } else if (!this.boss && this.dist >= this.finishAt) this.win();
  }

  autopilot() {
    // simple bot for screenshots / X clips: pick the better upcoming gate, otherwise hug the biggest threat.
    let best = null;
    for (const it of this.items) { if (it.dead || it.k !== 'g' || it.done) continue; const y = this.sy(it.at); if (y < this.PY && y > -200) { best = it; break; } }
    if (best) {
      const val = o => o.op === '+' ? this.squad + o.v : o.op === '-' ? this.squad - o.v : o.op === 'x' ? this.squad * o.v : this.squad / o.v;
      this.targetX = val(best.L) >= val(best.R) ? ROAD_C - 70 : ROAD_C + 70;
    } else {
      let zx = 0, n = 0; for (const it of this.items) if (!it.dead && it.k === 'z') { const y = this.sy(it.at); if (y > 0 && y < this.PY) { zx += it.x; n++; } }
      this.targetX = n ? clamp(zx / n, ROAD_L + 30, ROAD_R - 30) : ROAD_C + Math.sin(this.t) * 60;
    }
  }

  // ---------- render (v2: sprites + perspective) ----------
  // project world point (x, screen-space world y) -> this._x, this._y, this._s
  P(x, wy) { let z = this.PY - wy; if (z < -D * 0.7) z = -D * 0.7; const s = this.s0 * D / (D + z); this._s = s; this._x = ROAD_C + (x - ROAD_C) * s; this._y = this.hY + HALF * s / K; }
  base() { const b = this.bs; this.ctx.setTransform(b, 0, 0, b, b * this.shx, b * this.shy); }
  // draw a sprite anchored at its feet. name = IMG key, fb = procedural fallback canvas
  spr(name, fb, X, Y, h, rot = 0, sq = 0, flash = 0, alpha = 1) {
    const c = this.ctx, e = IMG[name], b = this.bs; let img, w;
    if (e) { img = pick(e, h * b); w = h * e.aspect; } else if (fb) { img = fb; w = h * fb.width / fb.height; } else return 0;
    const co = Math.cos(rot), si = Math.sin(rot), sx = 1 + sq, sy = 1 - sq;
    c.setTransform(b * co * sx, b * si * sx, -b * si * sy, b * co * sy, b * (X + this.shx), b * (Y + this.shy));
    if (alpha < 1) c.globalAlpha = alpha;
    c.drawImage(img, -w / 2, -h, w, h);
    if (flash > 0) { c.globalAlpha = Math.min(1, flash * 14) * 0.9 * alpha; c.drawImage(e && e.white ? pick(e, h * b, true) : img, -w / 2, -h, w, h); }
    c.globalAlpha = 1;
    return w;
  }
  drawBg(c) {
    const H = this.H, b = this.bs;
    if (!this.bg || this.bgHas !== !!BG) {
      this.bgHas = !!BG;
      const cv = document.createElement('canvas'); cv.width = this.cv.width; cv.height = this.cv.height; const x = cv.getContext('2d'); x.scale(b, b);
      if (BG) x.drawImage(BG, this.bgX, this.bgY, this.bgW, this.bgH);
      else {
        const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a5f8a'); g.addColorStop(0.4, '#1e4f7a'); g.addColorStop(1, '#0d2a44'); x.fillStyle = g; x.fillRect(0, 0, W, H);
        x.fillStyle = '#3d3d44'; x.beginPath(); x.moveTo(ROAD_C, this.hY); x.lineTo(ROAD_C + HALF * 3, this.hY + HALF * 3 / K); x.lineTo(ROAD_C - HALF * 3, this.hY + HALF * 3 / K); x.fill();
      }
      // gritty grade: warm smoke haze near the skyline + vignette
      const hz = x.createLinearGradient(0, this.hY - 80, 0, this.hY + 60); hz.addColorStop(0, 'rgba(70,40,30,0)'); hz.addColorStop(0.6, 'rgba(70,45,35,.18)'); hz.addColorStop(1, 'rgba(70,45,35,0)'); x.fillStyle = hz; x.fillRect(0, this.hY - 80, W, 140);
      const v = x.createRadialGradient(W / 2, H * 0.55, H * 0.25, W / 2, H * 0.55, H * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(10,5,0,.45)'); x.fillStyle = v; x.fillRect(0, 0, W, H);
      this.bg = cv;
    }
    c.setTransform(1, 0, 0, 1, b * this.shx, b * this.shy); c.drawImage(this.bg, 0, 0); this.base();
    // scrolling road detail so the deck moves: centre dashes + expansion joints, in perspective
    const step = 70, far = this.PY + 80; const m0 = Math.floor(this.dist / step);
    c.fillStyle = 'rgba(255,255,255,.55)';
    for (let m = m0; m < m0 + Math.ceil(far / step) + 2; m++) {
      const wy = this.PY - (m * step - this.dist); if (wy > H + 300) continue;
      this.P(ROAD_C, wy); const x1 = this._x, y1 = this._y, s1 = this._s; if (y1 < this.hY + 2) continue;
      this.P(ROAD_C, wy - 32); const y2 = this._y, s2 = this._s;
      c.beginPath(); c.moveTo(x1 - 3 * s1, y1); c.lineTo(x1 + 3 * s1, y1); c.lineTo(x1 + 3 * s2, y2); c.lineTo(x1 - 3 * s2, y2); c.fill();
      if (m % 3 === 0) { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(ROAD_C - HALF * s1, y1, HALF * 2 * s1, Math.max(1, 2.2 * s1)); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(ROAD_C - HALF * s1, y1 + 2.2 * s1, HALF * 2 * s1, Math.max(0.5, s1)); c.fillStyle = 'rgba(255,255,255,.55)'; }
    }
    // finish line
    if (!this.boss) { const fy = this.sy(this.finishAt); if (fy > -60 && fy < H + 100) { for (let j = 0; j < 2; j++) { this.P(ROAD_C, fy + j * 12); const ya = this._y, sa = this._s; this.P(ROAD_C, fy + j * 12 + 12); const yb = this._y; for (let i = 0; i < 16; i++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#111'; c.fillRect(ROAD_C + (ROAD_L + i * 19 - ROAD_C) * sa, ya, 19 * sa + 0.5, yb - ya + 0.5); } } } }
  }
  drawGate(it, y) {
    const c = this.ctx; const fade = this.farFade(y); if (fade <= 0) return;
    for (const side of ['L', 'R']) {
      const o = it[side]; const good = o.op === '+' || o.op === 'x';
      const cx = (side === 'L' ? ROAD_L : ROAD_C) + HALF / 2; this.P(cx, y); const X = this._x, Y = this._y, s = this._s;
      const pw = (HALF - 6) * s, ph = pw * 0.6; const a = (it.done ? Math.max(0, 0.3 - (y - this.PY) / 150) : 1) * fade; if (a <= 0.01) continue;
      const e = IMG[good ? 'gate_blue' : 'gate_red'];
      this.base(); c.globalAlpha = a;
      if (e) c.drawImage(pick(e, ph * this.bs), X - pw / 2, Y - ph, pw, ph);
      else { c.fillStyle = good ? 'rgba(60,140,255,.5)' : 'rgba(231,76,60,.5)'; c.fillRect(X - pw / 2, Y - ph, pw, ph); c.strokeStyle = '#ccd'; c.lineWidth = 4 * s; c.strokeRect(X - pw / 2, Y - ph, pw, ph); }
      if (it['flash' + side] > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * 0.6; c.fillStyle = good ? '#4aa3ff' : '#ff4a4a'; c.fillRect(X - pw * 0.42, Y - ph * 0.85, pw * 0.84, ph * 0.7); c.globalCompositeOperation = 'source-over'; }
      // glowing number + people icon
      const txt = (o.op === 'x' ? '×' : o.op) + o.v; const fs = Math.max(9, 30 * s) | 0;
      c.font = `900 ${fs}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const iconH = fs * 0.95, tw = c.measureText(txt).width, tot = tw + iconH * 0.62, tx = X - tot / 2 + iconH * 0.62 + tw / 2, ty = Y - ph * 0.5;
      c.globalAlpha = a;
      c.shadowColor = good ? '#38b6ff' : '#ff3030'; c.shadowBlur = 14 * s * this.bs;
      c.lineWidth = Math.max(2, 5 * s); c.strokeStyle = good ? '#0b3d91' : '#7a0a0a'; c.strokeText(txt, tx, ty);
      c.fillStyle = '#fff'; c.fillText(txt, tx, ty); c.shadowBlur = 0;
      this.spr('soldier', SPR.soldier, X - tot / 2 + iconH * 0.3, ty + iconH * 0.5, iconH, 0, 0, 0, a);
      this.base(); c.globalAlpha = 1;
    }
  }
  farFade(wy) { const z = this.PY - wy, zmax = this.PY + 50; return z < zmax - 90 ? 1 : Math.max(0, (zmax - z) / 90); }
  render() {
    const c = this.ctx, H = this.H;
    this.shx = (Math.random() - 0.5) * this.shake; this.shy = (Math.random() - 0.5) * this.shake;
    this.base(); c.imageSmoothingEnabled = true;
    this.drawBg(c);
    // collect visible world entities, draw far -> near
    const dl = this.dl; dl.length = 0;
    for (const it of this.items) { if (it.dead) continue; const y = this.sy(it.at); if (y < -60 || y > H + 60) continue; it.yy = y; dl.push(it); }
    const bo = this.boss; if (bo && !bo.dead) { const y = this.sy(bo.at); if (y > -130) { bo.yy = y; dl.push(bo); } }
    dl.sort((a, b) => a.yy - b.yy);
    // shadows pass (one transform, cheap)
    this.base();
    for (const it of dl) { if (it.k === 'g') continue; this.P(it.x, it.yy); const w = (it.k === 'boss' ? 140 : it.k === 'z' ? (it.type === 'brute' ? 62 : 36) : 40) * this._s; c.globalAlpha = this.farFade(it.yy); c.drawImage(SPR.shadow, this._x - w / 2, this._y - w * 0.16, w, w * 0.32); }
    c.globalAlpha = 1;
    const t = this.t;
    for (const it of dl) {
      const y = it.yy;
      if (it.k === 'g') { this.drawGate(it, y); continue; }
      this.P(it.x, y); const X = this._x, Y = this._y, s = this._s, fade = this.farFade(y);
      if (it.k === 'z') {
        const ph = t * (it.type === 'runner' ? 14 : it.type === 'brute' ? 6 : 9) + it.wob;
        const h = ZH[it.type] * s, n = ZIMG[it.type][it.v % ZIMG[it.type].length];
        const bob = Math.abs(Math.sin(ph)) * 2.5 * s;
        this.spr(n, SPR[it.type], X, Y - bob, h, Math.sin(ph) * 0.09, Math.sin(ph * 2) * 0.04, it.flash, fade);
        if (it.type === 'brute' && it.hp < it.max) { this.base(); const bw = 36 * s; c.fillStyle = '#300'; c.fillRect(X - bw / 2, Y - h - 6 * s, bw, 4 * s); c.fillStyle = '#ff4d4d'; c.fillRect(X - bw / 2, Y - h - 6 * s, bw * it.hp / it.max, 4 * s); }
      } else if (it.k === 'boss') {
        const sc = 1 + Math.sin(t * 4) * 0.03, h = 200 * s * sc;
        this.spr('boss', SPR.boss, X, Y, h, Math.sin(t * 2) * 0.05, Math.sin(t * 4) * 0.03, it.flash, 1);
      } else {
        const isC = it.k === 'crate', h = (isC ? 48 : 44) * s;
        this.spr(isC ? 'crate' : 'barrel', isC ? SPR.crate : SPR.barrel, X, Y, h, 0, 0, it.flash, fade);
        this.base();
        if (isC) { const w = WEAPONS[it.pick]; c.font = `900 ${Math.max(8, 13 * s) | 0}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = '#000a'; c.strokeText(w.name.toUpperCase(), X, Y - h - 9 * s); c.fillStyle = w.col; c.fillText(w.name.toUpperCase(), X, Y - h - 9 * s);
          const bw = 32 * s; c.fillStyle = '#222'; c.fillRect(X - bw / 2, Y + 3 * s, bw, 4 * s); c.fillStyle = '#ffd43b'; c.fillRect(X - bw / 2, Y + 3 * s, bw * Math.max(0, it.hp) / it.max, 4 * s); }
      }
    }
    // death pops (white silhouette expanding + fading)
    for (const g of this.ghosts) { this.P(g.x, g.y); const k = g.t / 0.22; this.spr(g.n, SPR[g.fb], this._x, this._y, g.h * this._s * (1 + k * 0.5), 0, 0, 1, 1 - k); }
    // bullets: two batched strokes (glow + core), additive
    this.base();
    if (this.bullets.length) {
      c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.beginPath();
      for (const b of this.bullets) { this.P(b.x, b.y); c.moveTo(this._x, this._y - 10 * this._s); this.P(b.x - b.vx * 0.03, b.y - b.vy * 0.03); c.lineTo(this._x, this._y - 10 * this._s); }
      c.strokeStyle = this.weapon.col; c.globalAlpha = 0.35; c.lineWidth = 4.5; c.stroke();
      c.strokeStyle = this.weapon.col; c.globalAlpha = 1; c.lineWidth = 1.6; c.stroke();
      c.globalCompositeOperation = 'source-over';
    }
    // squad: sandbag wall, turret, soldiers
    if (this.squad > 0) {
      const R = this.squadR(); const n = Math.min(this.squad, 60);
      this.P(this.px, this.PY - R * 0.55 - 12); const sw = Math.max(120, R * 2.7) * this._s;
      const se = IMG.sandbags; this.base();
      if (se) c.drawImage(pick(se, sw / se.aspect * this.bs), this._x - sw / 2, this._y - sw / se.aspect * 0.8, sw, sw / se.aspect);
      else { c.fillStyle = '#b8935a'; c.fillRect(this._x - sw / 2, this._y - 14, sw, 16); }
      this.P(this.px, this.PY - R * 0.55 + 2); const tx = this._x, ty = this._y, ts = this._s, th = 66 * ts;
      const recoil = this.muz > 0 ? 2 * ts : 0;
      this.spr('turret', null, tx, ty + recoil, th);
      if (!IMG.turret) { this.base(); c.fillStyle = '#2f6fe0'; c.beginPath(); c.arc(tx, ty - th * 0.3, th * 0.3, 0, 7); c.fill(); c.fillRect(tx - 5, ty - th, 10, th * 0.6); }
      const pts = this._pts || (this._pts = []); pts.length = 0;
      for (let i = 0; i < n; i++) {
        const r = n === 1 ? 0 : (R * 0.25 + R * Math.sqrt(i / n) * 0.85), a = i * 2.39996 + 0.6;
        let wx = this.px + Math.cos(a) * r, wy = this.PY + 6 + Math.abs(Math.sin(a)) * r * 0.55;
        if (n === 1) { wx = this.px + 24; }
        pts.push(wx, wy, i);
      }
      // near soldiers last
      const order = this._ord || (this._ord = []); order.length = 0; for (let i = 0; i < n; i++) order.push(i);
      order.sort((a, b) => pts[a * 3 + 1] - pts[b * 3 + 1]);
      const fl = this.muz > 0;
      for (const i of order) {
        this.P(pts[i * 3], pts[i * 3 + 1]); const h = 40 * this._s, bob = Math.sin(t * 14 + i) * 0.8 * this._s;
        const w = this.spr('soldier', SPR.soldier, this._x, this._y + bob, h);
        if (fl && i % 3 === 0 && IMG.flash) { this.base(); c.globalCompositeOperation = 'lighter'; const fz = 14 * this._s; c.drawImage(pick(IMG.flash, fz * this.bs), this._x + w * 0.32 - fz / 2, this._y - h * 0.82 - fz / 2, fz, fz); c.globalCompositeOperation = 'source-over'; }
      }
      if (fl) { this.base(); c.globalCompositeOperation = 'lighter'; const fz = 34 * ts; if (IMG.flash) c.drawImage(pick(IMG.flash, fz * this.bs), tx - fz / 2, ty - th - fz * 0.55, fz, fz); else { c.fillStyle = '#ffe066'; c.beginPath(); c.arc(tx, ty - th, fz / 3, 0, 7); c.fill(); } c.globalCompositeOperation = 'source-over'; }
      // squad count badge (glossy)
      this.base(); this.P(this.px, this.PY + R * 0.55 + 30); const by = Math.min(this._y, H - 24);
      c.font = '900 22px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const txt = fmt(this.squad), bw = 30 + txt.length * 13, bx = this.px - bw / 2;
      const gr = c.createLinearGradient(0, by - 15, 0, by + 15); gr.addColorStop(0, '#5ab8ff'); gr.addColorStop(0.5, '#1f7be0'); gr.addColorStop(1, '#0f4fa8');
      c.fillStyle = '#062a5c'; rr(c, bx - 2, by - 16, bw + 4, 34, 15); c.fill();
      c.fillStyle = gr; rr(c, bx, by - 15, bw, 30, 13); c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)'; rr(c, bx + 4, by - 13, bw - 8, 10, 6); c.fill();
      c.lineWidth = 4; c.strokeStyle = '#062a5c'; c.strokeText(txt, this.px + 6, by + 1); c.fillStyle = '#fff'; c.fillText(txt, this.px + 6, by + 1);
      this.spr('soldier', SPR.soldier, bx + 13, by + 10, 20); this.base();
    }
    // particles (projected)
    for (const p of this.parts) { this.P(p.x, p.y); const r = p.r * this._s * 1.3; c.globalAlpha = 1 - p.t / p.life; c.fillStyle = p.col; c.fillRect(this._x - r, this._y - r - 12 * this._s, r * 2, r * 2); }
    c.globalAlpha = 1;
    // coins flying to the HUD
    for (const f of this.cfly) { if (f.t < 0) continue; const k = Math.min(1, f.t / 0.7), e = k * k * (3 - 2 * k); const x = f.x + (W - 56 - f.x) * e, y = f.y + (22 - f.y) * e - Math.sin(k * Math.PI) * 50; this.spr('coin', null, x, y + 9, 18 - 6 * k); }
    this.base();
    // boss HP bar
    if (bo && !bo.dead && bo.yy > -130) {
      const bw = ROAD_R - ROAD_L - 20, bx = ROAD_L + 10, by = 128;
      c.fillStyle = '#1a0505'; rr(c, bx - 3, by - 3, bw + 6, 20, 9); c.fill();
      const g = c.createLinearGradient(0, by, 0, by + 14); g.addColorStop(0, '#ff7a6b'); g.addColorStop(1, '#c0261a');
      c.fillStyle = g; rr(c, bx, by, Math.max(6, bw * Math.max(0, bo.hp) / bo.max), 14, 7); c.fill();
      c.font = '900 14px system-ui'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = '#000'; c.strokeText('☠ BRIDGE BOSS', ROAD_C, by - 12); c.fillStyle = '#fff'; c.fillText('☠ BRIDGE BOSS', ROAD_C, by - 12);
    }
    // number pops
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const p of this.pops) {
      this.P(p.x, p.y); const ds = clamp(this._s, 0.7, 1.3);
      const k = p.t < 0.12 ? p.t / 0.12 : 1; const sz = p.size * ds * (0.6 + 0.6 * k - 0.2 * Math.max(0, p.t - 0.12));
      c.globalAlpha = 1 - Math.max(0, p.t - 0.6) / 0.4; c.font = `900 ${sz | 0}px system-ui,sans-serif`;
      c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(p.txt, this._x, this._y); c.fillStyle = p.col; c.fillText(p.txt, this._x, this._y);
    }
    c.globalAlpha = 1;
  }
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    try { this.update(dt); this.render(); } catch (e) { console.error(e); }
    this.frames++; if (now - this.fpsT0 >= 1000) { this.fps = this.frames * 1000 / (now - this.fpsT0); this.frames = 0; this.fpsT0 = now; }
    if (this.hooks.onTick && this.state === 'play') this.hooks.onTick(this);
    requestAnimationFrame(this.loop);
  }
}

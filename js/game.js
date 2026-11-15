// Deadspan — zombie bridge runner. Plain canvas, no dependencies, procedural art.
import { AUTOPLAY } from './config.js';
import { haptic } from './platform.js';
import { SFX } from './audio.js';

const W = 400;
const ROAD_L = 48, ROAD_R = 352, ROAD_C = 200;
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
    this.parts = []; this.pops = []; this.bullets = [];
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
    this.bg = null;
  }
  bindInput() {
    let dragging = false, lastX = 0;
    const toX = e => { const r = this.cv.getBoundingClientRect(); return (e.clientX - r.left) / r.width * W; };
    this.cv.addEventListener('pointerdown', e => { dragging = true; lastX = toX(e); this.cv.setPointerCapture && this.cv.setPointerCapture(e.pointerId); });
    this.cv.addEventListener('pointermove', e => { if (!dragging) return; const x = toX(e); this.targetX = clamp(this.targetX + (x - lastX) * 1.25, ROAD_L + 14, ROAD_R - 14); lastX = x; });
    const up = () => dragging = false;
    this.cv.addEventListener('pointerup', up); this.cv.addEventListener('pointercancel', up);
    window.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') this.targetX = clamp(this.targetX - 40, ROAD_L + 14, ROAD_R - 14); if (e.key === 'ArrowRight') this.targetX = clamp(this.targetX + 40, ROAD_L + 14, ROAD_R - 14); });
  }

  // ---------- level generation ----------
  setupLevel(L, startSquad, up) {
    this.L = L; this.up = up; const info = levelInfo(L); this.info = info;
    this.squad = startSquad; this.peakSquad = startSquad; this.dist = 0; this.coins = 0; this.kills = 0;
    this.weapon = WEAPONS.RIFLE; this.fireCd = 0; this.items = []; this.bullets.length = 0; this.parts.length = 0; this.pops.length = 0;
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
            r: type === 'brute' ? 19 : 11, sp: type === 'runner' ? 70 : type === 'brute' ? 22 : 38, bite: (type === 'brute' ? 4 : 1) * (1 + Math.floor(L / 6)), flash: 0, wob: R() * 6 });
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
          this.bullets.push({ x: this.px + ox, y: this.PY - 14, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, d: per, p: w.pierce, col: w.col, hit: null });
        }
      }
      SFX.shoot();
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
          if (bo.hp <= 0) { bo.dead = true; this.addShake(14); haptic('heavy'); SFX.boom(); this.burst(bo.x, y, '#6e9b4f', 60, 380); this.burst(bo.x, y, '#ffde3b', 30, 260); this.kills++; this.win(); } }
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

  // ---------- render ----------
  drawBg(c) {
    const H = this.H;
    if (!this.bg) {
      this.bg = mk(W, H, x => {
        const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1d2b3a'); g.addColorStop(1, '#0d1620'); x.fillStyle = g; x.fillRect(0, 0, W, H);
        const r = x.createLinearGradient(ROAD_L, 0, ROAD_R, 0); r.addColorStop(0, '#3a3a40'); r.addColorStop(0.5, '#4a4a52'); r.addColorStop(1, '#3a3a40');
        x.fillStyle = r; x.fillRect(ROAD_L, 0, ROAD_R - ROAD_L, H);
        x.fillStyle = '#6b6b75'; x.fillRect(ROAD_L - 8, 0, 8, H); x.fillRect(ROAD_R, 0, 8, H);
        // vignette top (fog)
        const f = x.createLinearGradient(0, 0, 0, 220); f.addColorStop(0, 'rgba(20,18,28,1)'); f.addColorStop(1, 'rgba(20,18,28,0)'); x.fillStyle = f; x.fillRect(0, 0, W, 220);
      }, this.dpr);
    }
    c.drawImage(this.bg, 0, 0, W, H);
    // scrolling details
    const off = this.dist % 80;
    c.fillStyle = 'rgba(255,255,255,.07)';
    for (let y = -80 + off; y < H; y += 80) { c.fillRect(ROAD_C - 3, y, 6, 40); }
    c.fillStyle = '#88888f';
    for (let y = -60 + (this.dist % 60); y < H; y += 60) { c.fillRect(ROAD_L - 12, y, 12, 6); c.fillRect(ROAD_R, y, 12, 6); }
    c.strokeStyle = 'rgba(120,170,220,.12)'; c.lineWidth = 2;
    for (let y = -40 + (this.dist * 0.5 % 40); y < H; y += 40) { c.beginPath(); c.moveTo(6, y); c.lineTo(26, y + 6); c.moveTo(374, y + 14); c.lineTo(394, y + 20); c.stroke(); }
    // finish line
    if (!this.boss) { const fy = this.sy(this.finishAt); if (fy > -20 && fy < H) { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#111'; c.fillRect(ROAD_L + i * 19, fy + j * 10, 19, 10); } } }
  }
  render() {
    const c = this.ctx, H = this.H;
    c.setTransform(this.cv.width / W, 0, 0, this.cv.height / H, 0, 0);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    c.translate(sx, sy);
    this.drawBg(c);

    // gates
    for (const it of this.items) {
      if (it.dead || it.k !== 'g') continue; const y = this.sy(it.at); if (y < -60 || y > H + 40) continue;
      for (const side of ['L', 'R']) {
        const o = it[side]; const good = o.op === '+' || o.op === 'x'; const x0 = side === 'L' ? ROAD_L : ROAD_C, w = ROAD_C - ROAD_L;
        const a = it.done ? 0.25 : 1; c.globalAlpha = a;
        c.fillStyle = good ? 'rgba(46,204,113,.45)' : 'rgba(231,76,60,.45)'; if (it['flash' + side] > 0) c.fillStyle = 'rgba(255,255,255,.7)';
        c.fillRect(x0 + 3, y - 18, w - 6, 36);
        c.fillStyle = good ? '#2ecc71' : '#e74c3c'; c.fillRect(x0 + 3, y - 22, w - 6, 5); c.fillRect(x0 + 3, y - 22, 5, 40); c.fillRect(x0 + w - 8, y - 22, 5, 40);
        c.fillStyle = '#fff'; c.font = '900 26px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.6)'; const txt = (o.op === 'x' ? '×' : o.op) + o.v;
        c.strokeText(txt, x0 + w / 2, y + 1); c.fillText(txt, x0 + w / 2, y + 1);
        c.globalAlpha = 1;
      }
    }
    // props + zombies (sorted by y implicitly by at order is fine)
    for (const it of this.items) {
      if (it.dead || it.k === 'g') continue; const y = this.sy(it.at); if (y < -50 || y > H + 50) continue;
      if (it.k === 'z') {
        const s = it.type === 'brute' ? SPR.brute : it.type === 'runner' ? SPR.runner : SPR.zombie;
        const w = it.type === 'brute' ? 40 : it.type === 'runner' ? 22 : 24, h = w * 1.25;
        const bob = Math.sin(this.t * 8 + it.wob) * 1.5;
        c.drawImage(s, it.x - w / 2, y - h / 2 + bob, w, h);
        if (it.flash > 0) { c.globalAlpha = 0.6; c.fillStyle = '#fff'; c.beginPath(); c.arc(it.x, y - 2, w * 0.4, 0, 7); c.fill(); c.globalAlpha = 1; }
        if (it.type === 'brute' && it.hp < it.max) { c.fillStyle = '#300'; c.fillRect(it.x - 18, y - 32, 36, 4); c.fillStyle = '#e74c3c'; c.fillRect(it.x - 18, y - 32, 36 * it.hp / it.max, 4); }
      } else {
        const s = it.k === 'crate' ? SPR.crate : SPR.barrel; const w = it.k === 'crate' ? 34 : 26, h = it.k === 'crate' ? 34 : 32;
        c.drawImage(s, it.x - w / 2, y - h / 2, w, h);
        if (it.flash > 0) { c.globalAlpha = 0.5; c.fillStyle = '#fff'; c.fillRect(it.x - w / 2, y - h / 2, w, h); c.globalAlpha = 1; }
        if (it.k === 'crate') { c.fillStyle = WEAPONS[it.pick].col; c.font = '800 10px system-ui'; c.textAlign = 'center'; c.fillText(WEAPONS[it.pick].name.toUpperCase(), it.x, y - 24); c.fillStyle = '#222'; c.fillRect(it.x - 15, y + 20, 30, 4); c.fillStyle = '#ffd43b'; c.fillRect(it.x - 15, y + 20, 30 * Math.max(0, it.hp) / it.max, 4); }
      }
    }
    // boss
    const bo = this.boss;
    if (bo && !bo.dead) {
      const y = this.sy(bo.at);
      if (y > -130) {
        const sc = 1 + Math.sin(this.t * 4) * 0.03;
        c.drawImage(SPR.boss, bo.x - 55 * sc, y - 60 * sc, 110 * sc, 120 * sc);
        if (bo.flash > 0) { c.globalAlpha = 0.4; c.fillStyle = '#fff'; c.beginPath(); c.arc(bo.x, y, 50, 0, 7); c.fill(); c.globalAlpha = 1; }
        c.fillStyle = '#300'; c.fillRect(ROAD_L + 10, 70, ROAD_R - ROAD_L - 20, 12); c.fillStyle = '#e74c3c'; c.fillRect(ROAD_L + 10, 70, (ROAD_R - ROAD_L - 20) * Math.max(0, bo.hp) / bo.max, 12);
        c.fillStyle = '#fff'; c.font = '800 12px system-ui'; c.textAlign = 'center'; c.fillText('BRIDGE BOSS', ROAD_C, 62);
      }
    }
    // bullets
    c.lineWidth = 3; c.lineCap = 'round';
    for (const b of this.bullets) { c.strokeStyle = b.col; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014); c.stroke(); }
    // squad
    if (this.squad > 0 && !(this.over && this.state === 'end' && this.squad <= 0)) {
      const n = Math.min(this.squad, 60); const R = this.squadR();
      for (let i = 0; i < n; i++) {
        const r = n === 1 ? 0 : R * Math.sqrt(i / n) * 0.9, a = i * 2.39996;
        const x = this.px + Math.cos(a) * r, y = this.PY + Math.sin(a) * r * 0.55 + Math.sin(this.t * 14 + i) * 1;
        c.drawImage(SPR.soldier, x - 10, y - 13, 20, 26);
      }
      // squad count badge
      c.font = '900 22px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const bw = 18 + String(fmt(this.squad)).length * 13;
      c.fillStyle = 'rgba(20,20,30,.85)'; c.beginPath(); c.roundRect ? c.roundRect(this.px - bw / 2, this.PY + R * 0.55 + 14, bw, 28, 14) : c.rect(this.px - bw / 2, this.PY + R * 0.55 + 14, bw, 28); c.fill();
      c.fillStyle = '#4dabf7'; c.fillText(fmt(this.squad), this.px, this.PY + R * 0.55 + 29);
    }
    // particles
    for (const p of this.parts) { c.globalAlpha = 1 - p.t / p.life; c.fillStyle = p.col; c.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
    c.globalAlpha = 1;
    // pops
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const p of this.pops) {
      const k = p.t < 0.12 ? p.t / 0.12 : 1; const s = p.size * (0.6 + 0.6 * k - 0.2 * Math.max(0, p.t - 0.12));
      c.globalAlpha = 1 - Math.max(0, p.t - 0.6) / 0.4; c.font = `900 ${s | 0}px system-ui,sans-serif`;
      c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,.7)'; c.strokeText(p.txt, p.x, p.y); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y);
    }
    c.globalAlpha = 1;
  }
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    try { this.update(dt); this.render(); } catch (e) { console.error(e); }
    if (this.hooks.onTick && this.state === 'play') this.hooks.onTick(this);
    requestAnimationFrame(this.loop);
  }
}

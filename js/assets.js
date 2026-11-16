// Deadspan art loader: fetches the WebP sprites, pre-scales them into offscreen canvases (mip levels)
// and builds white silhouettes for hit flashes. If anything fails the game falls back to procedural shapes.
export const VERSION = 'v3';
const LIST = ['bg', 'zombie1', 'zombie2', 'runner', 'brute', 'boss', 'soldier', 'turret', 'sandbags', 'coin', 'crate', 'barrel', 'flash', 'gate_blue', 'gate_red'];
// max on-screen height (CSS px) we ever draw each sprite at; pre-scaled to that x dpr
const MAXH = { zombie1: 100, zombie2: 100, runner: 95, brute: 150, boss: 420, soldier: 60, turret: 90, sandbags: 70, coin: 26, crate: 60, barrel: 56, flash: 44, gate_blue: 100, gate_red: 100 };
export const IMG = {};   // name -> { w, h, aspect, mips:[canvas...], white:[canvas...] | null }
export let BG = null;    // raw background image
let ready = false;
export const assetsReady = () => ready;

function scaled(img, h) {
  const c = document.createElement('canvas'); const w = Math.max(1, Math.round(h * img.width / img.height));
  c.width = w; c.height = Math.max(1, Math.round(h));
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height); return c;
}
function whiten(src) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d');
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); return c;
}
function prep(name, img, dpr) {
  const top = Math.min(img.height, Math.ceil(MAXH[name] * dpr * 1.15));
  const mips = [scaled(img, top)]; while (mips[mips.length - 1].height > 24) mips.push(scaled(mips[mips.length - 1], mips[mips.length - 1].height / 2));
  const flashable = /zombie|runner|brute|boss|crate|barrel/.test(name);
  IMG[name] = { aspect: img.width / img.height, mips, white: flashable ? mips.map(whiten) : null };
}
// pick the smallest mip that's still >= the on-screen pixel height
export function pick(entry, pxH, white) {
  const arr = white ? entry.white : entry.mips; let m = arr[0];
  for (let i = 1; i < arr.length; i++) { if (arr[i].height >= pxH) m = arr[i]; else break; }
  return m;
}
export function loadAssets(onProgress, dpr = Math.min(window.devicePixelRatio || 1, 2)) {
  let done = 0;
  const base = new URL('../assets/img/', import.meta.url);
  const one = name => new Promise(res => {
    const im = new Image(); im.decoding = 'async';
    const fin = ok => { done++; onProgress && onProgress(done / LIST.length); if (ok) { try { if (name === 'bg') BG = im; else prep(name, im, dpr); } catch (e) { console.warn('asset prep failed', name, e); } } else console.warn('asset failed', name); res(); };
    im.onload = () => fin(true); im.onerror = () => fin(false);
    im.src = new URL(name + '.webp?' + VERSION, base).href;
  });
  const all = Promise.all(LIST.map(one));
  const timeout = new Promise(r => setTimeout(r, 12000)); // never block the game on slow networks
  return Promise.race([all, timeout]).then(() => { ready = true; });
}

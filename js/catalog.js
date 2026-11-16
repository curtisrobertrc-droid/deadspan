// Deadspan cosmetics catalogue. Visual only: nothing here changes damage, speed, squad size or rewards.
// r: free | common | rare | epic | legendary. pass: 'free'|'prem' = season-pass reward. badge: leaderboard reward only.
import { tinted, thumb } from './assets.js?v8';
export const CATS = {
  skin: { n: 'Squad uniform', icon: '🪖' }, tracer: { n: 'Bullet tracer', icon: '✨' }, flash: { n: 'Muzzle flash', icon: '💥' },
  kill: { n: 'Kill effect', icon: '🧟' }, banner: { n: 'Victory banner', icon: '🏁' }, frame: { n: 'Profile frame', icon: '🖼' }, title: { n: 'Title', icon: '🏷' },
};
const sk = (id, name, r, c, mode, x = {}) => Object.assign({ id, cat: 'skin', name, r, c, mode, preview: () => thumb(c ? tinted('soldier', id, c, mode) : 'soldier', 48) }, x);
const tr = (id, name, r, c, x = {}) => Object.assign({ id, cat: 'tracer', name, r, c: c === 'rainbow' ? ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2'] : c, v: c }, x);
const fl = (id, name, r, c, x = {}) => Object.assign({ id, cat: 'flash', name, r, c }, x);
const kl = (id, name, r, c, x = {}) => Object.assign({ id, cat: 'kill', name, r, c, v: c }, x);
const bn = (id, name, r, t, c, x = {}) => Object.assign({ id, cat: 'banner', name, r, icon: '🏁', v: { t, c }, c }, x);
const fr = (id, name, r, c, x = {}) => Object.assign({ id, cat: 'frame', name, r, c }, x);
const ti = (id, name, r, x = {}) => Object.assign({ id, cat: 'title', name, r, icon: '🏷' }, x);
export const CATALOG = [
  sk('sk_blue', 'Classic Blue', 'free', null), sk('sk_olive', 'Olive Drab', 'common', '#7a8f3a'), sk('sk_desert', 'Desert Tan', 'common', '#c9a86a'), sk('sk_urban', 'Urban Grey', 'common', '#8d99a6'),
  sk('sk_crimson', 'Crimson Guard', 'rare', '#d62839'), sk('sk_jungle', 'Jungle', 'rare', '#2f9e44'), sk('sk_arctic', 'Arctic', 'rare', '#e9f2f7'),
  sk('sk_neon', 'Neon Ops', 'epic', '#39ff14'), sk('sk_royal', 'Royal Purple', 'epic', '#8e44ad'), sk('sk_night', 'Midnight', 'epic', '#2b3150', 'multiply', { }),
  sk('sk_gold', 'Solid Gold', 'legendary', '#ffc61a'), sk('sk_diamond', 'Diamond', 'legendary', '#8fe3ff'),
  sk('sk_hazmat', 'Hazmat', 'common', '#f2d024', { pass: 'free' }), sk('sk_infra', 'Infrared', 'epic', '#ff006e', { pass: 'prem' }),
  tr('tr_std', 'Standard', 'free', null), tr('tr_orange', 'Ember', 'common', '#ffa94d'), tr('tr_white', 'White Hot', 'common', '#ffffff'), tr('tr_cyan', 'Cyan', 'rare', '#3bc9db'),
  tr('tr_pink', 'Bubblegum', 'rare', '#f783ac'), tr('tr_plasma', 'Plasma', 'epic', '#b197fc'), tr('tr_toxic', 'Toxic', 'epic', '#8ce99a'), tr('tr_rainbow', 'Rainbow', 'legendary', 'rainbow'),
  tr('tr_lime', 'Lime', 'rare', '#a9e34b', { pass: 'free' }), tr('tr_blood', 'Blood Moon', 'epic', '#ff4d4d', { pass: 'prem' }),
  fl('fl_std', 'Standard', 'free', null), fl('fl_blue', 'Blue Flame', 'common', '#74c0fc'), fl('fl_green', 'Acid', 'rare', '#69db7c'), fl('fl_violet', 'Void', 'epic', '#da77f2'), fl('fl_solar', 'Solar', 'legendary', '#ffe066'),
  fl('fl_ice', 'Frost', 'rare', '#d0ebff', { pass: 'prem' }),
  kl('kl_std', 'Splat', 'free', null), kl('kl_dust', 'Dust', 'common', ['#c8b89a', '#8d7b68']), kl('kl_ice', 'Shatter', 'rare', ['#a5d8ff', '#e7f5ff', '#74c0fc']),
  kl('kl_confetti', 'Confetti', 'rare', ['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c']), kl('kl_coins', 'Jackpot', 'epic', ['#ffd43b', '#f59f00', '#fff3bf']),
  kl('kl_hearts', 'Love Bomb', 'epic', ['#ff8fab', '#ff4d6d', '#ffccd5']), kl('kl_fire', 'Fireworks', 'legendary', ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2', '#ffffff']),
  kl('kl_pixel', 'Pixels', 'rare', ['#00f5d4', '#9b5de5', '#f15bb5'], { pass: 'free' }), kl('kl_shadow', 'Shadow', 'epic', ['#212529', '#495057', '#7048e8'], { pass: 'prem' }),
  bn('bn_std', 'Cleared!', 'free', 'CLEARED!', '#ffd43b'), bn('bn_held', 'Bridge Held', 'common', 'BRIDGE HELD!', '#ffe066'), bn('bn_flaw', 'Flawless', 'rare', 'FLAWLESS!', '#66d9e8'),
  bn('bn_unst', 'Unstoppable', 'epic', 'UNSTOPPABLE!', '#da77f2'), bn('bn_leg', 'Legendary', 'legendary', 'LEGENDARY!', '#ffb703'), bn('bn_gg', 'GG', 'common', 'GG EZ!', '#a9e34b', { pass: 'free' }),
  bn('bn_boom', 'Boom', 'epic', 'BOOM!', '#ff6b6b', { pass: 'prem' }),
  fr('fr_none', 'Plain', 'free', '#3a4a6b'), fr('fr_bronze', 'Bronze', 'common', '#cd7f32'), fr('fr_steel', 'Steel', 'rare', '#adb5bd'), fr('fr_toxic', 'Toxic', 'epic', '#8ce99a'), fr('fr_flame', 'Inferno', 'legendary', ['#ff6b6b', '#ffd43b']),
  fr('fr_season', 'Season', 'rare', '#4dabf7', { pass: 'free' }),
  fr('badge_gold', 'Weekly #1', 'legendary', ['#ffd700', '#fff3bf'], { badge: true }), fr('badge_silver', 'Weekly Top 3', 'epic', ['#e9ecef', '#adb5bd'], { badge: true }),
  fr('badge_bronze', 'Weekly Top 10', 'rare', ['#e8a87c', '#cd7f32'], { badge: true }), fr('badge_top100', 'Weekly Top 100', 'common', '#74c0fc', { badge: true }),
  ti('ti_rookie', 'Rookie', 'free'), ti('ti_surv', 'Survivor', 'common'), ti('ti_keeper', 'Bridge Keeper', 'rare'), ti('ti_breaker', 'Horde Breaker', 'epic'), ti('ti_last', 'Last Line', 'legendary'),
  ti('ti_vet', 'Season Veteran', 'rare', { pass: 'free' }), ti('ti_elite', 'Season Elite', 'epic', { pass: 'prem' }), ti('ti_champ', 'Weekly Champion', 'legendary', { badge: true }),
];
// turn equipped ids into what the renderer reads
export function applyTo(game, eq, byId) {
  const g = id => byId[id] || {};
  const s = g(eq.skin); game.solKey = s.c ? tinted('soldier', s.id, s.c, s.mode) : null;
  const f = g(eq.flash); game.flashKey = f.c ? tinted('flash', f.id, f.c, 'color', 0.85) : null;
  game.cos = { tracer: g(eq.tracer).v || null, kill: g(eq.kill).v || null, banner: g(eq.banner).v || null };
}

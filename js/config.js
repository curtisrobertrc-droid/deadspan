// Deadspan — runtime config. Everything monetisation-related is OFF until filled in.
export const CFG = {
  GAME_NAME: 'Deadspan',
  VERSION: '0.1.0',
  // Telegram bot username (without @), set after Rob creates the bot in @BotFather.
  BOT_USERNAME: '',            // e.g. 'DeadspanGameBot'
  MINI_APP_SHORT_NAME: '',     // e.g. 'play' (only if created via /newapp)
  // AdsGram rewarded block id (from partner.adsgram.ai). Empty = rewarded ads disabled.
  ADSGRAM_BLOCK_ID: '',
  ADSGRAM_DEBUG: false,        // true = AdsGram test ads (use while testing in Telegram)
  // Backend (Cloudflare Worker) that creates Telegram Stars invoices. Empty = shop shows "coming soon".
  BACKEND_URL: '',             // e.g. 'https://deadspan-bot.<sub>.workers.dev'
  // Leaderboards (needs BACKEND_URL + the D1 database, see docs/LEADERBOARDS.md). false = personal bests + "coming soon".
  LEADERBOARDS: false,
  // Telegram Stars products: COSMETIC ONLY (no coins, no power), fixed contents, no random rewards (UK loot-box safe).
  STAR_PRODUCTS: [
    { sku: 'ds_pass', title: 'Premium season pass', desc: 'Unlocks this month\'s premium cosmetic track', stars: 150 },
    { sku: 'ds_gold', title: 'Gold Squad bundle', desc: 'Solid Gold uniform + Solar flash + Rainbow tracers', stars: 100 },
  ],
  REFERRAL_BONUS: 300,         // coins for a new player who joins via a friend's link
  MORE_GAMES: [
    { name: 'Deadspan: Outpost', tag: 'Merge tower defence', url: 'https://curtisrobertrc-droid.github.io/deadspan-outpost/', icon: 'https://curtisrobertrc-droid.github.io/deadspan-outpost/assets/icon.svg' },
  ],
};
// Dev helpers: ?devads=1 simulates a rewarded ad in a normal browser; ?bot=1 autoplays (for clips/screenshots).
export const QS = new URLSearchParams(location.search);
export const DEVOK = !window.PORTAL || QS.get('qa') === '1'; // dev helpers are stripped from portal builds
export const DEV_FAKE_ADS = DEVOK && QS.get('devads') === '1';
export const AUTOPLAY = DEVOK && QS.get('bot') === '1';

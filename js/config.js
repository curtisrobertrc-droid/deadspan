// Deadspan — runtime config. Everything monetisation-related is OFF until filled in.
export const CFG = {
  GAME_NAME: 'Deadspan',
  VERSION: '0.2.1',
  // Telegram bot username (without @), set after Rob creates the bot in @BotFather.
  BOT_USERNAME: 'DeadspanGameBot',
  MINI_APP_SHORT_NAME: '',     // e.g. 'play' (only if created via /newapp)
  // AdsGram rewarded block id (from partner.adsgram.ai). Empty = rewarded ads disabled.
  ADSGRAM_BLOCK_ID: '60072',
  ADSGRAM_DEBUG: false,        // true = AdsGram test ads (use while testing in Telegram)
  // Backend (Cloudflare Worker) that creates Telegram Stars invoices. Empty = shop shows "coming soon".
  BACKEND_URL: 'https://deadspan-bot.curtis-robert-rc.workers.dev',
  // Leaderboards (needs Telegram so initData can be checked). In a normal browser the Ranks tab still shows personal bests.
  LEADERBOARDS: true,
  // Telegram Stars products: COSMETIC ONLY (no coins, no power), fixed contents, no random rewards (UK loot-box safe).
  STAR_PRODUCTS: [
    { sku: 'ds_pass', title: 'Premium season pass', desc: 'Unlocks this month\'s premium cosmetic track', stars: 150 },
    { sku: 'ds_gold', title: 'Gold Squad bundle', desc: 'Solid Gold uniform + Solar flash + Rainbow tracers', stars: 100 },
  ],
  REFERRAL_BONUS: 500,         // coins each for inviter and invitee, once the friend finishes level 1 (paid by the Worker)
  MORE_GAMES: [
    { name: 'Deadspan: Outpost', tag: 'Merge tower defence', url: 'https://curtisrobertrc-droid.github.io/deadspan-outpost/', icon: 'https://curtisrobertrc-droid.github.io/deadspan-outpost/assets/icon.svg' },
  ],
};
// Dev helpers: ?devads=1 simulates a rewarded ad in a normal browser; ?bot=1 autoplays (for clips/screenshots).
export const QS = new URLSearchParams(location.search);
export const DEVOK = !window.PORTAL || QS.get('qa') === '1'; // dev helpers are stripped from portal builds
export const DEV_FAKE_ADS = DEVOK && QS.get('devads') === '1';
export const AUTOPLAY = DEVOK && QS.get('bot') === '1';

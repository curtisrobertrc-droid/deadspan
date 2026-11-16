-- D1 schema for the Deadspan Arcade backend. Apply: npx wrangler d1 execute deadspan-arcade --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS scores (game TEXT NOT NULL, period TEXT NOT NULL, pkey TEXT NOT NULL, uid TEXT NOT NULL, score INTEGER NOT NULL, level INTEGER NOT NULL, name TEXT, frame TEXT, title TEXT, at INTEGER NOT NULL, PRIMARY KEY (game, period, pkey, uid));
CREATE INDEX IF NOT EXISTS scores_rank ON scores (game, period, pkey, score DESC, at);
CREATE TABLE IF NOT EXISTS users (game TEXT NOT NULL, uid TEXT NOT NULL, best_level INTEGER NOT NULL DEFAULT 0, last_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (game, uid));
CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL, b TEXT NOT NULL, PRIMARY KEY (a, b));
CREATE TABLE IF NOT EXISTS purchases (charge_id TEXT PRIMARY KEY, uid TEXT NOT NULL, sku TEXT NOT NULL, game TEXT NOT NULL, at INTEGER NOT NULL, delivered INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS purchases_pending ON purchases (uid, game, delivered);
CREATE TABLE IF NOT EXISTS rewards (game TEXT NOT NULL, week TEXT NOT NULL, uid TEXT NOT NULL, rank INTEGER NOT NULL, coins INTEGER NOT NULL, badges TEXT, claimed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (game, week, uid));
CREATE INDEX IF NOT EXISTS rewards_user ON rewards (game, uid, claimed);
CREATE TABLE IF NOT EXISTS weeks_done (game TEXT NOT NULL, week TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (game, week));

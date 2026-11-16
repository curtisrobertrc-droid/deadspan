-- Invite rewards: one referrer per invitee, 500 coins each after the invitee finishes level/night 1.
CREATE TABLE IF NOT EXISTS invites (invitee TEXT PRIMARY KEY, referrer TEXT NOT NULL, game TEXT NOT NULL, at INTEGER NOT NULL, cleared INTEGER NOT NULL DEFAULT 0, invitee_paid INTEGER NOT NULL DEFAULT 0, referrer_claimed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS invites_referrer ON invites (referrer);

-- Board card backtesting snapshots
-- Captures the full computed state of each Board prop card at lock time (game goes live).
-- Player prop markets only: k | hits | hr | outs
-- Resolved to hit/miss by resolveCardSnapshotsJob after games are final.
CREATE TABLE IF NOT EXISTS board_card_snapshots (
  id            SERIAL       PRIMARY KEY,
  slate_date    DATE         NOT NULL,
  game_pk       INTEGER      NOT NULL,
  card_id       TEXT         NOT NULL,
  market        TEXT         NOT NULL,    -- 'k' | 'hits' | 'hr' | 'outs'
  lean          TEXT,                     -- 'over' | 'under'
  score         NUMERIC,
  score_tier    TEXT,                     -- 'high' | 'mid' | 'low'
  book_line     NUMERIC,                  -- the locked line (e.g. 5.5 Ks, 0.5 HR)
  ai_summary    TEXT,                     -- AI one-liner at lock time (nullable)
  card_data     JSONB        NOT NULL,    -- full card payload
  locked_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  result_hit    BOOLEAN,                  -- NULL = unresolved, true = hit, false = miss
  actual_stat   NUMERIC,                  -- actual Ks, hits, outs recorded, or HRs
  resolved_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bcs_unique
  ON board_card_snapshots(slate_date, card_id, market);

CREATE INDEX IF NOT EXISTS idx_bcs_date
  ON board_card_snapshots(slate_date);

CREATE INDEX IF NOT EXISTS idx_bcs_game_pk
  ON board_card_snapshots(game_pk);

CREATE INDEX IF NOT EXISTS idx_bcs_unresolved
  ON board_card_snapshots(slate_date)
  WHERE resolved_at IS NULL;

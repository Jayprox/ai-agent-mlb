-- Users table (mirrors users.json structure)
CREATE TABLE IF NOT EXISTS users (
  id            TEXT         PRIMARY KEY,
  username      TEXT         NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  preferences   JSONB        NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(LOWER(username));

-- Picks table (fresh start — no migration of existing picks.json)
CREATE TABLE IF NOT EXISTS picks (
  id          TEXT         PRIMARY KEY,
  user_id     TEXT         NOT NULL,
  game_pk     TEXT,
  result      TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  data        JSONB        NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_picks_user_id ON picks(user_id);
CREATE INDEX IF NOT EXISTS idx_picks_result  ON picks(result);
CREATE INDEX IF NOT EXISTS idx_picks_game_pk ON picks(game_pk);

-- Lab calibration records
CREATE TABLE IF NOT EXISTS lab_outcomes (
  id           TEXT         PRIMARY KEY,
  game_pk      INTEGER,
  date         TEXT,
  model        TEXT,
  lean_side    TEXT,
  lean_prob    NUMERIC,
  lean_edge    NUMERIC,
  has_edge     BOOLEAN,
  subject_key  TEXT,
  book_line    NUMERIC,
  book_total   NUMERIC,
  result       TEXT,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lab_model ON lab_outcomes(model);
CREATE INDEX IF NOT EXISTS idx_lab_date  ON lab_outcomes(date);

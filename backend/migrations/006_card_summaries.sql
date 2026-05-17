-- Persistent AI card summaries keyed by player + date + market + lean
-- Survives server restarts. One row per unique card identity per day.
CREATE TABLE IF NOT EXISTS card_summaries (
  id          SERIAL      PRIMARY KEY,
  slate_date  DATE        NOT NULL,
  card_key    TEXT        NOT NULL,   -- "{name}:{market}:{lean}" normalized
  summary     TEXT        NOT NULL,
  is_premium  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_key_date_premium
  ON card_summaries(slate_date, card_key, is_premium);

CREATE INDEX IF NOT EXISTS idx_cs_date
  ON card_summaries(slate_date);

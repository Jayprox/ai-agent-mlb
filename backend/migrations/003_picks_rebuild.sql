-- Wipe old picks entirely and recreate with clean schema
DROP TABLE IF EXISTS picks;

CREATE TABLE picks (
  id           TEXT         PRIMARY KEY,
  user_id      TEXT         NOT NULL,
  game_pk      TEXT,
  status       TEXT         NOT NULL DEFAULT 'pending',
  result       TEXT,
  prop_type    TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  snapshot     JSONB        NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_picks_user_id  ON picks(user_id);
CREATE INDEX idx_picks_status   ON picks(status);
CREATE INDEX idx_picks_game_pk  ON picks(game_pk);
CREATE INDEX idx_picks_result   ON picks(result);
CREATE INDEX idx_picks_created  ON picks(created_at DESC);

-- Slate snapshots (today's schedule)
CREATE TABLE IF NOT EXISTS slate_snapshots (
  id          SERIAL PRIMARY KEY,
  slate_date  DATE         NOT NULL,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  games       JSONB        NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_slate_date ON slate_snapshots(slate_date);

-- Odds snapshots (one row per game per slate date)
CREATE TABLE IF NOT EXISTS odds_snapshots (
  id          SERIAL PRIMARY KEY,
  game_key    TEXT         NOT NULL,
  slate_date  DATE         NOT NULL,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  odds        JSONB        NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_odds_date ON odds_snapshots(slate_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_odds_game_date ON odds_snapshots(game_key, slate_date);

-- Player stats cache
CREATE TABLE IF NOT EXISTS player_stats (
  player_id   INTEGER      NOT NULL,
  stat_group  TEXT         NOT NULL,
  season      INTEGER      NOT NULL,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  stats       JSONB        NOT NULL,
  PRIMARY KEY (player_id, stat_group, season)
);

-- Bullpen snapshots (per game)
CREATE TABLE IF NOT EXISTS bullpen_snapshots (
  game_pk     INTEGER      PRIMARY KEY,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  data        JSONB        NOT NULL
);

-- Linescore snapshots (live scores, updated frequently)
CREATE TABLE IF NOT EXISTS linescore_snapshots (
  game_pk     INTEGER      PRIMARY KEY,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  data        JSONB        NOT NULL
);

-- Umpire assignments (per game)
CREATE TABLE IF NOT EXISTS umpire_snapshots (
  game_pk     INTEGER      PRIMARY KEY,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  data        JSONB        NOT NULL
);

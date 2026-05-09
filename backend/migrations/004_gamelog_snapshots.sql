-- Player gamelog snapshots
-- Stores fetched gamelog data per player per stat group per Honolulu date.
-- Eliminates repeated MLB API calls during the game day.
-- Keyed by (player_id, stat_group, slate_date) so pitchers and batters
-- each get their own row and the previous day's data auto-retires by key.
CREATE TABLE IF NOT EXISTS player_gamelog_snapshots (
  player_id   INTEGER      NOT NULL,
  stat_group  TEXT         NOT NULL,   -- 'pitching' or 'hitting'
  slate_date  DATE         NOT NULL,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  data        JSONB        NOT NULL,
  PRIMARY KEY (player_id, stat_group, slate_date)
);

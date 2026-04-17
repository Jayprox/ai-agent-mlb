const express = require("express");
const router  = express.Router();
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");

const CACHE_TTL_MS = 30 * 60 * 1000;
const LOOKBACK_MS  = 14 * 24 * 60 * 60 * 1000;

const getTxDate = (tx) => tx?.date ?? tx?.effectiveDate ?? tx?.transactionDate ?? null;
const isoDate = (date) => date.toISOString().slice(0, 10);

const isRecent = (tx) => {
  const ts = Date.parse(getTxDate(tx));
  return !Number.isNaN(ts) && (Date.now() - ts) <= LOOKBACK_MS;
};

const isIlPlacement = (tx) => {
  const code = String(tx?.typeCode ?? "").toUpperCase();
  const desc = String(tx?.description ?? tx?.typeDesc ?? tx?.transactionDesc ?? "").toLowerCase();

  if (code === "IL" || code === "DL") return true;
  const mentionsList = desc.includes("injured list") || desc.includes("disabled list");
  const placementMove = desc.includes("placed") || desc.includes("transfer");
  const activationMove = desc.includes("activated") || desc.includes("returned") || desc.includes("reinstated");
  return mentionsList && placementMove && !activationMove;
};

const transformTransaction = (tx) => ({
  playerId:    tx?.person?.id ?? tx?.player?.id ?? tx?.personId ?? null,
  playerName:  tx?.person?.fullName ?? tx?.player?.fullName ?? tx?.playerName ?? "Unknown",
  team:        tx?.toTeam?.abbreviation ?? tx?.toTeam?.name ?? tx?.team?.abbreviation ?? tx?.team?.name ?? tx?.fromTeam?.abbreviation ?? tx?.fromTeam?.name ?? null,
  status:      tx?.typeDesc ?? tx?.typeCode ?? "IL",
  date:        getTxDate(tx),
  description: tx?.description ?? tx?.transactionDesc ?? tx?.note ?? "",
});

router.get("/", async (_req, res) => {
  const cacheKey = "injuries:recent";
  const cached = cache.get(cacheKey);

  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const endDate = new Date();
    const startDate = new Date(Date.now() - LOOKBACK_MS);
    const { data } = await mlb.get("/transactions", {
      params: {
        sportId: 1,
        limit: 100,
        startDate: isoDate(startDate),
        endDate: isoDate(endDate),
      },
    });

    const injuries = (data?.transactions ?? [])
      .filter(isIlPlacement)
      .filter(isRecent)
      .map(transformTransaction)
      .filter(tx => tx.playerId && tx.date)
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .filter((tx, idx, arr) => arr.findIndex(other => other.playerId === tx.playerId) === idx);

    const result = { injuries };
    cache.set(cacheKey, result, CACHE_TTL_MS);
    res.setHeader("X-Cache", "MISS");
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: "MLB API unavailable", detail: err.message });
  }
});

module.exports = router;

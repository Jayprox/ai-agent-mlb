// src/components/GameBoardCard.jsx
import { Card, TierBadge } from "./shared.jsx";
import { resultBorderStyle, formatLocalTime } from "../utils.js";
import { PARK_FACTORS } from "../constants.js";

const BOOK_COLORS = { DK: "#38bdf8", FD: "#34d399", CZR: "#fb923c", MGM: "#a78bfa" };

export default function GameBoardCard({
  c, rank, gameSubTab,
  sc, lc, displayScore,
  gameStatus, gameHit, finalTotalRuns,
  homeSPEra, awaySPEra,
  summaryText, isPremium, preferredBook,
  onCardClick,
}) {
  const resultCardStyle = resultBorderStyle(gameHit === null ? null : (gameHit ? "#22c55e" : "#ef4444"));

  return (
    <Card style={{ cursor: "pointer", padding: "10px 12px", ...resultCardStyle }} onClick={onCardClick}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Rank + score */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: "#1e2030", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#6b7280" }}>{rank}</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: sc, fontFamily: "monospace", lineHeight: 1 }}>{displayScore}</div>
        </div>
        {/* Main */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>{c.away?.abbr ?? "?"} @ {c.home?.abbr ?? "?"}</span>
            <TierBadge tier="algorithmic" />
            {c.gameTime && (
              <span style={{ fontSize: 9, color: "#38bdf8", fontFamily: "monospace" }}>{formatLocalTime(c.gameTime)}</span>
            )}
            {gameStatus && (
              <span style={{ fontSize: 8, fontWeight: 800, color: gameStatus === "LIVE" ? "#22c55e" : "#6b7280", background: gameStatus === "LIVE" ? "rgba(34,197,94,0.12)" : "#1e2030", border: `1px solid ${gameStatus === "LIVE" ? "rgba(34,197,94,0.35)" : "#374151"}`, borderRadius: 4, padding: "1px 5px" }}>{gameStatus}</span>
            )}
            {gameHit === true && (
              <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 4, padding: "1px 6px" }}>✓ HIT</span>
            )}
            {gameHit === false && (
              <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 4, padding: "1px 6px" }}>✗ MISS</span>
            )}
          </div>
          {/* SP row */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            {c.homeSP?.name && (
              <span style={{ fontSize: 9, color: "#9ca3af" }}>
                {c.home?.abbr} SP: <span style={{ color: "#e5e7eb" }}>{c.homeSP.name}</span>
                {homeSPEra ? <span style={{ color: "#6b7280" }}> {homeSPEra.toFixed(2)} ERA</span> : null}
              </span>
            )}
            {c.awaySP?.name && (
              <span style={{ fontSize: 9, color: "#9ca3af" }}>
                {c.away?.abbr} SP: <span style={{ color: "#e5e7eb" }}>{c.awaySP.name}</span>
                {awaySPEra ? <span style={{ color: "#6b7280" }}> {awaySPEra.toFixed(2)} ERA</span> : null}
              </span>
            )}
          </div>
          {/* Weather + park */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {c.weather && !c.weather.roof && c.weather.temp && (
              <span style={{ fontSize: 9, color: "#6b7280" }}>
                {c.weather.temp}°F
                {c.weather.wind ? ` · ${c.weather.wind}` : ""}
                {c.weather.hrFavorable ? " · ✦ HR wind" : ""}
              </span>
            )}
            {c.weather?.roof && <span style={{ fontSize: 9, color: "#6b7280" }}>Dome</span>}
            {(() => { const pf = PARK_FACTORS[c.home?.abbr]; return pf && pf.hr !== 1.0 ? <span style={{ fontSize: 9, color: "#6b7280" }}>{pf.label}</span> : null; })()}
            {finalTotalRuns !== null && (
              <span style={{ fontSize: 9, color: "#d1d5db", fontFamily: "monospace" }}>
                Final runs <span style={{ color: "#f9fafb", fontWeight: 700 }}>{finalTotalRuns}</span>
              </span>
            )}
          </div>
          {summaryText && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginTop: 6 }}>
              {isPremium && (
                <span style={{ fontSize: 8, color: "#a78bfa", fontFamily: "monospace", fontWeight: 800, flexShrink: 0, marginTop: 1 }}>✦</span>
              )}
              <div style={{ fontSize: 10, color: "#d1d5db", lineHeight: 1.45, fontStyle: "italic" }}>{summaryText}</div>
            </div>
          )}
          {c.odds?.books && gameSubTab !== "nrfi" && (() => {
            const isAwayLean = c.leanAbbr != null && c.leanAbbr === c.away?.abbr;
            const chips = Object.entries(BOOK_COLORS)
              .map(([bk, color]) => {
                const bd = c.odds.books[bk];
                if (!bd) return null;
                let lineText = null;
                if (gameSubTab === "total") {
                  if (bd.total) lineText = `O/U ${bd.total} ${bd.overOdds ?? "—"}/${bd.underOdds ?? "—"}`;
                } else if (gameSubTab === "spread") {
                  const sp   = isAwayLean ? bd.awaySpread     : bd.homeSpread;
                  const spOd = isAwayLean ? bd.awaySpreadOdds : bd.homeSpreadOdds;
                  if (sp) lineText = `${sp}${spOd ? ` ${spOd}` : ""}`;
                } else if (gameSubTab === "ml") {
                  const ml = isAwayLean ? bd.awayML : bd.homeML;
                  if (ml) lineText = ml;
                } else if (gameSubTab === "f5ml") {
                  const ml = isAwayLean
                    ? (bd.f5AwayML ?? bd.awayML)
                    : (bd.f5HomeML ?? bd.homeML);
                  if (ml) lineText = `F5 ${ml}`;
                } else if (gameSubTab === "f5spread") {
                  const sp = isAwayLean
                    ? (bd.f5AwaySpread ?? bd.awaySpread)
                    : (bd.f5HomeSpread ?? bd.homeSpread);
                  const spOd = isAwayLean
                    ? (bd.f5AwaySpreadOdds ?? bd.awaySpreadOdds)
                    : (bd.f5HomeSpreadOdds ?? bd.homeSpreadOdds);
                  if (sp) lineText = `F5 ${sp}${spOd ? ` ${spOd}` : ""}`;
                }
                if (!lineText) return null;
                return { bk, color, lineText };
              })
              .filter(Boolean);
            if (!chips.length) return null;
            return (
              <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                {chips.map(({ bk, color, lineText }) => (
                  <span key={bk} style={{
                    fontSize: 8, fontWeight: 700, color,
                    background: `${color}15`, border: `1px solid ${color}33`,
                    borderRadius: 4, padding: "2px 6px", fontFamily: "monospace",
                  }}>
                    {bk === preferredBook ? `★ ${bk}` : bk} {lineText}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
        {/* Lean badge */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <div style={{ background: `${lc}18`, border: `1px solid ${lc}55`, borderRadius: 6, padding: "4px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: lc, fontFamily: "monospace", lineHeight: 1 }}>{c.leanAbbr ?? c.lean}</div>
            {c.line && <div style={{ fontSize: 8, color: lc, fontFamily: "monospace", marginTop: 1, opacity: 0.8 }}>{c.line}</div>}
          </div>
          <span style={{ fontSize: 8, color: "#4b5563" }}>tap for why</span>
        </div>
      </div>
    </Card>
  );
}

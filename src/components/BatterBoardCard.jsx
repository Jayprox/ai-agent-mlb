// src/components/BatterBoardCard.jsx
import { Card, RankScoreColumn, GameStatusBadge } from "./shared.jsx";
import { resultBorderStyle, formatLocalTime } from "../utils.js";

const BOOK_COLORS = {
  DK: "#38bdf8", FD: "#34d399", CZR: "#fb923c", MGM: "#a78bfa", BOV: "#f87171",
};

export default function BatterBoardCard({
  c, rank, boardTab, sc,
  boardGameStatus, todayResult, evEdge,
  summaryText, isPremium, preferredBook,
  onCardClick, onAddPick, isLogged,
}) {
  const l5dots = Array.from({ length: 5 }, (_, j) => c.hitRate[j] ?? null);
  const isHrBoard = boardTab === "hr";
  const hasResult   = todayResult && todayResult.ab > 0;
  const gotHR       = hasResult && todayResult.hr > 0;
  const gotHit      = hasResult && todayResult.h > 0 && !gotHR;
  const ohFer       = hasResult && todayResult.h === 0;
  const resultCardStyle = resultBorderStyle(
    isHrBoard
      ? (gotHR ? "#fbbf24" : (boardGameStatus === "FINAL" ? "#ef4444" : null))
      : (gotHR ? "#fbbf24" : (gotHit ? "#22c55e" : (ohFer ? "#ef4444" : null)))
  );

  return (
    <Card
      style={{ position: "relative", marginBottom: 8, cursor: "pointer", padding: "10px 12px", ...resultCardStyle }}
      onClick={onCardClick}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!isLogged && boardGameStatus !== "FINAL") onAddPick?.();
        }}
        style={{
          position: "absolute", bottom: 6, right: 8,
          width: 18, height: 18, borderRadius: "50%",
          fontSize: 12, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: isLogged
            ? "1px solid rgba(59,130,246,0.4)"
            : boardGameStatus === "FINAL"
              ? "1px solid rgba(55,65,81,0.4)"
              : "1px solid rgba(107,114,128,0.4)",
          background: "transparent",
          color: isLogged ? "#3b82f6" : boardGameStatus === "FINAL" ? "#374151" : "#6b7280",
          cursor: isLogged ? "not-allowed" : boardGameStatus === "FINAL" ? "default" : "pointer",
        }}
        title={isLogged ? "Already logged" : boardGameStatus === "FINAL" ? "Game over" : "Log pick"}
      >
        {isLogged ? "✓" : "+"}
      </button>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Rank */}
        <RankScoreColumn rank={rank} score={c.score} scoreColor={sc} simConfidence={c.simConfidence} />

        {/* Main info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb" }}>{c.name}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#000", background: "#374151", borderRadius: 4, padding: "1px 5px" }}>{c.team}</span>
            {c.order != null && <span style={{ fontSize: 9, color: "#6b7280" }}>#{c.order}</span>}
            {c.isSubstitution && (
              <div style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 5, padding: "1px 6px" }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace", letterSpacing: "0.05em" }}>↔ SUB</span>
              </div>
            )}
            <GameStatusBadge status={boardGameStatus} />
            {boardGameStatus !== "LIVE" && boardGameStatus !== "FINAL" && c.lineupState === "confirmed" && (
              <div style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 5, padding: "1px 6px" }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: "#22c55e", fontFamily: "monospace", letterSpacing: "0.05em" }}>✓ CONFIRMED</span>
              </div>
            )}
            {boardGameStatus !== "LIVE" && boardGameStatus !== "FINAL" && c.lineupState === "roster" && (
              <div style={{ background: "rgba(107,114,128,0.08)", border: "1px solid rgba(107,114,128,0.2)", borderRadius: 5, padding: "1px 6px" }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.05em" }}>LINEUP TBD</span>
              </div>
            )}
            {/* Today's result badge */}
            {gotHR  && <span style={{ fontSize: 8, fontWeight: 800, color: "#fbbf24", background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 4, padding: "1px 6px" }}>⚾ HR{todayResult.hr > 1 ? ` ×${todayResult.hr}` : ""}</span>}
            {!isHrBoard && gotHit && <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.12)",  border: "1px solid rgba(34,197,94,0.35)",  borderRadius: 4, padding: "1px 6px" }}>✓ HIT{todayResult.h > 1 ? ` ×${todayResult.h}` : ""}</span>}
            {!isHrBoard && boardGameStatus === "FINAL" && ohFer && (
              <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 4, padding: "1px 6px" }}>✗ NO HIT</span>
            )}
            {isHrBoard && boardGameStatus === "FINAL" && !gotHR && (
              <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 4, padding: "1px 6px" }}>✗ NO HR</span>
            )}
            {c.windFav && boardTab === "hr" && (
              <span style={{ fontSize: 8, fontWeight: 700, color: "#fbbf24", background: "rgba(251,191,36,0.12)", borderRadius: 4, padding: "1px 5px" }}>↑ WIND</span>
            )}
          </div>
          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
            vs {c.pitcher} ({c.pitcherHand}HP) · {c.gameLabel}{c.gameTime ? ` ${formatLocalTime(c.gameTime)}` : ""}
          </div>
          {c.isSubstitution && c.substitutedFor && (
            <div style={{ fontSize: 8, color: "#92400e", background: "rgba(251,191,36,0.08)", borderRadius: 4, padding: "1px 5px", marginTop: 2, display: "inline-block" }}>
              replaces {c.substitutedFor}
            </div>
          )}
          {/* Stats row */}
          <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
            {c.avg !== "—" && (
              <span style={{ fontSize: 10, color: parseFloat(c.avg) >= 0.280 ? "#22c55e" : parseFloat(c.avg) >= 0.240 ? "#f59e0b" : "#ef4444", fontFamily: "monospace", fontWeight: 700 }}>{c.avg} AVG</span>
            )}
            {boardTab === "hr" && c.hr > 0 && (
              <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", fontWeight: 600 }}>{c.hr} HR</span>
            )}
            {c.slg !== "—" && c.slg !== ".000" && boardTab === "hr" && (
              <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>{c.slg} SLG</span>
            )}
            {c.ops !== "—" && (
              <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>{c.ops} OPS</span>
            )}
            {c.parkFactor !== 1.0 && (
              <span style={{ fontSize: 9, color: c.parkFactor >= 1.10 ? "#22c55e" : c.parkFactor <= 0.93 ? "#ef4444" : "#6b7280", fontFamily: "monospace" }}>
                {boardTab === "hr" ? "HR" : "HIT"} {c.parkFactor >= 1.0 ? "+" : ""}{((c.parkFactor - 1) * 100).toFixed(0)}% park
              </span>
            )}
          </div>
          {/* L5 dots + prop odds */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
            <div style={{ display: "flex", gap: 3 }}>
              {l5dots.map((v, j) => (
                <div key={j} style={{ width: 7, height: 7, borderRadius: "50%",
                  background: v === 1 ? "#22c55e" : v === 0 ? "#374151" : "#1e2030",
                  border: v === null ? "1px solid #374151" : "none" }} />
              ))}
            </div>
            {c.propLine && (
              <span style={{ fontSize: 9, color: "#38bdf8", fontFamily: "monospace" }}>
                {boardTab === "hr" ? "HR" : "H"} O{c.propLine.line} {c.propLine.overOdds} · {c.propLine.book}
              </span>
            )}
          </div>
          {evEdge && (() => {
            const isPositive = evEdge.edge >= 3;
            const isNegative = evEdge.edge <= -5;
            if (!isPositive && !isNegative) return null;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 8,
                  fontWeight: 800,
                  fontFamily: "monospace",
                  color: isPositive ? "#22c55e" : "#ef4444",
                  background: isPositive ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)",
                  border: `1px solid ${isPositive ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`,
                  borderRadius: 4,
                  padding: "1px 6px",
                }}>
                  {isPositive ? `+${evEdge.edge}% EDGE` : `${evEdge.edge}% VALUE`}
                </span>
                <span style={{ fontSize: 8, color: "#6b7280", fontFamily: "monospace" }}>
                  Model {evEdge.lean === "over" ? "OVER" : "UNDER"} {evEdge.modelImplied}% vs book {evEdge.bookImplied}% ({evEdge.bestOdds})
                </span>
              </div>
            );
          })()}
          {summaryText && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginTop: 6 }}>
              {isPremium && (
                <span style={{ fontSize: 8, color: "#a78bfa", fontFamily: "monospace", fontWeight: 800, flexShrink: 0, marginTop: 1 }}>✦</span>
              )}
              <div style={{ fontSize: 10, color: "#d1d5db", lineHeight: 1.45, fontStyle: "italic" }}>{summaryText}</div>
            </div>
          )}
          {c.propLine?.books && (
            <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
              {[preferredBook, ...["DK", "FD", "CZR", "MGM", "BOV"].filter(bk => bk !== preferredBook)]
                .filter((bk, idx, arr) => arr.indexOf(bk) === idx)
                .filter(bk => c.propLine.books?.[bk]?.line != null)
                .map(bk => {
                  const book = c.propLine.books[bk];
                  const bkColor = BOOK_COLORS[bk] ?? "#9ca3af";
                  return (
                    <span
                      key={bk}
                      style={{
                        fontSize: 8,
                        fontWeight: 700,
                        color: bkColor,
                        background: `${bkColor}15`,
                        border: `1px solid ${bkColor}33`,
                        borderRadius: 4,
                        padding: "2px 6px",
                        fontFamily: "monospace",
                      }}
                    >
                      {bk === preferredBook ? `★ ${bk}` : bk} {book.line} {book.overOdds ?? "—"}/{book.underOdds ?? "—"}
                    </span>
                  );
                })}
            </div>
          )}
        </div>

        {/* Score badge */}
        <div style={{ flexShrink: 0, width: 44, borderRadius: 10, background: `${sc}22`, border: `1px solid ${sc}55`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "5px 0 4px", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: sc, fontFamily: "monospace", lineHeight: 1 }}>{c.score}</span>
          <span style={{ fontSize: 7, fontWeight: 700, color: sc, fontFamily: "monospace", opacity: 0.7, letterSpacing: "0.05em" }}>WHY?</span>
        </div>
      </div>
    </Card>
  );
}

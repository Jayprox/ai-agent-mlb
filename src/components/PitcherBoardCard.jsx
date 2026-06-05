// src/components/PitcherBoardCard.jsx
import { Card, RankScoreColumn, TierBadge, GameStatusBadge } from "./shared.jsx";
import { resultBorderStyle, formatLocalTime } from "../utils.js";

const BOOK_COLORS = {
  DK: "#38bdf8", FD: "#34d399", CZR: "#fb923c", MGM: "#a78bfa", BOV: "#f87171",
};

export default function PitcherBoardCard({
  c, rank, boardTab, sc,
  boardGameStatus, todayResult, pitcherMetrics,
  summaryText, isPremium, preferredBook,
  onCardClick, onAddPick, isLogged,
}) {
  const hasResolvedResult = !!todayResult && !todayResult.live;
  const propLineValue = c.propLine?.line ?? c.suggestedLine;
  const boardLean = c.score >= 55 ? "OVER" : "UNDER";
  const boardLeanPositive = boardLean === "OVER";
  const pitcherHit = hasResolvedResult && propLineValue !== null && propLineValue !== undefined && (
    boardTab === "k"
      ? (boardLean === "UNDER" ? todayResult.k < propLineValue : todayResult.k > propLineValue)
      : (boardLean === "UNDER" ? todayResult.outs < propLineValue : todayResult.outs > propLineValue)
  );
  const resultCardStyle = resultBorderStyle(hasResolvedResult ? (pitcherHit ? "#22c55e" : "#ef4444") : null);
  const propBadgeLine = propLineValue !== null && propLineValue !== undefined ? `${propLineValue}` : "—";

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
        {/* Rank + score */}
        <RankScoreColumn rank={rank} score={c.score} scoreColor={sc} simConfidence={c.simConfidence} />
        {/* Main info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb" }}>{c.name}</span>
            <TierBadge tier="algorithmic" />
            <span style={{ fontSize: 9, fontWeight: 700, color: "#000", background: "#374151", borderRadius: 4, padding: "1px 5px" }}>{c.team}</span>
            <span style={{ fontSize: 9, color: "#9ca3af" }}>{c.hand}HP</span>
            <GameStatusBadge status={boardGameStatus} />
            {hasResolvedResult && pitcherHit && (
              <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 4, padding: "1px 6px" }}>
                ✓ {boardTab === "k" ? `${todayResult.k}K` : `${todayResult.outs} outs`}
              </span>
            )}
            {hasResolvedResult && !pitcherHit && (
              <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 4, padding: "1px 6px" }}>
                ✗ {boardTab === "k" ? `${todayResult.k}K` : `${todayResult.outs} outs`}
              </span>
            )}
            {c.umpireRating === "pitcher" && boardTab === "k" && (
              <span style={{ fontSize: 8, fontWeight: 700, color: "#a78bfa", background: "rgba(167,139,250,0.12)", borderRadius: 4, padding: "1px 5px" }}>⚖ UMP+K</span>
            )}
          </div>
          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
            vs {c.facingTeam} · {c.gameLabel}{c.gameTime ? ` ${formatLocalTime(c.gameTime)}` : ""}
            {c.umpire && <span style={{ color: "#4b5563" }}> · {c.umpire}</span>}
          </div>
          {/* Pitcher stats row */}
          <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
            {c.era !== "—" && (
              <span style={{ fontSize: 10, color: parseFloat(c.era) <= 3.20 ? "#22c55e" : parseFloat(c.era) <= 4.50 ? "#f59e0b" : "#ef4444", fontFamily: "monospace", fontWeight: 700 }}>{c.era} ERA</span>
            )}
            {c.k9 !== "—" && boardTab === "k" && (
              <span style={{ fontSize: 10, color: parseFloat(c.k9) >= 10.0 ? "#22c55e" : parseFloat(c.k9) >= 8.0 ? "#f59e0b" : "#ef4444", fontFamily: "monospace", fontWeight: 700 }}>{c.k9} K/9</span>
            )}
            {(pitcherMetrics.swStrPct ?? pitcherMetrics.swStr) && boardTab === "k" && (
              <span style={{ fontSize: 9, color: "#818cf8" }}>
                SwStr% {parseFloat(pitcherMetrics.swStrPct ?? pitcherMetrics.swStr).toFixed(1)}%
                {(pitcherMetrics.chasePct ?? pitcherMetrics.oSwing) ? ` · Chase ${parseFloat(pitcherMetrics.chasePct ?? pitcherMetrics.oSwing).toFixed(1)}%` : ""}
              </span>
            )}
            {c.whip !== "—" && (
              <span style={{ fontSize: 10, color: parseFloat(c.whip) <= 1.10 ? "#22c55e" : parseFloat(c.whip) <= 1.35 ? "#f59e0b" : "#ef4444", fontFamily: "monospace" }}>{c.whip} WHIP</span>
            )}
            {c.avgIP !== "—" && c.avgIP && (
              <span style={{ fontSize: 10, color: parseFloat(c.avgIP) >= 6.0 ? "#22c55e" : parseFloat(c.avgIP) >= 5.0 ? "#f59e0b" : "#9ca3af", fontFamily: "monospace" }}>{c.avgIP} IP/gs</span>
            )}
          </div>
          {/* Prop line + lean row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
            {c.avgK3 !== null && boardTab === "k" && (
              <span style={{ fontSize: 9, color: "#d1d5db", fontFamily: "monospace" }}>
                L3 avg <span style={{ color: "#f9fafb", fontWeight: 700 }}>{c.avgK3}K</span>
              </span>
            )}
            {(() => {
              const line = c.propLine ? c.propLine.line : c.suggestedLine;
              if (line === null) return null;
              const lean = boardLean;
              const positive = boardLeanPositive;
              const conf = Math.min(85, Math.round(50 + (c.score - 40) * 35 / 55));
              const color  = positive ? "#22c55e" : "#ef4444";
              const bg     = positive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";
              const border = positive ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)";
              const propLabel = boardTab === "k" ? "K" : "Outs";
              const lineLabel = c.propLine ? `O${line}` : `O/U ~${line}`;
              const bookLabel = c.propLine ? ` ${c.propLine.overOdds} · ${c.propLine.book}` : "";
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, color: "#9ca3af", fontFamily: "monospace" }}>{propLabel} {lineLabel}{bookLabel}</span>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: "2px 7px", fontSize: 8, fontWeight: 700, color, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    {lean}
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 800, color: conf >= 65 ? "#22c55e" : "#fbbf24", fontFamily: "monospace" }}>{conf}%</span>
                </div>
              );
            })()}
          </div>
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
        {/* Prop badge */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <div style={{ background: `${boardLeanPositive ? "#22c55e" : "#ef4444"}18`, border: `1px solid ${boardLeanPositive ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`, borderRadius: 6, padding: "4px 8px", textAlign: "center", minWidth: 54 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: boardLeanPositive ? "#22c55e" : "#ef4444", fontFamily: "monospace", lineHeight: 1 }}>{boardLean}</div>
            <div style={{ fontSize: 8, color: boardLeanPositive ? "#22c55e" : "#ef4444", fontFamily: "monospace", marginTop: 1, opacity: 0.8 }}>{propBadgeLine}</div>
          </div>
          <span style={{ fontSize: 8, color: "#4b5563" }}>tap for why</span>
        </div>
      </div>
    </Card>
  );
}

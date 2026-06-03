import { Card } from "./shared.jsx";
import { resultBorderStyle } from "../utils.js";

const MARKET_LABELS = {
  k: "K Prop",
  outs: "Outs Prop",
  total: "O/U Total",
  spread: "Runline",
  ml: "Moneyline",
  f5ml: "F5 ML",
  f5spread: "F5 Spread",
};

function calcWinAmount(odds, unitSize) {
  const n = Number(odds);
  if (!Number.isFinite(n)) return 0;
  return n > 0 ? (unitSize * n / 100) : (unitSize * 100 / Math.abs(n));
}

export default function ScoutPickCard({ c, rank, unitSize, gradeResult }) {
  const marketLabel = MARKET_LABELS[c.market] ?? c.market;
  const title = c.playerName ?? c.gameLabel;
  const subtitle = c.playerName
    ? `${c.gameLabel} · ${c.lean} ${c.bookLine ?? "—"} ${marketLabel === "K Prop" ? "K" : marketLabel === "Outs Prop" ? "Outs" : ""}`.trim()
    : `${c.gameLabel} · ${c.leanLabel ?? c.lean}${c.bookLine != null ? ` · ${c.bookLine}` : ""}`;
  const winAmount = calcWinAmount(c.bookOdds, unitSize);
  const impliedPct = c.impliedProb != null ? (c.impliedProb * 100).toFixed(1) : null;
  const modelPct = c.modelProb != null ? Math.round(c.modelProb * 100) : (c.simConfidence ?? c.score ?? null);
  const borderColor = gradeResult === true ? "#22c55e" : gradeResult === false ? "#ef4444" : null;
  const gradeStyle = resultBorderStyle(borderColor);

  return (
    <Card style={{ padding: "12px 14px", marginBottom: 10, ...gradeStyle }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 5 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af", fontFamily: "monospace" }}>#{rank}</span>
            <span style={{ fontSize: 8, fontWeight: 800, color: "#a78bfa", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>{marketLabel}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb" }}>{title}</span>
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af" }}>
            {subtitle} {c.bookOdds != null ? `· ${c.bookOdds > 0 ? `+${c.bookOdds}` : c.bookOdds}` : ""}
          </div>
        </div>
        {gradeResult === true && (
          <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 4, padding: "1px 6px" }}>
            ✓ HIT
          </span>
        )}
        {gradeResult === false && (
          <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 4, padding: "1px 6px" }}>
            ✗ MISS
          </span>
        )}
      </div>

      <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.5, marginTop: 6 }}>
        📊 Model: {modelPct != null ? `${modelPct}%` : "—"} confident{impliedPct != null ? ` · Book implied: ${impliedPct}%` : ""}
      </div>

      <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.14)", borderRadius: 7, display: "flex", flexDirection: "column", gap: 5 }}>
        {c.shortReason ? (
          <div style={{ fontSize: 10, color: "#d1d5db", lineHeight: 1.55 }}>
            {c.shortReason}
          </div>
        ) : (c.factors?.length > 0) ? (
          <div style={{ fontSize: 10, color: "#d1d5db", lineHeight: 1.55 }}>
            {c.factors.join(" · ")}
          </div>
        ) : null}
        {c.confidenceStatement && (
          <div style={{ fontSize: 10, color: "#a78bfa", lineHeight: 1.55 }}>
            {c.confidenceStatement}
          </div>
        )}
        {c.keyRisk && (
          <div style={{ fontSize: 10, color: "#fca5a5", lineHeight: 1.55 }}>
            <span style={{ fontWeight: 800 }}>⚠ </span>{c.keyRisk}
          </div>
        )}
      </div>

      <div style={{ fontSize: 10, color: "#f9fafb", marginTop: 8, fontFamily: "monospace" }}>
        Bet: ${unitSize.toFixed(2)} to win ${winAmount.toFixed(2)}
      </div>
    </Card>
  );
}

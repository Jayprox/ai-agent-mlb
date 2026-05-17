// src/components/EdgeCard.jsx
// Used in the Predict tab — shows a single EV edge play.
import { Card } from "./shared.jsx";
import { resultBorderStyle } from "../utils.js";

const MARKET_META = {
  k:    { label: "K Prop", color: "#38bdf8" },
  outs: { label: "Outs",   color: "#a78bfa" },
  hr:   { label: "HR",     color: "#fb923c" },
  hits: { label: "Hits",   color: "#34d399" },
  f5ml: { label: "F5 ML",  color: "#fbbf24" },
};

export default function EdgeCard({ c, gradeResult }) {
  const meta      = MARKET_META[c.market] ?? { label: c.market, color: "#6b7280" };
  const edgePts   = Math.round(c.edge * 100);
  const edgeColor = edgePts >= 15 ? "#22c55e" : "#fbbf24";
  const simPct    = c.simConfidence != null ? `${c.simConfidence}%` : "—";
  const bookPct   = c.impliedProb  != null ? `${Math.round(c.impliedProb * 100)}%` : "—";
  const resultBorderColor = gradeResult === true ? "#22c55e" : gradeResult === false ? "#ef4444" : null;
  const cardStyle = {
    ...resultBorderStyle(resultBorderColor),
    ...(resultBorderColor ? { borderColor: resultBorderColor } : {}),
  };

  return (
    <Card style={{ marginBottom: 8, padding: "10px 12px", ...cardStyle }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
        {c.market === "f5ml" ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb" }}>{c.gameLabel}</span>
        ) : (
          <>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb" }}>{c.playerName ?? c.name}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#000", background: "#374151", borderRadius: 4, padding: "1px 5px" }}>{c.team}</span>
          </>
        )}
        <span style={{ fontSize: 8, fontWeight: 700, color: meta.color, background: `${meta.color}18`, border: `1px solid ${meta.color}40`, borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>{meta.label}</span>
        {gradeResult === true  && <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 4, padding: "1px 6px" }}>✓ HIT</span>}
        {gradeResult === false && <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 4, padding: "1px 6px" }}>✗ MISS</span>}
      </div>

      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 6, fontFamily: "monospace" }}>
        {c.lean} {c.bookLine != null ? c.bookLine : "—"}
        {c.bookOdds != null && <span style={{ color: "#6b7280", marginLeft: 4 }}>({c.bookOdds > 0 ? "+" : ""}{c.bookOdds})</span>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: c.aiReason ? 6 : 0 }}>
        <div style={{ background: "#141726", border: "1px solid #1f2437", borderRadius: 6, padding: "4px 8px", textAlign: "center", minWidth: 50 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", fontFamily: "monospace" }}>{simPct}</div>
          <div style={{ fontSize: 7, color: "#4b5563", letterSpacing: "0.06em" }}>SIM</div>
        </div>
        <div style={{ color: "#4b5563", fontSize: 10, fontWeight: 700 }}>vs</div>
        <div style={{ background: "#141726", border: "1px solid #1f2437", borderRadius: 6, padding: "4px 8px", textAlign: "center", minWidth: 50 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", fontFamily: "monospace" }}>{bookPct}</div>
          <div style={{ fontSize: 7, color: "#4b5563", letterSpacing: "0.06em" }}>BOOK</div>
        </div>
        <div style={{ background: `${edgeColor}14`, border: `1px solid ${edgeColor}40`, borderRadius: 6, padding: "4px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: edgeColor, fontFamily: "monospace" }}>+{edgePts}pts</div>
          <div style={{ fontSize: 7, color: edgeColor, opacity: 0.7, letterSpacing: "0.06em" }}>EDGE</div>
        </div>
      </div>

      {c.aiReason && (
        <div style={{ fontSize: 10, color: "#d1d5db", fontStyle: "italic", lineHeight: 1.4, marginTop: 4 }}>{c.aiReason}</div>
      )}
    </Card>
  );
}

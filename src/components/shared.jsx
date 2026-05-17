// Shared presentational primitives — no state, no data-fetching.

export const LeanBadge = ({ label, positive, small, color: customColor, title }) => {
  const color  = customColor ?? (positive === true ? "#22c55e" : positive === false ? "#ef4444" : "#f59e0b");
  const bg     = customColor ? `${customColor}14` : positive === true ? "rgba(34,197,94,0.12)" : positive === false ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)";
  const border = customColor ? `${customColor}44` : positive === true ? "rgba(34,197,94,0.4)"  : positive === false ? "rgba(239,68,68,0.4)"  : "rgba(245,158,11,0.4)";
  return (
    <div title={title} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: small ? "2px 7px" : "4px 11px", fontSize: small ? 9 : 10, fontWeight: 700, color, fontFamily: "monospace", whiteSpace: "nowrap" }}>
      <div style={{ width: small ? 5 : 6, height: small ? 5 : 6, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />
      {label}
    </div>
  );
};

export const TIER_BADGES = {
  algorithmic: {
    label: "ALGORITHMIC",
    color: "#38bdf8",
    tooltip: "Pure deterministic formula using stats, odds, and matchup data; no LLM involved.",
  },
  projection: {
    label: "PROJECTION",
    color: "#2dd4bf",
    tooltip: "Stats-based estimate or synthetic-line fallback; no LLM involved.",
  },
  ai: {
    label: "AI-ASSISTED",
    color: "#a78bfa",
    tooltip: "LLM-assisted analysis generated from structured slate, prop, and matchup context.",
  },
  predictive: {
    label: "PREDICTIVE",
    color: "#34d399",
    tooltip: "Logistic regression model with pre-calibrated coefficients — outputs win probability, not a heuristic score.",
  },
};

export const TierBadge = ({ tier, small = true }) => {
  const badge = TIER_BADGES[tier] ?? TIER_BADGES.algorithmic;
  return <LeanBadge label={badge.label} small={small} color={badge.color} title={badge.tooltip} />;
};

export const GameStatusBadge = ({ status }) => {
  if (status === "LIVE") return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 5, padding: "1px 6px" }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 5px #ef4444", animation: "pulse 1.2s infinite" }} />
      <span style={{ fontSize: 8, fontWeight: 700, color: "#ef4444", fontFamily: "monospace", letterSpacing: "0.05em" }}>LIVE</span>
    </div>
  );
  if (status === "FINAL") return (
    <div style={{ background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.3)", borderRadius: 5, padding: "1px 6px" }}>
      <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.05em" }}>FINAL</span>
    </div>
  );
  return null;
};

export const RankScoreColumn = ({ rank, score, scoreColor: sc, simConfidence }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
    <div style={{ width: 22, height: 22, borderRadius: 6, background: "#1e2030", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#6b7280", marginTop: 1 }}>{rank}</div>
    <div style={{ fontSize: 14, fontWeight: 900, color: sc, fontFamily: "monospace", lineHeight: 1 }}>{score}</div>
    {simConfidence != null && (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#141726", border: "1px solid #1f2437", borderRadius: 8, padding: "4px 7px", minWidth: 36 }}>
        <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "monospace", color: simConfidence >= 65 ? "#34d399" : simConfidence >= 50 ? "#fbbf24" : "#f87171" }}>{simConfidence}%</div>
        <div style={{ fontSize: 7, color: "#4b5563", marginTop: 1 }}>SIM</div>
      </div>
    )}
  </div>
);

export const Card = ({ children, style, onClick }) => (
  <div style={{ background: "#161827", border: "1px solid #1f2437", borderRadius: 14, padding: "14px", marginBottom: 12, ...style }} onClick={onClick}>{children}</div>
);

export const Divider = () => <div style={{ height: 1, background: "#1f2437", margin: "10px 0" }} />;

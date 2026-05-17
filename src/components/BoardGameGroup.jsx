// src/components/BoardGameGroup.jsx
// Renders the game-label header row + card container for a single game group
// on the prop board (live and locked sections). Children are the rendered cards.
import { formatLocalTime } from "../utils.js";

export default function BoardGameGroup({ gameLabel, gameTime, phase, children }) {
  // phase: null = upcoming (live section), "live" = in-progress, "final" = game over
  const isLocked = phase === "live" || phase === "final";

  return (
    <div style={{ marginBottom: 12, opacity: phase === "final" ? 0.85 : 1 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: "#6b7280", fontFamily: "monospace",
        letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 2px 6px",
        borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 6,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span>{gameLabel}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {gameTime && (
            <span style={{ color: isLocked ? "#6b7280" : "#38bdf8" }}>
              {formatLocalTime(gameTime)}
            </span>
          )}
          {isLocked && (
            <span style={{ color: phase === "live" ? "#22c55e" : "#6b7280" }}>
              {phase === "live" ? "● LIVE" : "FINAL"}
            </span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

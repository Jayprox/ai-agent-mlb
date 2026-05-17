// src/components/TabHitBadge.jsx
// The "{hits}/{total} hit" pill badge shown on Board tab buttons.
// Positioned absolute — must be inside a position:relative parent.
export default function TabHitBadge({ hits, total }) {
  const hasHits = hits > 0;
  return (
    <span style={{
      position: "absolute", top: -7, right: -5,
      background: hasHits ? "#22c55e" : "#374151",
      color: hasHits ? "#03140a" : "#d1d5db",
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: 999, padding: "1px 5px",
      fontSize: 7, fontWeight: 900, lineHeight: 1.2,
      fontFamily: "monospace", whiteSpace: "nowrap",
    }}>
      {hits}/{total} hit
    </span>
  );
}

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, getAllByText } from "@testing-library/react";
import PitcherBoardCard from "./PitcherBoardCard.jsx";

const NEUTRAL_METRICS = { era: "3.20", kPer9: "9.5", whip: "1.15", avgIP: "6.0" };

const BASE_CANDIDATE = {
  id: 1001,
  name: "Gerrit Cole",
  team: "NYY",
  hand: "R",
  gamePk: 12345,
  gameLabel: "BOS @ NYY",
  gameTime: null,
  score: 72,
  era: "3.20",
  k9: "9.5",
  whip: "1.15",
  avgIP: "6.0",
  avgK3: "8.5",
  umpire: null,
  umpireRating: null,
  propLine: null,
  suggestedLine: 6.5,
  simConfidence: 68,
  signals: [],
  swStrPct: null,
  chasePct: null,
  facingTeam: "BOS",
};

const DEFAULT_PROPS = {
  c: BASE_CANDIDATE,
  rank: 1,
  boardTab: "k",
  sc: "#22c55e",
  boardGameStatus: null,
  todayResult: null,
  pitcherMetrics: NEUTRAL_METRICS,
  summaryText: null,
  isPremium: false,
  preferredBook: "DK",
  onCardClick: vi.fn(),
};

describe("PitcherBoardCard", () => {
  it("renders player name and team", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("Gerrit Cole")).toBeTruthy();
    expect(screen.getByText("NYY")).toBeTruthy();
  });

  it("renders rank and score", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("72")).toBeTruthy();
  });

  it("renders OVER lean badge for score >= 55", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} />);
    // OVER appears in both the lean badge and the prop badge column
    expect(screen.getAllByText("OVER").length).toBeGreaterThanOrEqual(1);
  });

  it("renders UNDER lean badge for score < 55", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} c={{ ...BASE_CANDIDATE, score: 42 }} sc="#ef4444" />);
    expect(screen.getAllByText("UNDER").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onCardClick when card is clicked", () => {
    const onClick = vi.fn();
    const { container } = render(<PitcherBoardCard {...DEFAULT_PROPS} onCardClick={onClick} />);
    fireEvent.click(container.firstChild);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows LIVE badge when boardGameStatus is LIVE", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} boardGameStatus="LIVE" />);
    expect(screen.getByText("LIVE")).toBeTruthy();
  });

  it("shows FINAL badge when boardGameStatus is FINAL", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} boardGameStatus="FINAL" />);
    expect(screen.getByText("FINAL")).toBeTruthy();
  });

  it("shows hit badge when result resolves as a hit (OVER, K > line)", () => {
    render(
      <PitcherBoardCard
        {...DEFAULT_PROPS}
        boardGameStatus="FINAL"
        todayResult={{ k: 9, outs: 18, live: false }}
        c={{ ...BASE_CANDIDATE, score: 72, suggestedLine: 6.5 }}
      />
    );
    // Score >= 55 → OVER; 9K > 6.5 line → hit badge "✓ 9K"
    expect(screen.getByText("✓ 9K")).toBeTruthy();
  });

  it("shows miss badge when result resolves as a miss (OVER, K < line)", () => {
    render(
      <PitcherBoardCard
        {...DEFAULT_PROPS}
        boardGameStatus="FINAL"
        todayResult={{ k: 4, outs: 12, live: false }}
        c={{ ...BASE_CANDIDATE, score: 72, suggestedLine: 6.5 }}
      />
    );
    expect(screen.getByText("✗ 4K")).toBeTruthy();
  });

  it("shows AI summary text when provided", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} summaryText="Strong K upside today." />);
    expect(screen.getByText("Strong K upside today.")).toBeTruthy();
  });

  it("does not show summary when summaryText is null", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} summaryText={null} />);
    expect(screen.queryByText(/Strong K/)).toBeNull();
  });

  it("shows SIM confidence via RankScoreColumn", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("68%")).toBeTruthy();
    expect(screen.getByText("SIM")).toBeTruthy();
  });

  it("shows UMP+K badge when umpireRating is pitcher and boardTab is k", () => {
    render(
      <PitcherBoardCard
        {...DEFAULT_PROPS}
        c={{ ...BASE_CANDIDATE, umpireRating: "pitcher" }}
        boardTab="k"
      />
    );
    expect(screen.getByText("⚖ UMP+K")).toBeTruthy();
  });

  it("does not show UMP+K badge on outs tab", () => {
    render(
      <PitcherBoardCard
        {...DEFAULT_PROPS}
        c={{ ...BASE_CANDIDATE, umpireRating: "pitcher" }}
        boardTab="outs"
      />
    );
    expect(screen.queryByText("⚖ UMP+K")).toBeNull();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BatterBoardCard from "./BatterBoardCard.jsx";

const BASE_CANDIDATE = {
  id: 2001,
  name: "Aaron Judge",
  team: "NYY",
  hand: "R",
  order: 3,
  gamePk: 12345,
  gameLabel: "BOS @ NYY",
  gameTime: null,
  score: 74,
  avg: "0.290",
  slg: "0.580",
  hr: 22,
  ops: "1.000",
  hitRate: [1, 1, 0, 1, 1],
  propLine: null,
  simConfidence: 71,
  windFav: false,
  parkFactor: 1.0,
  pitcher: "Chris Sale",
  pitcherHand: "L",
  lineupState: "confirmed",
  isSubstitution: false,
  substitutedFor: null,
};

const DEFAULT_PROPS = {
  c: BASE_CANDIDATE,
  rank: 1,
  boardTab: "hr",
  sc: "#22c55e",
  boardGameStatus: null,
  todayResult: null,
  evEdge: null,
  summaryText: null,
  isPremium: false,
  preferredBook: "DK",
  onCardClick: vi.fn(),
};

describe("BatterBoardCard", () => {
  it("renders player name and team", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("Aaron Judge")).toBeTruthy();
    expect(screen.getByText("NYY")).toBeTruthy();
  });

  it("renders rank and score", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("1")).toBeTruthy();
    // Score renders in both RankScoreColumn and the score badge on the right
    expect(screen.getAllByText("74").length).toBeGreaterThanOrEqual(1);
  });

  it("renders 5 L5 dots", () => {
    const { container } = render(<BatterBoardCard {...DEFAULT_PROPS} />);
    // hitRate [1,1,0,1,1] = 5 dots with border-radius: 50%
    const dots = container.querySelectorAll("[style*='border-radius: 50%']");
    expect(dots.length).toBeGreaterThanOrEqual(5);
  });

  it("shows LIVE badge when boardGameStatus is LIVE", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} boardGameStatus="LIVE" />);
    expect(screen.getByText("LIVE")).toBeTruthy();
  });

  it("shows FINAL badge when boardGameStatus is FINAL", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} boardGameStatus="FINAL" />);
    expect(screen.getByText("FINAL")).toBeTruthy();
  });

  it("shows CONFIRMED badge for confirmed lineup when not live/final", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} boardGameStatus={null} />);
    expect(screen.getByText("✓ CONFIRMED")).toBeTruthy();
  });

  it("shows LINEUP TBD badge for roster state", () => {
    render(
      <BatterBoardCard
        {...DEFAULT_PROPS}
        c={{ ...BASE_CANDIDATE, lineupState: "roster" }}
        boardGameStatus={null}
      />
    );
    expect(screen.getByText("LINEUP TBD")).toBeTruthy();
  });

  it("shows WIND badge for wind-favorable HR candidates", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} c={{ ...BASE_CANDIDATE, windFav: true }} />);
    expect(screen.getByText("↑ WIND")).toBeTruthy();
  });

  it("does not show WIND badge on hits tab", () => {
    render(
      <BatterBoardCard
        {...DEFAULT_PROPS}
        c={{ ...BASE_CANDIDATE, windFav: true }}
        boardTab="hits"
      />
    );
    expect(screen.queryByText("↑ WIND")).toBeNull();
  });

  it("shows SUB badge for substitution candidates", () => {
    render(
      <BatterBoardCard
        {...DEFAULT_PROPS}
        c={{ ...BASE_CANDIDATE, isSubstitution: true, substitutedFor: "Original Player" }}
      />
    );
    expect(screen.getByText("↔ SUB")).toBeTruthy();
  });

  it("shows 'replaces' line for substitution with substitutedFor", () => {
    render(
      <BatterBoardCard
        {...DEFAULT_PROPS}
        c={{ ...BASE_CANDIDATE, isSubstitution: true, substitutedFor: "Original Player" }}
      />
    );
    expect(screen.getByText("replaces Original Player")).toBeTruthy();
  });

  it("shows HR result badge when batter hit a HR", () => {
    render(
      <BatterBoardCard
        {...DEFAULT_PROPS}
        boardGameStatus="FINAL"
        todayResult={{ ab: 4, hr: 1, h: 1 }}
      />
    );
    expect(screen.getByText("⚾ HR")).toBeTruthy();
  });

  it("shows NO HR badge when HR board, final, no HR", () => {
    render(
      <BatterBoardCard
        {...DEFAULT_PROPS}
        boardGameStatus="FINAL"
        todayResult={{ ab: 4, hr: 0, h: 1 }}
        boardTab="hr"
      />
    );
    expect(screen.getByText("✗ NO HR")).toBeTruthy();
  });

  it("shows HIT badge on hits tab when batter got a hit (no HR)", () => {
    render(
      <BatterBoardCard
        {...DEFAULT_PROPS}
        boardTab="hits"
        boardGameStatus="FINAL"
        todayResult={{ ab: 4, hr: 0, h: 2 }}
      />
    );
    expect(screen.getByText("✓ HIT ×2")).toBeTruthy();
  });

  it("shows NO HIT badge on hits tab when 0-fer", () => {
    render(
      <BatterBoardCard
        {...DEFAULT_PROPS}
        boardTab="hits"
        boardGameStatus="FINAL"
        todayResult={{ ab: 4, hr: 0, h: 0 }}
      />
    );
    expect(screen.getByText("✗ NO HIT")).toBeTruthy();
  });

  it("shows EV edge badge when evEdge has a positive edge", () => {
    render(
      <BatterBoardCard
        {...DEFAULT_PROPS}
        evEdge={{ edge: 8, lean: "over", modelImplied: 60, bookImplied: 52, bestOdds: -110 }}
      />
    );
    expect(screen.getByText("+8% EDGE")).toBeTruthy();
  });

  it("shows VALUE badge when evEdge has a large negative edge", () => {
    render(
      <BatterBoardCard
        {...DEFAULT_PROPS}
        evEdge={{ edge: -6, lean: "under", modelImplied: 40, bookImplied: 46, bestOdds: -115 }}
      />
    );
    expect(screen.getByText("-6% VALUE")).toBeTruthy();
  });

  it("does not show EV edge badge when evEdge is null", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} evEdge={null} />);
    expect(screen.queryByText(/EDGE/)).toBeNull();
  });

  it("does not show EV edge badge when edge is small (< 3 and > -5)", () => {
    render(
      <BatterBoardCard
        {...DEFAULT_PROPS}
        evEdge={{ edge: 2, lean: "over", modelImplied: 52, bookImplied: 50, bestOdds: -110 }}
      />
    );
    expect(screen.queryByText(/EDGE/)).toBeNull();
  });

  it("shows AI summary text when provided", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} summaryText="Hot bat, favorable matchup." />);
    expect(screen.getByText("Hot bat, favorable matchup.")).toBeTruthy();
  });

  it("does not show summary when summaryText is null", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} summaryText={null} />);
    expect(screen.queryByText(/Hot bat/)).toBeNull();
  });

  it("shows SIM confidence", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("71%")).toBeTruthy();
    expect(screen.getByText("SIM")).toBeTruthy();
  });

  it("shows batting order number", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("#3")).toBeTruthy();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GameBoardCard from "./GameBoardCard.jsx";

const BASE_CANDIDATE = {
  gamePk: 12345,
  away:  { abbr: "BOS" },
  home:  { abbr: "NYY" },
  gameTime: null,
  lean: "NRFI",
  leanAbbr: null,
  line: null,
  score: 72,
  homeSP: { id: 1, name: "Gerrit Cole", era: "3.20" },
  awaySP: { id: 2, name: "Chris Sale",  era: "4.10" },
  weather: null,
  odds: null,
};

const DEFAULT_PROPS = {
  c: BASE_CANDIDATE,
  rank: 1,
  gameSubTab: "nrfi",
  sc: "#22c55e",
  lc: "#22c55e",
  displayScore: 72,
  gameStatus: null,
  gameHit: null,
  finalTotalRuns: null,
  homeSPEra: 3.20,
  awaySPEra: 4.10,
  summaryText: null,
  isPremium: false,
  preferredBook: "DK",
  onCardClick: vi.fn(),
};

describe("GameBoardCard", () => {
  it("renders matchup teams", () => {
    render(<GameBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("BOS @ NYY")).toBeTruthy();
  });

  it("renders rank and display score", () => {
    render(<GameBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("72")).toBeTruthy();
  });

  it("renders lean badge", () => {
    render(<GameBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("NRFI")).toBeTruthy();
  });

  it("renders AWAY lean when leanAbbr matches away team", () => {
    render(<GameBoardCard
      {...DEFAULT_PROPS}
      c={{ ...BASE_CANDIDATE, lean: "AWAY", leanAbbr: "BOS" }}
      lc="#ef4444"
    />);
    expect(screen.getByText("BOS")).toBeTruthy();
  });

  it("renders home SP name and ERA", () => {
    render(<GameBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("Gerrit Cole")).toBeTruthy();
    expect(screen.getByText("3.20 ERA")).toBeTruthy();
  });

  it("renders away SP name and ERA", () => {
    render(<GameBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("Chris Sale")).toBeTruthy();
    expect(screen.getByText("4.10 ERA")).toBeTruthy();
  });

  it("shows LIVE badge when gameStatus is LIVE", () => {
    render(<GameBoardCard {...DEFAULT_PROPS} gameStatus="LIVE" />);
    expect(screen.getByText("LIVE")).toBeTruthy();
  });

  it("shows FINAL badge when gameStatus is FINAL", () => {
    render(<GameBoardCard {...DEFAULT_PROPS} gameStatus="FINAL" />);
    expect(screen.getByText("FINAL")).toBeTruthy();
  });

  it("shows HIT badge when gameHit is true", () => {
    render(<GameBoardCard {...DEFAULT_PROPS} gameHit={true} />);
    expect(screen.getByText("✓ HIT")).toBeTruthy();
  });

  it("shows MISS badge when gameHit is false", () => {
    render(<GameBoardCard {...DEFAULT_PROPS} gameHit={false} />);
    expect(screen.getByText("✗ MISS")).toBeTruthy();
  });

  it("shows final runs when provided", () => {
    render(<GameBoardCard {...DEFAULT_PROPS} finalTotalRuns={8} />);
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText(/Final runs/)).toBeTruthy();
  });

  it("shows weather when provided (no roof)", () => {
    render(<GameBoardCard
      {...DEFAULT_PROPS}
      c={{ ...BASE_CANDIDATE, weather: { temp: 72, wind: "10 mph out to CF", roof: false } }}
    />);
    expect(screen.getByText(/72°F/)).toBeTruthy();
  });

  it("shows Dome when roof is true", () => {
    render(<GameBoardCard
      {...DEFAULT_PROPS}
      c={{ ...BASE_CANDIDATE, weather: { roof: true } }}
    />);
    expect(screen.getByText("Dome")).toBeTruthy();
  });

  it("shows AI summary when provided", () => {
    render(<GameBoardCard {...DEFAULT_PROPS} summaryText="Both aces, lean NRFI." />);
    expect(screen.getByText("Both aces, lean NRFI.")).toBeTruthy();
  });

  it("shows premium symbol when isPremium is true", () => {
    render(<GameBoardCard {...DEFAULT_PROPS} summaryText="Premium insight." isPremium={true} />);
    expect(screen.getByText("✦")).toBeTruthy();
  });

  it("does not show summary when summaryText is null", () => {
    render(<GameBoardCard {...DEFAULT_PROPS} summaryText={null} />);
    expect(screen.queryByText(/insight/)).toBeNull();
  });

  it("does not show book chips for nrfi sub-tab", () => {
    render(<GameBoardCard
      {...DEFAULT_PROPS}
      gameSubTab="nrfi"
      c={{ ...BASE_CANDIDATE, odds: { books: { DK: { total: 8.5, overOdds: -110, underOdds: -110 } } } }}
    />);
    // nrfi suppresses book chips
    expect(screen.queryByText(/O\/U/)).toBeNull();
  });

  it("shows total book chip for total sub-tab", () => {
    render(<GameBoardCard
      {...DEFAULT_PROPS}
      gameSubTab="total"
      c={{ ...BASE_CANDIDATE, odds: { books: { DK: { total: 8.5, overOdds: -110, underOdds: -110 } } } }}
    />);
    expect(screen.getByText(/O\/U 8.5/)).toBeTruthy();
  });

  it("calls onCardClick when card is clicked", () => {
    const onClick = vi.fn();
    const { container } = render(<GameBoardCard {...DEFAULT_PROPS} onCardClick={onClick} />);
    container.firstChild.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EdgeCard from "./EdgeCard.jsx";

const BASE_CANDIDATE = {
  id: "edge-001",
  market: "k",
  playerName: "Gerrit Cole",
  name: "Gerrit Cole",
  team: "NYY",
  lean: "OVER",
  bookLine: 7.5,
  bookOdds: -115,
  edge: 0.18,           // 18 edge points
  simConfidence: 74,
  impliedProb: 0.52,
  gamePk: 12345,
  gameLabel: "BOS @ NYY",
  aiReason: null,
};

describe("EdgeCard", () => {
  it("renders player name and team", () => {
    render(<EdgeCard c={BASE_CANDIDATE} gradeResult={null} />);
    expect(screen.getByText("Gerrit Cole")).toBeTruthy();
    expect(screen.getByText("NYY")).toBeTruthy();
  });

  it("renders market badge with correct label", () => {
    render(<EdgeCard c={BASE_CANDIDATE} gradeResult={null} />);
    expect(screen.getByText("K Prop")).toBeTruthy();
  });

  it("renders lean and book line", () => {
    render(<EdgeCard c={BASE_CANDIDATE} gradeResult={null} />);
    expect(screen.getByText(/OVER.*7\.5/)).toBeTruthy();
  });

  it("renders book odds", () => {
    render(<EdgeCard c={BASE_CANDIDATE} gradeResult={null} />);
    expect(screen.getByText(/\(-115\)/)).toBeTruthy();
  });

  it("renders SIM confidence", () => {
    render(<EdgeCard c={BASE_CANDIDATE} gradeResult={null} />);
    expect(screen.getByText("74%")).toBeTruthy();
    expect(screen.getByText("SIM")).toBeTruthy();
  });

  it("renders BOOK implied probability", () => {
    render(<EdgeCard c={BASE_CANDIDATE} gradeResult={null} />);
    expect(screen.getByText("52%")).toBeTruthy();
    expect(screen.getByText("BOOK")).toBeTruthy();
  });

  it("renders edge points badge", () => {
    render(<EdgeCard c={BASE_CANDIDATE} gradeResult={null} />);
    expect(screen.getByText("+18pts")).toBeTruthy();
    expect(screen.getByText("EDGE")).toBeTruthy();
  });

  it("shows HIT badge when gradeResult is true", () => {
    render(<EdgeCard c={BASE_CANDIDATE} gradeResult={true} />);
    expect(screen.getByText("✓ HIT")).toBeTruthy();
  });

  it("shows MISS badge when gradeResult is false", () => {
    render(<EdgeCard c={BASE_CANDIDATE} gradeResult={false} />);
    expect(screen.getByText("✗ MISS")).toBeTruthy();
  });

  it("shows no result badge when gradeResult is null", () => {
    render(<EdgeCard c={BASE_CANDIDATE} gradeResult={null} />);
    expect(screen.queryByText("✓ HIT")).toBeNull();
    expect(screen.queryByText("✗ MISS")).toBeNull();
  });

  it("shows aiReason when provided", () => {
    render(<EdgeCard c={{ ...BASE_CANDIDATE, aiReason: "Cole dominates this lineup." }} gradeResult={null} />);
    expect(screen.getByText("Cole dominates this lineup.")).toBeTruthy();
  });

  it("does not show aiReason section when null", () => {
    render(<EdgeCard c={BASE_CANDIDATE} gradeResult={null} />);
    expect(screen.queryByText(/dominates/)).toBeNull();
  });

  it("shows game label for f5ml market", () => {
    render(<EdgeCard
      c={{ ...BASE_CANDIDATE, market: "f5ml", gameLabel: "BOS @ NYY" }}
      gradeResult={null}
    />);
    expect(screen.getByText("BOS @ NYY")).toBeTruthy();
    expect(screen.getByText("F5 ML")).toBeTruthy();
  });

  it("renders HR market badge correctly", () => {
    render(<EdgeCard c={{ ...BASE_CANDIDATE, market: "hr" }} gradeResult={null} />);
    expect(screen.getByText("HR")).toBeTruthy();
  });

  it("renders hits market badge correctly", () => {
    render(<EdgeCard c={{ ...BASE_CANDIDATE, market: "hits" }} gradeResult={null} />);
    expect(screen.getByText("Hits")).toBeTruthy();
  });

  it("uses positive bookOdds format correctly", () => {
    render(<EdgeCard c={{ ...BASE_CANDIDATE, bookOdds: 120 }} gradeResult={null} />);
    expect(screen.getByText(/\(\+120\)/)).toBeTruthy();
  });
});

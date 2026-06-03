import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ScoutPickCard from "./ScoutPickCard.jsx";

const basePick = {
  id: "1",
  market: "k",
  playerName: "Gerrit Cole",
  gameLabel: "BOS @ NYY",
  lean: "OVER",
  bookLine: 6.5,
  bookOdds: -112,
  impliedProb: 0.527,
  modelProb: 0.74,
  kellyFraction: 0.18,
  shortReason: "Cole has posted 7+ Ks in four of his last five starts.",
  confidenceStatement: "The model edge is materially above the book price.",
  keyRisk: "Short rest can cap pitch count.",
};

describe("ScoutPickCard", () => {
  it("renders player name and market badge", () => {
    render(<ScoutPickCard c={basePick} rank={1} unitSize={25} gradeResult={null} />);
    expect(screen.getByText("Gerrit Cole")).toBeInTheDocument();
    expect(screen.getByText("K Prop")).toBeInTheDocument();
  });

  it("renders game label for game markets", () => {
    render(<ScoutPickCard c={{ ...basePick, market: "ml", playerName: null, gameLabel: "BOS @ NYY" }} rank={1} unitSize={25} gradeResult={null} />);
    expect(screen.getAllByText("BOS @ NYY").length).toBeGreaterThan(0);
  });

  it("shows payout line", () => {
    render(<ScoutPickCard c={basePick} rank={1} unitSize={25} gradeResult={null} />);
    expect(screen.getByText(/Bet: \$25\.00 to win \$22\.32/)).toBeInTheDocument();
  });

  it("shows hit badge when gradeResult is true", () => {
    render(<ScoutPickCard c={basePick} rank={1} unitSize={25} gradeResult={true} />);
    expect(screen.getByText("✓ HIT")).toBeInTheDocument();
  });

  it("shows miss badge when gradeResult is false", () => {
    render(<ScoutPickCard c={basePick} rank={1} unitSize={25} gradeResult={false} />);
    expect(screen.getByText("✗ MISS")).toBeInTheDocument();
  });

  it("shows no badge when gradeResult is null", () => {
    render(<ScoutPickCard c={basePick} rank={1} unitSize={25} gradeResult={null} />);
    expect(screen.queryByText("✓ HIT")).not.toBeInTheDocument();
    expect(screen.queryByText("✗ MISS")).not.toBeInTheDocument();
  });

  it("shows shortReason text when provided", () => {
    render(<ScoutPickCard c={basePick} rank={1} unitSize={25} gradeResult={null} />);
    expect(screen.getByText(/Cole has posted 7\+ Ks/)).toBeInTheDocument();
  });

  it("shows keyRisk text when provided", () => {
    render(<ScoutPickCard c={basePick} rank={1} unitSize={25} gradeResult={null} />);
    expect(screen.getByText(/Short rest can cap pitch count/)).toBeInTheDocument();
  });

  it("does not show reasoning section when shortReason is null", () => {
    render(<ScoutPickCard c={{ ...basePick, shortReason: null }} rank={1} unitSize={25} gradeResult={null} />);
    expect(screen.queryByText(/Cole has posted 7\+ Ks/)).not.toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  LeanBadge,
  TierBadge,
  GameStatusBadge,
  RankScoreColumn,
  Card,
  Divider,
} from "./shared.jsx";

describe("LeanBadge", () => {
  it("renders its label text", () => {
    render(<LeanBadge label="OVER" positive={true} small />);
    expect(screen.getByText("OVER")).toBeTruthy();
  });

  it("renders without crashing for negative signal", () => {
    render(<LeanBadge label="UNDER" positive={false} small />);
    expect(screen.getByText("UNDER")).toBeTruthy();
  });

  it("renders without crashing with a custom color", () => {
    render(<LeanBadge label="NEUTRAL" color="#f59e0b" small />);
    expect(screen.getByText("NEUTRAL")).toBeTruthy();
  });
});

describe("TierBadge", () => {
  it("renders ALGORITHMIC for 'algorithmic' tier", () => {
    render(<TierBadge tier="algorithmic" />);
    expect(screen.getByText("ALGORITHMIC")).toBeTruthy();
  });

  it("renders AI-ASSISTED for 'ai' tier", () => {
    render(<TierBadge tier="ai" />);
    expect(screen.getByText("AI-ASSISTED")).toBeTruthy();
  });

  it("falls back to ALGORITHMIC for unknown tier", () => {
    render(<TierBadge tier="unknown_tier" />);
    expect(screen.getByText("ALGORITHMIC")).toBeTruthy();
  });

  it("renders PREDICTIVE for 'predictive' tier", () => {
    render(<TierBadge tier="predictive" />);
    expect(screen.getByText("PREDICTIVE")).toBeTruthy();
  });
});

describe("GameStatusBadge", () => {
  it("renders LIVE text for status=LIVE", () => {
    render(<GameStatusBadge status="LIVE" />);
    expect(screen.getByText("LIVE")).toBeTruthy();
  });

  it("renders FINAL text for status=FINAL", () => {
    render(<GameStatusBadge status="FINAL" />);
    expect(screen.getByText("FINAL")).toBeTruthy();
  });

  it("renders nothing for unknown status", () => {
    const { container } = render(<GameStatusBadge status="SCHEDULED" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for no status", () => {
    const { container } = render(<GameStatusBadge />);
    expect(container.firstChild).toBeNull();
  });
});

describe("RankScoreColumn", () => {
  it("renders rank and score", () => {
    render(<RankScoreColumn rank={3} score={72} scoreColor="#22c55e" simConfidence={null} />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("72")).toBeTruthy();
  });

  it("renders SIM confidence when provided", () => {
    render(<RankScoreColumn rank={1} score={85} scoreColor="#22c55e" simConfidence={68} />);
    expect(screen.getByText("68%")).toBeTruthy();
    expect(screen.getByText("SIM")).toBeTruthy();
  });

  it("does not render SIM block when simConfidence is null", () => {
    render(<RankScoreColumn rank={1} score={85} scoreColor="#22c55e" simConfidence={null} />);
    expect(screen.queryByText("SIM")).toBeNull();
  });
});

describe("Card", () => {
  it("renders children", () => {
    render(<Card><span>hello</span></Card>);
    expect(screen.getByText("hello")).toBeTruthy();
  });
});

describe("Divider", () => {
  it("renders without crashing", () => {
    const { container } = render(<Divider />);
    expect(container.firstChild).toBeTruthy();
  });
});

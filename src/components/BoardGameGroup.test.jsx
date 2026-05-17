import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BoardGameGroup from "./BoardGameGroup.jsx";

describe("BoardGameGroup", () => {
  it("renders game label", () => {
    render(<BoardGameGroup gameLabel="BOS @ NYY" gameTime={null} phase={null}><div>card</div></BoardGameGroup>);
    expect(screen.getByText("BOS @ NYY")).toBeTruthy();
  });

  it("renders children", () => {
    render(<BoardGameGroup gameLabel="BOS @ NYY" gameTime={null} phase={null}><div>child-card</div></BoardGameGroup>);
    expect(screen.getByText("child-card")).toBeTruthy();
  });

  it("shows LIVE status for live phase", () => {
    render(<BoardGameGroup gameLabel="BOS @ NYY" gameTime={null} phase="live"><div /></BoardGameGroup>);
    expect(screen.getByText("● LIVE")).toBeTruthy();
  });

  it("shows FINAL status for final phase", () => {
    render(<BoardGameGroup gameLabel="BOS @ NYY" gameTime={null} phase="final"><div /></BoardGameGroup>);
    expect(screen.getByText("FINAL")).toBeTruthy();
  });

  it("does not show LIVE or FINAL for upcoming (null phase)", () => {
    render(<BoardGameGroup gameLabel="BOS @ NYY" gameTime={null} phase={null}><div /></BoardGameGroup>);
    expect(screen.queryByText("● LIVE")).toBeNull();
    expect(screen.queryByText("FINAL")).toBeNull();
  });

  it("applies reduced opacity for final phase", () => {
    const { container } = render(
      <BoardGameGroup gameLabel="BOS @ NYY" gameTime={null} phase="final"><div /></BoardGameGroup>
    );
    expect(container.firstChild.style.opacity).toBe("0.85");
  });

  it("does not reduce opacity for live phase", () => {
    const { container } = render(
      <BoardGameGroup gameLabel="BOS @ NYY" gameTime={null} phase="live"><div /></BoardGameGroup>
    );
    expect(container.firstChild.style.opacity).not.toBe("0.85");
  });

  it("shows game time in blue for upcoming group", () => {
    render(
      <BoardGameGroup gameLabel="BOS @ NYY" gameTime="2026-05-16T19:10:00Z" phase={null}><div /></BoardGameGroup>
    );
    // Time is shown (exact format depends on locale, just check it renders)
    const timeEl = screen.getByText(/:/);
    // JSDOM normalizes hex to rgb
    expect(timeEl.style.color).toBe("rgb(56, 189, 248)");
  });

  it("shows game time in gray for locked group", () => {
    render(
      <BoardGameGroup gameLabel="BOS @ NYY" gameTime="2026-05-16T19:10:00Z" phase="live"><div /></BoardGameGroup>
    );
    const timeEl = screen.getByText(/:/);
    expect(timeEl.style.color).toBe("rgb(107, 114, 128)");
  });

  it("renders multiple children", () => {
    render(
      <BoardGameGroup gameLabel="BOS @ NYY" gameTime={null} phase={null}>
        <div>card-1</div>
        <div>card-2</div>
        <div>card-3</div>
      </BoardGameGroup>
    );
    expect(screen.getByText("card-1")).toBeTruthy();
    expect(screen.getByText("card-2")).toBeTruthy();
    expect(screen.getByText("card-3")).toBeTruthy();
  });
});

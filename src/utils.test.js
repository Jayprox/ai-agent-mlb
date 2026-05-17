import { describe, it, expect } from "vitest";
import { mlToImplied, resultBorderStyle, summarizeOutcomes } from "./utils.js";

describe("mlToImplied", () => {
  it("converts negative American odds to implied probability", () => {
    expect(mlToImplied(-200)).toBeCloseTo(0.6667, 3);
  });

  it("converts positive American odds to implied probability", () => {
    expect(mlToImplied(150)).toBeCloseTo(0.4, 3);
  });

  it("preserves the current behavior for edge-case input", () => {
    expect(mlToImplied(0)).toBe(1);
    expect(mlToImplied(null)).toBeCloseTo(0.5, 3);
  });
});

describe("resultBorderStyle", () => {
  it("returns border style when color is provided", () => {
    const style = resultBorderStyle("#22c55e");
    expect(style.borderLeft).toContain("#22c55e");
    expect(style.paddingLeft).toBe(10);
  });

  it("returns empty object when color is null", () => {
    expect(resultBorderStyle(null)).toEqual({});
  });

  it("returns empty object when color is undefined", () => {
    expect(resultBorderStyle(undefined)).toEqual({});
  });
});

describe("summarizeOutcomes", () => {
  it("returns null for empty items array", () => {
    expect(summarizeOutcomes([], () => true)).toBeNull();
  });

  it("returns null when no items resolve", () => {
    expect(summarizeOutcomes([{}, {}], () => null)).toBeNull();
  });

  it("counts hits and total correctly", () => {
    const items = [1, 2, 3, 4];
    const result = summarizeOutcomes(items, v => v % 2 === 0);
    expect(result.hits).toBe(2);
    expect(result.total).toBe(4);
  });

  it("excludes null outcomes from total count", () => {
    const items = [1, 2, 3];
    const result = summarizeOutcomes(items, v => v === 2 ? true : null);
    expect(result.hits).toBe(1);
    expect(result.total).toBe(3);
  });
});

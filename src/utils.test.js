import { describe, it, expect } from "vitest";
import { mlToImplied, resultBorderStyle, summarizeOutcomes, kellyFraction } from "./utils.js";

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
    expect(result.resolved).toBe(4);
  });

  it("excludes null outcomes from total count", () => {
    const items = [1, 2, 3];
    const result = summarizeOutcomes(items, v => v === 2 ? true : null);
    expect(result.hits).toBe(1);
    expect(result.total).toBe(3);
    expect(result.resolved).toBe(1);
  });

  it("returns resolved counts for all-false outcomes", () => {
    const items = [1, 2, 3];
    expect(summarizeOutcomes(items, () => false)).toEqual({
      hits: 0,
      total: 3,
      resolved: 3,
    });
  });

  it("counts only non-null outcomes in resolved for mixed results", () => {
    const items = [1, 2, 3, 4];
    expect(summarizeOutcomes(items, v => (
      v === 1 ? true : v === 2 ? false : null
    ))).toEqual({
      hits: 1,
      total: 4,
      resolved: 2,
    });
  });

  it("handles a single true outcome", () => {
    expect(summarizeOutcomes([1], () => true)).toEqual({
      hits: 1,
      total: 1,
      resolved: 1,
    });
  });

  it("handles a single false outcome", () => {
    expect(summarizeOutcomes([1], () => false)).toEqual({
      hits: 0,
      total: 1,
      resolved: 1,
    });
  });
});

describe("kellyFraction", () => {
  it("returns positive fraction for +EV bet", () => {
    expect(kellyFraction(0.65, -110)).toBeGreaterThan(0);
  });

  it("returns 0 for -EV bet", () => {
    expect(kellyFraction(0.45, -110)).toBe(0);
  });

  it("clamps to 0.30 maximum", () => {
    expect(kellyFraction(0.99, +500)).toBe(0.30);
  });
});

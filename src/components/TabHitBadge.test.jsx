import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TabHitBadge from "./TabHitBadge.jsx";

describe("TabHitBadge", () => {
  it("renders hits/total text", () => {
    render(<TabHitBadge hits={3} total={5} />);
    expect(screen.getByText("3/5 hit")).toBeTruthy();
  });

  it("renders zero hits", () => {
    render(<TabHitBadge hits={0} total={8} />);
    expect(screen.getByText("0/8 hit")).toBeTruthy();
  });

  it("uses green background when hits > 0", () => {
    const { container } = render(<TabHitBadge hits={2} total={4} />);
    // JSDOM normalizes hex to rgb
    expect(container.firstChild.style.background).toBe("rgb(34, 197, 94)");
  });

  it("uses gray background when hits === 0", () => {
    const { container } = render(<TabHitBadge hits={0} total={4} />);
    expect(container.firstChild.style.background).toBe("rgb(55, 65, 81)");
  });

  it("uses dark text color when hits > 0", () => {
    const { container } = render(<TabHitBadge hits={1} total={3} />);
    expect(container.firstChild.style.color).toBe("rgb(3, 20, 10)");
  });

  it("uses light text color when hits === 0", () => {
    const { container } = render(<TabHitBadge hits={0} total={3} />);
    expect(container.firstChild.style.color).toBe("rgb(209, 213, 219)");
  });

  it("renders all hits case", () => {
    render(<TabHitBadge hits={5} total={5} />);
    expect(screen.getByText("5/5 hit")).toBeTruthy();
  });

  it("renders single hit", () => {
    render(<TabHitBadge hits={1} total={10} />);
    expect(screen.getByText("1/10 hit")).toBeTruthy();
  });
});

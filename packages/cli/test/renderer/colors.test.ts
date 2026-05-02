import { describe, expect, it } from "vitest";

import { createColors, shouldUseColor } from "../../src/index.js";

describe("renderer colors", () => {
  it("disables ANSI escapes when --no-color is enabled", () => {
    const colors = createColors({ noColor: true, isTTY: true, env: {} });

    expect(colors.enabled).toBe(false);
    expect(colors.success("done")).toBe("done");
    expect(colors.error("fail")).toBe("fail");
  });

  it("respects NO_COLOR from the environment", () => {
    expect(shouldUseColor({ isTTY: true, env: { NO_COLOR: "1" } })).toBe(false);
  });

  it("enables ANSI escapes on TTY output when colors are allowed", () => {
    const colors = createColors({ isTTY: true, env: {} });

    expect(colors.enabled).toBe(true);
    expect(colors.info("streaming")).toMatch(/\u001B\[/u);
  });
});
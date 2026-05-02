import { describe, expect, it } from "vitest";

import { normalizeContent, normalizedSha256, sha256 } from "../src/index.js";

describe("hash-utils", () => {
  it("normalizes line endings, trailing whitespace, and trailing newlines", () => {
    expect(normalizeContent("a  \r\n  b\t\r\n\r\n")).toBe("a\n  b\n");
  });

  it("produces the same hash for equivalent LF and CRLF content", () => {
    expect(normalizedSha256("line 1\nline 2\n")).toBe(normalizedSha256("line 1\r\nline 2\r\n\r\n"));
  });

  it("prefixes raw hashes with sha256", () => {
    expect(sha256("content")).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
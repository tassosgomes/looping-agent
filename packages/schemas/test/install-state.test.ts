import { describe, expect, it } from "vitest";

import { InstallState } from "../src/index.js";

const validState = {
  looping_agent_version: "1.0.0",
  installed_at: "2026-04-26T13:00:00Z",
  skills: {
    "flow-prd-creator": {
      hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      installed_version: "1.0.0"
    },
    "flow-implementer": {
      hash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      installed_version: "1.0.0"
    }
  }
} as const;

describe("install state schema", () => {
  it("accepts valid install state", () => {
    expect(InstallState.parse(validState)).toMatchObject({
      looping_agent_version: "1.0.0"
    });
  });

  it("rejects invalid install state fields", () => {
    expect(() => InstallState.parse({
      ...validState,
      looping_agent_version: ""
    })).toThrow();

    expect(() => InstallState.parse({
      ...validState,
      installed_at: "not-a-date"
    })).toThrow();

    expect(() => InstallState.parse({
      ...validState,
      extra: true
    })).toThrow();
  });

  it("rejects invalid skill entries", () => {
    expect(() => InstallState.parse({
      ...validState,
      skills: {
        "prd-creator": {
          hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          installed_version: "1.0.0"
        }
      }
    })).toThrow();

    expect(() => InstallState.parse({
      ...validState,
      skills: {
        "flow-prd-creator": {
          hash: "sha256:not-a-real-hash",
          installed_version: "1.0.0"
        }
      }
    })).toThrow();

    expect(() => InstallState.parse({
      ...validState,
      skills: {
        "flow-prd-creator": {
          hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          installed_version: ""
        }
      }
    })).toThrow();
  });
});

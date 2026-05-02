import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/*/src/**/*.ts", "src/**/*.ts"],
      exclude: ["packages/*/dist/**"]
    },
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/test/**/*.test.ts",
      "src/**/*.test.ts",
      "test/**/*.test.ts"
    ]
  }
});

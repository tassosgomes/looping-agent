#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createMcpServer } from "../dist/index.js";

const handle = createMcpServer({
  onToolCall: () => undefined,
  onError: (error) => {
    process.stderr.write(`${error.message}\n`);
  },
  transportFactory: () => new StdioServerTransport()
});

const shutdown = async (exitCode = 0) => {
  await handle.stop().catch(() => undefined);
  process.exit(exitCode);
};

process.once("SIGINT", () => {
  void shutdown(0);
});

process.once("SIGTERM", () => {
  void shutdown(0);
});

process.on("unhandledRejection", (error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  void shutdown(1);
});

process.on("uncaughtException", (error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  void shutdown(1);
});

await handle.start();

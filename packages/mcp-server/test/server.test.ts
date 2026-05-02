import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMcpServer } from "../src/index.js";
import type { McpServerHandle, ToolCallEvent } from "../src/types.js";

interface ProcessWithActiveHandles extends NodeJS.Process {
  _getActiveHandles?: () => unknown[];
}

class MemoryTransport implements Transport {
  peer: MemoryTransport | undefined;
  onclose: (() => void) | undefined;
  onerror: ((error: Error) => void) | undefined;
  onmessage: (<T extends JSONRPCMessage>(message: T) => void) | undefined;
  private closed = false;

  async start(): Promise<void> {
    this.closed = false;
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const peer = this.peer;
    if (peer === undefined) {
      throw new Error("Memory transport peer is not connected.");
    }

    queueMicrotask(() => {
      if (!this.closed) {
        peer.onmessage?.(message);
      }
    });
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.onclose?.();
  }
}

function createTransportPair(): [MemoryTransport, MemoryTransport] {
  const client = new MemoryTransport();
  const server = new MemoryTransport();
  client.peer = server;
  server.peer = client;
  return [client, server];
}

async function createConnectedClient(
  onToolCall: (evt: ToolCallEvent) => void | Promise<void>
): Promise<{ client: Client; handle: McpServerHandle }> {
  const [clientTransport, serverTransport] = createTransportPair();
  const handle = createMcpServer({
    onToolCall,
    transportFactory: () => serverTransport
  });
  const client = new Client({ name: "mcp-server-test-client", version: "0.0.0" });

  await handle.start();
  await client.connect(clientTransport);

  return { client, handle };
}

const handles: McpServerHandle[] = [];
const clients: Client[] = [];

function getActiveHandleCount(): number | undefined {
  return (process as ProcessWithActiveHandles)._getActiveHandles?.().length;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handles.splice(0).map((handle) => handle.stop()));
});

describe("createMcpServer", () => {
  it("exposes a spawnable stdio MCP server config", async () => {
    const handle = createMcpServer({
      onToolCall: vi.fn()
    });

    expect(handle.getServerConfig()).toMatchObject({
      name: "@looping-agent/mcp-server",
      command: process.execPath,
      env: []
    });
    const config = handle.getServerConfig();
    if ("args" in config) {
      expect(config.args[0]).toContain("standalone.mjs");
    }
  });

  it("can start and stop cleanly when an embedded transport is provided", async () => {
    const activeHandlesBefore = getActiveHandleCount();
    const [, serverTransportOne] = createTransportPair();
    const [, serverTransportTwo] = createTransportPair();
    const transports = [serverTransportOne, serverTransportTwo];
    let starts = 0;

    const handle = createMcpServer({
      onToolCall: vi.fn(),
      transportFactory: () => {
        const transport = transports[starts];
        starts += 1;
        if (transport === undefined) {
          throw new Error("Unexpected transport request.");
        }
        return transport;
      }
    });

    await handle.start();
    await handle.stop();
    await handle.start();
    await handle.stop();
    expect(starts).toBe(2);

    const activeHandlesAfter = getActiveHandleCount();
    if (activeHandlesBefore !== undefined && activeHandlesAfter !== undefined) {
      expect(activeHandlesAfter).toBeLessThanOrEqual(activeHandlesBefore + 1);
    }
  });

  it("lists and invokes all report tools with validated payloads", async () => {
    const calls: ToolCallEvent[] = [];
    const connected = await createConnectedClient((evt) => calls.push(evt));
    clients.push(connected.client);
    handles.push(connected.handle);

    const tools = await connected.client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "report_finalizer_result",
      "report_implementer_result",
      "report_review_result"
    ]);

    await connected.client.callTool({
      name: "report_implementer_result",
      arguments: {
        status: "completed",
        files_changed: ["packages/mcp-server/src/server.ts"],
        build_passed: true,
        tests_passed: true,
        summary: "Implemented MCP server.",
        issues_encountered: []
      }
    });

    await connected.client.callTool({
      name: "report_review_result",
      arguments: {
        approved: false,
        issues: [{
          severity: "high",
          category: "validation",
          description: "Invalid payloads must not reach the orchestrator.",
          file_path: "packages/mcp-server/src/tool-handlers.ts",
          line: 10
        }],
        severity_counts: { critical: 0, high: 1, medium: 0, low: 0 },
        requires_rework: true,
        review_file_path: "reviews/3.md"
      }
    });

    await connected.client.callTool({
      name: "report_finalizer_result",
      arguments: {
        committed: true,
        sha: "abc123",
        merged: false,
        branch_deleted: false,
        files_committed: ["packages/mcp-server/src/index.ts"]
      }
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({ tool: "report_implementer_result", input: { build_passed: true } });
    expect(calls[1]).toMatchObject({ tool: "report_review_result", input: { requires_rework: true } });
    expect(calls[2]).toMatchObject({ tool: "report_finalizer_result", input: { sha: "abc123" } });
  });

  it("rejects invalid MCP tool input without calling the orchestrator callback", async () => {
    const onToolCall = vi.fn();
    const connected = await createConnectedClient(onToolCall);
    clients.push(connected.client);
    handles.push(connected.handle);

    const result = await connected.client.callTool({
      name: "report_implementer_result",
      arguments: {
        status: "completed",
        files_changed: [],
        build_passed: true,
        tests_passed: true,
        summary: "",
        issues_encountered: []
      }
    });

    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain("summary");
  });
});

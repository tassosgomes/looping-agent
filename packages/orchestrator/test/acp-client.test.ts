import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { DefaultAcpClient } from "../src/acp-client.js";
import type { AcpNotification } from "../src/acp-types.js";
import type { DetectedRuntime } from "../src/runtime-detector.js";

describe("DefaultAcpClient", () => {
  it("streams ACP notifications in order and returns the final stop reason", async () => {
    const tempDir = await makeTempDir();
    const fakeRuntime = join(tempDir, "fake-runtime.sh");
    const terminationFile = join(tempDir, "terminated.txt");
    const sessionRequestFile = join(tempDir, "session-new.json");
    await writeFile(fakeRuntime, fakeRuntimeSource(terminationFile, sessionRequestFile), "utf8");
    await chmod(fakeRuntime, 0o755);
    process.env.FAKE_ACP_TERM_FILE = terminationFile;
    const client = new DefaultAcpClient();
    const notifications: AcpNotification[] = [];

    const session = await client.openSession({
      runtime: shellRuntime(fakeRuntime),
      mcpServer: {
        name: "looping-agent-mcp",
        command: process.execPath,
        args: ["/tmp/looping-agent-mcp-standalone.mjs"],
        env: []
      },
      cwd: tempDir
    });

    session.onNotification((notification) => notifications.push(notification));
    await session.sendPrompt("Implement task 4");
    const final = await session.awaitFinal();

    expect(final).toEqual({
      stopReason: "refusal",
      tokens: { input: 11, output: 7 }
    });
    expect(notifications).toEqual([
      { type: "plan", content: [{ content: "Plan task", priority: "medium", status: "pending" }] },
      { type: "agent_message_chunk", text: "Working" },
      {
        type: "tool_call",
        id: "tool-1",
        name: "report_implementer_result",
        input: { status: "completed" }
      },
      {
        type: "tool_call_update",
        id: "tool-1",
        status: "completed",
        output: { ok: true }
      }
    ]);
    const sessionRequest = JSON.parse(await readFile(sessionRequestFile, "utf8")) as {
      params: { mcpServers: Array<{ command: string; args: string[] }> };
    };
    expect(sessionRequest.params.mcpServers[0]).toMatchObject({
      command: process.execPath,
      args: ["/tmp/looping-agent-mcp-standalone.mjs"]
    });
    await waitForFile(terminationFile);
    await expect(readFile(terminationFile, "utf8")).resolves.toBe("terminated");
    delete process.env.FAKE_ACP_TERM_FILE;
  });

  it("throws a clear remediation error when the runtime cannot be spawned", async () => {
    const client = new DefaultAcpClient();

    await expect(
      client.openSession({
        runtime: {
          kind: "codex-acp",
          binary: "codex-acp",
          args: [],
          path: "/definitely/missing/codex-acp",
          version: null
        },
        mcpServer: {
          name: "looping-agent-mcp",
          command: process.execPath,
          args: ["/tmp/looping-agent-mcp-standalone.mjs"],
          env: []
        }
      })
    ).rejects.toThrow("Remediation: verify the binary is executable");
  });
});

function shellRuntime(scriptPath: string): DetectedRuntime {
  return {
    kind: "codex-acp",
    binary: "fake-runtime.sh",
    args: [],
    path: scriptPath,
    version: "fake-runtime 1.0.0"
  };
}

async function makeTempDir(): Promise<string> {
  const dir = join(tmpdir(), `looping-agent-acp-${process.pid}-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 2_000;

  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  throw new Error(`Timed out waiting for ${path}`);
}

function fakeRuntimeSource(terminationFile: string, sessionRequestFile: string): string {
  return `#!/bin/sh
trap 'printf terminated > "${terminationFile}"; exit 0' TERM INT
i=0
while IFS= read -r _line; do
  i=$((i + 1))
  if [ "$i" -eq 1 ]; then
    printf '%s\\n' '{"jsonrpc":"2.0","id":0,"result":{"protocolVersion":1,"agentCapabilities":{"mcpCapabilities":{"http":true},"promptCapabilities":{}}}}'
  elif [ "$i" -eq 2 ]; then
    printf '%s' "$_line" > "${sessionRequestFile}"
    printf '%s\\n' '{"jsonrpc":"2.0","id":1,"result":{"sessionId":"fake-session"}}'
  elif [ "$i" -eq 3 ]; then
    printf '%s\\n' '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"fake-session","update":{"sessionUpdate":"plan","entries":[{"content":"Plan task","priority":"medium","status":"pending"}]}}}'
    printf '%s\\n' '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"fake-session","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"Working"}}}}'
    printf '%s\\n' '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"fake-session","update":{"sessionUpdate":"tool_call","toolCallId":"tool-1","title":"report_implementer_result","rawInput":{"status":"completed"}}}}'
    printf '%s\\n' '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"fake-session","update":{"sessionUpdate":"tool_call_update","toolCallId":"tool-1","status":"completed","rawOutput":{"ok":true}}}}'
    printf '%s\\n' '{"jsonrpc":"2.0","id":2,"result":{"stopReason":"refusal","_meta":{"usage":{"inputTokens":11,"outputTokens":7}}}}'
  fi
done
while true; do sleep 1; done
`;
}

import { createHash } from "node:crypto";

export function normalizeContent(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n+$/, "\n");
}

export function sha256(content: string): string {
  const digest = createHash("sha256").update(content, "utf8").digest("hex");
  return `sha256:${digest}`;
}

export function normalizedSha256(content: string): string {
  return sha256(normalizeContent(content));
}
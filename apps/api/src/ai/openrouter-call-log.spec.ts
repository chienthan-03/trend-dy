import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import {
  getGatewayLogMaxChars,
  isGatewayRequestLogEnabled,
  logGatewayCall,
  truncateForGatewayLog,
} from "./openrouter-call-log";

describe("openrouter-call-log", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = env;
    vi.restoreAllMocks();
  });

  it("truncates long text and keeps length metadata", () => {
    const result = truncateForGatewayLog("abcdefghijklmnopqrstuvwxyz", 20);
    expect(result.truncated).toBe(true);
    expect(result.length).toBe(26);
    expect(result.text.startsWith("abcdefghijklmnopqrst")).toBe(true);
    expect(result.text).toContain("truncated");
  });

  it("can be disabled via AI_GATEWAY_REQUEST_LOG=0", () => {
    process.env.AI_GATEWAY_REQUEST_LOG = "0";
    expect(isGatewayRequestLogEnabled()).toBe(false);
    logGatewayCall({
      kind: "llm_text",
      model: "test",
      status: "ok",
      durationMs: 1,
      input: {},
      output: {},
    });
    expect(console.info).not.toHaveBeenCalled();
  });

  it("logs a JSON line when enabled", () => {
    delete process.env.AI_GATEWAY_REQUEST_LOG;
    expect(isGatewayRequestLogEnabled()).toBe(true);
    expect(getGatewayLogMaxChars()).toBe(4000);

    logGatewayCall({
      kind: "tts",
      type: "remix_tts",
      model: "x-ai/grok-voice-tts-1.0",
      status: "ok",
      durationMs: 12,
      input: { text: "xin chào", chars: 8 },
      output: { durationSec: 1.2, costUsd: 0.001 },
    });

    expect(console.info).toHaveBeenCalledTimes(1);
    const logged = String(vi.mocked(console.info).mock.calls[0]?.[0] ?? "");
    expect(logged.startsWith("[ai-gateway] ")).toBe(true);
    const payload = JSON.parse(logged.slice("[ai-gateway] ".length)) as {
      kind: string;
      input: { text: string };
    };
    expect(payload.kind).toBe("tts");
    expect(payload.input.text).toBe("xin chào");
  });
});

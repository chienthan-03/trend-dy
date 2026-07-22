import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readTtsBatchCache,
  ttsBatchCacheKey,
  writeTtsBatchCache,
} from "./tts-batch-cache";

describe("tts-batch-cache", () => {
  const env = process.env;
  let cacheDir = "";

  beforeEach(async () => {
    process.env = { ...env };
    cacheDir = await mkdtemp(join(tmpdir(), "remix-tts-cache-test-"));
    process.env.REMIX_TTS_CACHE_DIR = cacheDir;
    delete process.env.REMIX_TTS_CACHE;
  });

  afterEach(async () => {
    process.env = env;
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("keys by model + voice + text", () => {
    const a = ttsBatchCacheKey({
      model: "m1",
      voiceId: "eve",
      text: "xin chào",
    });
    const b = ttsBatchCacheKey({
      model: "m1",
      voiceId: "eve",
      text: "xin chào",
    });
    const c = ttsBatchCacheKey({
      model: "m1",
      voiceId: "eve",
      text: "xin chào!",
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("round-trips buffer + duration", async () => {
    const key = ttsBatchCacheKey({
      model: "m",
      voiceId: "v",
      text: "hello",
    });
    await writeTtsBatchCache(key, {
      buffer: Buffer.from("fake-mp3"),
      durationSec: 1.5,
    });
    const hit = await readTtsBatchCache(key);
    expect(hit?.durationSec).toBe(1.5);
    expect(hit?.buffer.toString()).toBe("fake-mp3");
  });

  it("returns null when cache disabled", async () => {
    process.env.REMIX_TTS_CACHE = "off";
    const key = ttsBatchCacheKey({ model: "m", voiceId: "v", text: "x" });
    await writeTtsBatchCache(key, {
      buffer: Buffer.from("x"),
      durationSec: 1,
    });
    expect(await readTtsBatchCache(key)).toBeNull();
  });
});

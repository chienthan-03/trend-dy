import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeTtsAdapter, estimateFakeTtsDurationSec } from "./fake-tts.adapter";
import { createTtsAdapter } from "./tts.adapter";

describe("createTtsAdapter", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("returns FakeTtsAdapter when REMIX_TTS_MODE=fake", async () => {
    process.env.REMIX_TTS_MODE = "fake";

    const adapter = await createTtsAdapter();
    expect(adapter).toBeInstanceOf(FakeTtsAdapter);
  });

  it("defaults to FakeTtsAdapter when REMIX_TTS_MODE is unset", async () => {
    delete process.env.REMIX_TTS_MODE;

    const adapter = await createTtsAdapter();
    expect(adapter).toBeInstanceOf(FakeTtsAdapter);
  });

  it("throws for unknown REMIX_TTS_MODE", async () => {
    process.env.REMIX_TTS_MODE = "invalid";

    await expect(createTtsAdapter()).rejects.toThrow(/Unknown REMIX_TTS_MODE/);
  });
});

describe("FakeTtsAdapter", () => {
  it("returns non-empty MP3 buffer with duration matching the heuristic", async () => {
    const adapter = new FakeTtsAdapter();
    const text = "Hello world, this is a fake TTS segment.";
    const expectedDuration = estimateFakeTtsDurationSec(text);

    const result = await adapter.synthesize({ text, voiceId: "alloy" });

    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.contentType).toBe("audio/mpeg");
    expect(result.durationSec).toBeGreaterThan(0);
    expect(result.durationSec).toBeCloseTo(expectedDuration, 2);
    expect(result.costUsd).toBe(0);
  });

  it("uses minimum duration for short text", async () => {
    const adapter = new FakeTtsAdapter();
    const text = "Hi";

    const result = await adapter.synthesize({ text, voiceId: "alloy" });

    expect(result.durationSec).toBeCloseTo(0.4, 2);
  });
});

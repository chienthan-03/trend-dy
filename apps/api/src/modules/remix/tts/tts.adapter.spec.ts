import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TtsEngine } from "../remix-config";
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

  it("returns FakeTtsAdapter when the fake engine is passed explicitly", async () => {
    const adapter = await createTtsAdapter("fake");
    expect(adapter).toBeInstanceOf(FakeTtsAdapter);
  });

  it("throws for an unknown TTS engine", async () => {
    await expect(createTtsAdapter("invalid" as TtsEngine)).rejects.toThrow(
      /Unknown TTS engine/,
    );
  });

  describe("piper engine", () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "remix-tts-adapter-piper-"));
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("throws when Piper assets are missing", async () => {
      process.env.REMIX_PIPER_BIN = join(dir, "does-not-exist-piper");
      process.env.REMIX_PIPER_MODEL_DIR = dir;

      const adapter = await createTtsAdapter("piper");
      await expect(
        adapter.synthesize({ text: "Xin chào", voiceId: "ngoc-huyen" }),
      ).rejects.toThrow(/REMIX_PIPER/);
    });

    it("returns a PiperTtsAdapter instance when assets resolve", async () => {
      const stem = "ngoc-huyen";
      const modelDir = join(dir, "models");
      await mkdir(modelDir, { recursive: true });
      await writeFile(join(modelDir, `${stem}.onnx`), "fake-onnx-weights");
      await writeFile(join(modelDir, `${stem}.onnx.json`), "{}");
      process.env.REMIX_PIPER_MODEL_DIR = modelDir;
      process.env.REMIX_PIPER_MODEL_STEM = stem;
      delete process.env.REMIX_PIPER_BIN;

      const { PiperTtsAdapter } = await import("./piper-tts.adapter");
      const adapter = await createTtsAdapter("piper");
      expect(adapter).toBeInstanceOf(PiperTtsAdapter);
    });
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

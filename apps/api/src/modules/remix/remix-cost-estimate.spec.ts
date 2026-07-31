import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RemixTranscriptV1 } from "@factory/shared";
import { buildRemixCostEstimate } from "./remix-cost-estimate";

const transcript = (
  segments: Array<{ text: string; startSec: number; endSec: number }>,
): RemixTranscriptV1 => ({
  version: 1,
  language: "vi",
  durationSec: segments[segments.length - 1]?.endSec ?? 0,
  segments: segments.map((segment) => ({
    ...segment,
    speaker: null,
  })),
  fullText: segments.map((s) => s.text).join(" "),
  provider: "test",
  model: "test",
});

describe("buildRemixCostEstimate", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    process.env.REMIX_STT_MODE = "live";
    process.env.REMIX_TTS_MODE = "live";
    process.env.LLM_MODE = "live";
    process.env.REMIX_TRANSLATE_MODE = "live";
    process.env.REMIX_TRANSLATE_PROVIDER = "llm";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.REMIX_TTS_BATCH_MODE = "batch";
    process.env.REMIX_TTS_COST_PER_1K_CHARS_USD = "0.06";
    process.env.REMIX_STT_COST_PER_MINUTE_USD = "0.001";
  });

  afterEach(() => {
    process.env = env;
  });

  it("estimates STT from duration and TTS from batched VI chars", () => {
    const source = transcript([
      { text: "你好世界", startSec: 0, endSec: 2 },
      { text: "继续说话", startSec: 2, endSec: 4 },
    ]);
    const translated = transcript([
      { text: "Xin chào thế giới", startSec: 0, endSec: 2 },
      { text: "Tiếp tục nói chuyện", startSec: 2, endSec: 4 },
    ]);

    const estimate = buildRemixCostEstimate({
      remakeId: "r1",
      videoDurationSec: 600,
      sourceTranscript: source,
      translatedTranscript: translated,
    });

    const stt = estimate.actions.find((a) => a.action === "retranscribe");
    const tts = estimate.actions.find((a) => a.action === "tts");
    const render = estimate.actions.find((a) => a.action === "render");

    expect(stt?.estimatedUsd).toBeCloseTo(0.01, 5); // 10 min * 0.001
    expect(tts?.estimatedUsd).toBeGreaterThan(0);
    expect(tts?.batchCount).toBeGreaterThanOrEqual(1);
    expect(tts?.charCount).toBeGreaterThan(0);
    expect(render?.estimatedUsd).toBe(0);
  });

  it("marks TTS unavailable without translated transcript", () => {
    const estimate = buildRemixCostEstimate({
      remakeId: "r1",
      videoDurationSec: 60,
      sourceTranscript: transcript([
        { text: "hello", startSec: 0, endSec: 1 },
      ]),
      translatedTranscript: null,
    });
    const tts = estimate.actions.find((a) => a.action === "tts");
    expect(tts?.available).toBe(false);
    expect(tts?.estimatedUsd).toBeNull();
  });

  it("returns $0 for TTS when mode is fake", () => {
    process.env.REMIX_TTS_MODE = "fake";
    const estimate = buildRemixCostEstimate({
      remakeId: "r1",
      videoDurationSec: 60,
      sourceTranscript: transcript([{ text: "a", startSec: 0, endSec: 1 }]),
      translatedTranscript: transcript([
        { text: "xin chào".repeat(20), startSec: 0, endSec: 5 },
      ]),
    });
    expect(estimate.actions.find((a) => a.action === "tts")?.estimatedUsd).toBe(
      0,
    );
  });

  it("exposes defaultTtsEngine=live and resolvedEngine=live when mode is live and nothing overrides it", () => {
    const estimate = buildRemixCostEstimate({
      remakeId: "r1",
      videoDurationSec: 60,
      sourceTranscript: transcript([{ text: "a", startSec: 0, endSec: 1 }]),
      translatedTranscript: transcript([
        { text: "xin chào".repeat(20), startSec: 0, endSec: 5 },
      ]),
    });
    expect(estimate.defaultTtsEngine).toBe("live");
    expect(estimate.resolvedEngine).toBe("live");
  });

  it("collapses fake to piper for defaultTtsEngine and resolvedEngine when mode is not live", () => {
    process.env.REMIX_TTS_MODE = "fake";
    const estimate = buildRemixCostEstimate({
      remakeId: "r1",
      videoDurationSec: 60,
      sourceTranscript: transcript([{ text: "a", startSec: 0, endSec: 1 }]),
      translatedTranscript: transcript([
        { text: "xin chào".repeat(20), startSec: 0, endSec: 5 },
      ]),
    });
    expect(estimate.defaultTtsEngine).toBe("piper");
    expect(estimate.resolvedEngine).toBe("piper");
  });

  it("returns $0 with a Piper detail when the resolved engine is piper even though mode is live", () => {
    const estimate = buildRemixCostEstimate({
      remakeId: "r1",
      videoDurationSec: 60,
      sourceTranscript: transcript([{ text: "a", startSec: 0, endSec: 1 }]),
      translatedTranscript: transcript([
        { text: "xin chào".repeat(20), startSec: 0, endSec: 5 },
      ]),
      ttsEngine: "piper",
    });
    const tts = estimate.actions.find((a) => a.action === "tts");
    expect(tts?.estimatedUsd).toBe(0);
    expect(tts?.detail).toContain("Piper local");
    expect(estimate.resolvedEngine).toBe("piper");
  });

  it("accepts an engine override so the UI can preview Piper cost before persisting", () => {
    const estimate = buildRemixCostEstimate({
      remakeId: "r1",
      videoDurationSec: 60,
      sourceTranscript: transcript([{ text: "a", startSec: 0, endSec: 1 }]),
      translatedTranscript: transcript([
        { text: "xin chào".repeat(20), startSec: 0, endSec: 5 },
      ]),
      ttsEngine: "live",
      ttsEngineOverride: "piper",
    });
    const tts = estimate.actions.find((a) => a.action === "tts");
    expect(tts?.estimatedUsd).toBe(0);
    expect(tts?.detail).toContain("Piper local");
    expect(estimate.resolvedEngine).toBe("piper");
  });

  it("estimates live OpenRouter cost when remake engine is live even if env default is fake", () => {
    process.env.REMIX_TTS_MODE = "fake";
    process.env.REMIX_TTS_COST_PER_1K_CHARS_USD = "0.06";
    const estimate = buildRemixCostEstimate({
      remakeId: "r1",
      videoDurationSec: 60,
      sourceTranscript: transcript([{ text: "a", startSec: 0, endSec: 1 }]),
      translatedTranscript: transcript([
        { text: "xin chào".repeat(20), startSec: 0, endSec: 5 },
      ]),
      ttsEngine: "live",
    });
    const tts = estimate.actions.find((a) => a.action === "tts");
    expect(tts?.estimatedUsd).toBeGreaterThan(0);
    expect(estimate.resolvedEngine).toBe("live");
    expect(estimate.defaultTtsEngine).toBe("piper");
  });

  it("uses GPT-5.6 Luna for translation when configured", () => {
    process.env.REMIX_TRANSLATE_LLM_MODEL = "openai/gpt-5.6-luna";
    process.env.REMIX_TRANSLATE_LLM_BATCH_SIZE = "10";
    const source = transcript(
      Array.from({ length: 20 }, (_, index) => ({
        text: "你好世界".repeat(3),
        startSec: index * 2,
        endSec: index * 2 + 2,
      })),
    );

    const estimate = buildRemixCostEstimate({
      remakeId: "r1",
      videoDurationSec: 40,
      sourceTranscript: source,
      translatedTranscript: null,
    });

    const retranslate = estimate.actions.find((a) => a.action === "retranslate");
    expect(retranslate?.estimatedUsd).toBeGreaterThan(0);
    expect(estimate.rates.translateModel).toBe("openai/gpt-5.6-luna");
    expect(retranslate?.detail).toContain("openai/gpt-5.6-luna");
  });
});

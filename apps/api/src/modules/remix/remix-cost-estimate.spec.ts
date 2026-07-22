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
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { RemixTranscriptV1 } from "@factory/shared";
import {
  hasChineseScript,
  splitTextForTranslation,
  translateTranscript,
} from "./translate";

const SAMPLE_SOURCE: RemixTranscriptV1 = {
  version: 1,
  language: "zh",
  durationSec: 10,
  segments: [
    { startSec: 0, endSec: 5, text: "你好世界" },
    { startSec: 5, endSec: 10, text: "再见" },
  ],
  fullText: "你好世界再见",
  provider: "openai",
  model: "whisper-1",
};

vi.mock("google-translate-api-x", () => ({
  translate: vi.fn(),
}));

vi.mock("./gateway", () => ({
  completeJson: vi.fn(),
}));

import { translate as googleTranslateMock } from "google-translate-api-x";
import { completeJson } from "./gateway";

describe("translateTranscript (fake mode)", () => {
  beforeEach(() => {
    process.env.REMIX_TRANSLATE_MODE = "fake";
  });

  afterEach(() => {
    delete process.env.REMIX_TRANSLATE_MODE;
    delete process.env.REMIX_TRANSLATE_PROVIDER;
    delete process.env.HF_API_TOKEN;
    delete process.env.GOOGLE_TRANSLATE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.unstubAllGlobals();
    vi.mocked(googleTranslateMock).mockReset();
    vi.mocked(completeJson).mockReset();
  });

  it("translates each segment and builds Vietnamese transcript", async () => {
    const result = await translateTranscript(SAMPLE_SOURCE);

    expect(result.transcript.language).toBe("vi");
    expect(result.transcript.provider).toBe("fake");
    expect(result.transcript.segments).toHaveLength(2);
    expect(result.transcript.segments[0]?.text).toMatch(/^\[VI\]/);
    expect(result.transcript.fullText.length).toBeGreaterThan(0);
  });
});

describe("translateTranscript (llm live mode)", () => {
  beforeEach(() => {
    process.env.REMIX_TRANSLATE_MODE = "live";
    process.env.REMIX_TRANSLATE_PROVIDER = "llm";
    process.env.OPENAI_API_KEY = "sk_test";
    process.env.LLM_MODE = "real";

    vi.mocked(completeJson).mockResolvedValue({
      data: {
        segments: [
          { index: 0, text: "Xin chào thế giới" },
          { index: 1, text: "Tạm biệt" },
        ],
      },
      model: "openai/gpt-4o-mini",
      tokensIn: 120,
      tokensOut: 40,
      provider: "gateway",
    });
  });

  afterEach(() => {
    delete process.env.REMIX_TRANSLATE_MODE;
    delete process.env.REMIX_TRANSLATE_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.LLM_MODE;
    vi.mocked(completeJson).mockReset();
  });

  it("uses LLM with segment indices and preserves timestamps", async () => {
    const result = await translateTranscript(SAMPLE_SOURCE);

    expect(completeJson).toHaveBeenCalledTimes(1);
    expect(result.transcript.segments[0]?.text).toBe("Xin chào thế giới");
    expect(result.transcript.segments[0]?.startSec).toBe(0);
    expect(result.transcript.segments[1]?.text).toBe("Tạm biệt");
    expect(result.transcript.provider).toBe("llm");
    expect(result.tokensIn).toBe(120);
    expect(result.tokensOut).toBe(40);
  });
});

describe("translateTranscript (google live mode)", () => {
  beforeEach(() => {
    process.env.REMIX_TRANSLATE_MODE = "live";
    process.env.REMIX_TRANSLATE_PROVIDER = "google";
    process.env.REMIX_TRANSLATE_BATCH_DELAY_MS = "0";
    vi.mocked(googleTranslateMock)
      .mockResolvedValueOnce({ text: "Xin chào thế giới" } as never)
      .mockResolvedValueOnce({ text: "Tạm biệt" } as never);
  });

  afterEach(() => {
    delete process.env.REMIX_TRANSLATE_MODE;
    delete process.env.REMIX_TRANSLATE_PROVIDER;
    delete process.env.REMIX_TRANSLATE_BATCH_DELAY_MS;
    delete process.env.GOOGLE_TRANSLATE_API_KEY;
    vi.unstubAllGlobals();
    vi.mocked(googleTranslateMock).mockReset();
  });

  it("uses Google Translate for each segment", async () => {
    const result = await translateTranscript(SAMPLE_SOURCE);

    expect(googleTranslateMock).toHaveBeenCalledTimes(2);
    expect(result.transcript.segments[0]?.text).toBe("Xin chào thế giới");
    expect(result.transcript.provider).toBe("google");
  });
});

describe("splitTextForTranslation", () => {
  it("detects Chinese script", () => {
    expect(hasChineseScript("你好")).toBe(true);
    expect(hasChineseScript("Hello world")).toBe(false);
  });

  it("splits long text into chunks", () => {
    const long = "你".repeat(400);
    const chunks = splitTextForTranslation(long, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
  });
});

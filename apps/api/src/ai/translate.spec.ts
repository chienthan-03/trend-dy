import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { RemixTranscriptV1 } from "@factory/shared";
import {
  hasChineseScript,
  isDuplicateChineseSource,
  normalizeChineseForCompare,
  splitTextForTranslation,
  stripEchoedChinese,
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

  it("preserves source and narration roles through fake translation", async () => {
    const source: RemixTranscriptV1 = {
      ...SAMPLE_SOURCE,
      segments: [
        {
          startSec: 0,
          endSec: 5,
          text: "旁白",
          role: "narration",
          roleSource: "auto",
        },
        {
          startSec: 5,
          endSec: 10,
          text: "Stop",
          role: "source",
          roleSource: "auto",
        },
      ],
    };

    const result = await translateTranscript(source);

    expect(result.transcript.segments[0]).toMatchObject({
      role: "narration",
      roleSource: "auto",
    });
    expect(result.transcript.segments[1]).toMatchObject({
      role: "source",
      roleSource: "auto",
    });
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
      model: "openai/gpt-5.6-luna",
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

  it("retries segments that still contain Chinese then succeeds", async () => {
    vi.mocked(completeJson)
      .mockResolvedValueOnce({
        data: {
          segments: [
            { index: 0, text: "Xin chào thế giới" },
            // Missing index 1 → residual Chinese fallback path
          ],
        },
        model: "openai/gpt-5.6-luna",
        tokensIn: 80,
        tokensOut: 20,
        provider: "gateway",
      })
      .mockResolvedValueOnce({
        data: {
          segments: [{ index: 1, text: "Tạm biệt" }],
        },
        model: "openai/gpt-5.6-luna",
        tokensIn: 40,
        tokensOut: 10,
        provider: "gateway",
      });

    const result = await translateTranscript(SAMPLE_SOURCE);

    expect(completeJson).toHaveBeenCalledTimes(2);
    expect(result.transcript.segments[0]?.text).toBe("Xin chào thế giới");
    expect(result.transcript.segments[1]?.text).toBe("Tạm biệt");
    expect(hasChineseScript(result.transcript.fullText)).toBe(false);
    expect(result.tokensIn).toBe(120);
    expect(result.tokensOut).toBe(30);
  });

  it("drops residual Chinese that duplicates an already-translated source", async () => {
    const source: RemixTranscriptV1 = {
      ...SAMPLE_SOURCE,
      segments: [
        { startSec: 0, endSec: 5, text: "你好世界，这是测试。" },
        { startSec: 5, endSec: 10, text: "你好世界，这是测试。" },
      ],
      fullText: "你好世界，这是测试。你好世界，这是测试。",
    };

    vi.mocked(completeJson).mockResolvedValueOnce({
      data: {
        segments: [{ index: 0, text: "Xin chào thế giới, đây là bài kiểm tra." }],
        // index 1 missing — duplicate source should be dropped, not retried
      },
      model: "openai/gpt-5.6-luna",
      tokensIn: 50,
      tokensOut: 20,
      provider: "gateway",
    });

    const result = await translateTranscript(source);

    expect(completeJson).toHaveBeenCalledTimes(1);
    expect(result.transcript.segments[0]?.text).toBe(
      "Xin chào thế giới, đây là bài kiểm tra.",
    );
    expect(result.transcript.segments[1]?.text).toBe("");
    expect(hasChineseScript(result.transcript.fullText)).toBe(false);
  });

  it("strips echoed Chinese from mixed translations", async () => {
    vi.mocked(completeJson).mockResolvedValueOnce({
      data: {
        segments: [
          { index: 0, text: "Xin chào thế giới 你好世界" },
          { index: 1, text: "Tạm biệt 再见" },
        ],
      },
      model: "openai/gpt-5.6-luna",
      tokensIn: 50,
      tokensOut: 20,
      provider: "gateway",
    });

    const result = await translateTranscript(SAMPLE_SOURCE);

    expect(result.transcript.segments[0]?.text).toBe("Xin chào thế giới");
    expect(result.transcript.segments[1]?.text).toBe("Tạm biệt");
    expect(hasChineseScript(result.transcript.fullText)).toBe(false);
  });

  it("fails when unique residual Chinese remains after retries", async () => {
    vi.mocked(completeJson).mockResolvedValue({
      data: {
        segments: [
          { index: 0, text: "你好世界" },
          { index: 1, text: "再见" },
        ],
      },
      model: "openai/gpt-5.6-luna",
      tokensIn: 10,
      tokensOut: 5,
      provider: "gateway",
    });

    await expect(translateTranscript(SAMPLE_SOURCE)).rejects.toThrow(
      /still contains Chinese/,
    );
    // 1 initial batch + 2 retries × 2 residual segments
    expect(completeJson).toHaveBeenCalledTimes(5);
  });
});

describe("chinese residual helpers", () => {
  it("normalizes Chinese by stripping non-CJK", () => {
    expect(normalizeChineseForCompare("你好，世界！")).toBe("你好世界");
  });

  it("detects duplicate Chinese sources", () => {
    expect(
      isDuplicateChineseSource("你好世界，这是测试", ["你好世界，这是测试。"]),
    ).toBe(true);
    expect(isDuplicateChineseSource("完全不同的内容啊", ["你好世界"])).toBe(false);
  });

  it("strips source-echoed Chinese from mixed text", () => {
    expect(stripEchoedChinese("Xin chào 你好世界", "你好世界")).toBe("Xin chào");
    expect(stripEchoedChinese("Nội dung mới 独特内容", "你好")).toBe(
      "Nội dung mới 独特内容",
    );
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

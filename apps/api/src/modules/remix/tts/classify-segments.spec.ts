import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemixTranscriptV1 } from "@factory/shared";

const completeTextMock = vi.fn();

vi.mock("../../../ai/gateway", () => ({
  completeText: completeTextMock,
}));

const buildTranscript = (
  segments: RemixTranscriptV1["segments"],
  language = "vi",
): RemixTranscriptV1 => ({
  version: 1,
  language,
  durationSec: segments.at(-1)?.endSec ?? 0,
  segments,
  fullText: segments.map((s) => s.text).join(" "),
  provider: "fake",
  model: "fake",
});

describe("applyClassifiedRoles", () => {
  it("reclassify skips manual roles", async () => {
    const { applyClassifiedRoles } = await import("./classify-segments");

    const next = applyClassifiedRoles({
      segments: [
        { text: "a", startSec: 0, endSec: 1, role: "source", roleSource: "manual" },
        { text: "b", startSec: 1, endSec: 2 },
      ],
      classified: [
        { index: 0, role: "narration" },
        { index: 1, role: "source" },
      ],
      mode: "reclassify",
    });

    expect(next[0]?.role).toBe("source");
    expect(next[0]?.roleSource).toBe("manual");
    expect(next[1]?.role).toBe("source");
    expect(next[1]?.roleSource).toBe("auto");
  });

  it("lazy only fills null roles", async () => {
    const { applyClassifiedRoles } = await import("./classify-segments");

    const next = applyClassifiedRoles({
      segments: [
        { text: "a", startSec: 0, endSec: 1, role: "source", roleSource: "auto" },
        { text: "b", startSec: 1, endSec: 2 },
      ],
      classified: [
        { index: 0, role: "narration" },
        { index: 1, role: "source" },
      ],
      mode: "lazy",
    });

    expect(next[0]?.role).toBe("source"); // already set — untouched
    expect(next[1]?.role).toBe("source");
    expect(next[1]?.roleSource).toBe("auto");
  });

  it("reclassify overwrites auto roles", async () => {
    const { applyClassifiedRoles } = await import("./classify-segments");

    const next = applyClassifiedRoles({
      segments: [{ text: "a", startSec: 0, endSec: 1, role: "source", roleSource: "auto" }],
      classified: [{ index: 0, role: "narration" }],
      mode: "reclassify",
    });

    expect(next[0]?.role).toBe("narration");
    expect(next[0]?.roleSource).toBe("auto");
  });

  it("leaves segments untouched when no classified entry exists for their index", async () => {
    const { applyClassifiedRoles } = await import("./classify-segments");

    const next = applyClassifiedRoles({
      segments: [{ text: "a", startSec: 0, endSec: 1 }],
      classified: [],
      mode: "reclassify",
    });

    expect(next[0]?.role).toBeUndefined();
  });
});

describe("classifyPairLocally", () => {
  it("classifies as source when CJK source reads much faster than its window", async () => {
    const { classifyPairLocally } = await import("./classify-segments");

    const role = classifyPairLocally({
      sourceText: "你好吗",
      translatedText: "Ừ.",
      windowSec: 3,
    });

    expect(role).toBe("source");
  });

  it("classifies as narration when CJK source's translation fills its window", async () => {
    const { classifyPairLocally } = await import("./classify-segments");

    const role = classifyPairLocally({
      sourceText: "这个故事讲的是一个年轻人",
      translatedText:
        "Đây là một câu chuyện kể về một chàng trai trẻ đang trên hành trình khám phá bản thân.",
      windowSec: 3,
    });

    expect(role).toBe("narration");
  });

  it("classifies as narration when source has no CJK regardless of length", async () => {
    const { classifyPairLocally } = await import("./classify-segments");

    const role = classifyPairLocally({
      sourceText: "Hi!",
      translatedText: "Ừ.",
      windowSec: 3,
    });

    expect(role).toBe("narration");
  });
});

describe("classifyTranslatedSegments", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    completeTextMock.mockReset();
  });

  afterEach(() => {
    process.env = env;
  });

  it("returns a warning without calling the LLM when segment counts differ", async () => {
    process.env.LLM_MODE = "fake";
    const { classifyTranslatedSegments } = await import("./classify-segments");

    const source = buildTranscript([{ text: "你好", startSec: 0, endSec: 1 }], "zh");
    const translated = buildTranscript([
      { text: "Xin chào", startSec: 0, endSec: 1 },
      { text: "Tạm biệt", startSec: 1, endSec: 2 },
    ]);

    const result = await classifyTranslatedSegments({ source, translated, mode: "lazy" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning).toContain("Số lượng segment không khớp");
    }
    expect(completeTextMock).not.toHaveBeenCalled();
  });

  it("uses the local heuristic and applies roles under LLM_MODE=fake", async () => {
    process.env.LLM_MODE = "fake";
    const { classifyTranslatedSegments } = await import("./classify-segments");

    const source = buildTranscript(
      [
        { text: "你好吗", startSec: 0, endSec: 3 },
        { text: "Hello there, no CJK here", startSec: 3, endSec: 6 },
      ],
      "zh",
    );
    const translated = buildTranscript([
      { text: "Ừ.", startSec: 0, endSec: 3 },
      { text: "Xin chào, không có chữ Hán ở đây", startSec: 3, endSec: 6 },
    ]);

    const result = await classifyTranslatedSegments({ source, translated, mode: "lazy" });

    expect(result.ok).toBe(true);
    expect(completeTextMock).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.segments[0]?.role).toBe("source");
      expect(result.segments[0]?.roleSource).toBe("auto");
      expect(result.segments[1]?.role).toBe("narration");
      expect(result.segments[1]?.roleSource).toBe("auto");
    }
  });

  it("skips manually-set segments when reclassifying under LLM_MODE=fake", async () => {
    process.env.LLM_MODE = "fake";
    const { classifyTranslatedSegments } = await import("./classify-segments");

    const source = buildTranscript([{ text: "你好吗", startSec: 0, endSec: 3 }], "zh");
    const translated = buildTranscript([
      { text: "Ừ.", startSec: 0, endSec: 3, role: "narration", roleSource: "manual" },
    ]);

    const result = await classifyTranslatedSegments({
      source,
      translated,
      mode: "reclassify",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segments[0]?.role).toBe("narration");
      expect(result.segments[0]?.roleSource).toBe("manual");
    }
  });

  it("calls completeText with paired lines and applies the parsed roles in live mode", async () => {
    delete process.env.LLM_MODE;
    completeTextMock.mockResolvedValue({
      text: JSON.stringify({
        roles: [
          { index: 0, role: "source" },
          { index: 1, role: "narration" },
        ],
      }),
      model: "gpt-4.1-mini",
      tokensIn: 40,
      tokensOut: 10,
      provider: "openai",
    });
    const { classifyTranslatedSegments } = await import("./classify-segments");

    const source = buildTranscript(
      [
        { text: "你好", startSec: 0, endSec: 1 },
        { text: "再见", startSec: 1, endSec: 2 },
      ],
      "zh",
    );
    const translated = buildTranscript([
      { text: "Xin chào", startSec: 0, endSec: 1 },
      { text: "Tạm biệt", startSec: 1, endSec: 2 },
    ]);

    const result = await classifyTranslatedSegments({ source, translated, mode: "lazy" });

    expect(completeTextMock).toHaveBeenCalledWith(
      expect.stringContaining("Xin chào"),
      expect.objectContaining({ type: "remix_classify_segments" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segments[0]?.role).toBe("source");
      expect(result.segments[1]?.role).toBe("narration");
      expect(result.tokensIn).toBe(40);
      expect(result.tokensOut).toBe(10);
    }
  });

  it("returns a warning without partial-applying when the LLM response is malformed", async () => {
    delete process.env.LLM_MODE;
    completeTextMock.mockResolvedValue({
      text: "not valid json",
      model: "gpt-4.1-mini",
      tokensIn: 40,
      tokensOut: 10,
      provider: "openai",
    });
    const { classifyTranslatedSegments } = await import("./classify-segments");

    const source = buildTranscript([{ text: "你好", startSec: 0, endSec: 1 }], "zh");
    const translated = buildTranscript([
      { text: "Xin chào", startSec: 0, endSec: 1, role: "source", roleSource: "manual" },
    ]);

    const result = await classifyTranslatedSegments({ source, translated, mode: "reclassify" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning).toContain("phân loại segment");
    }
  });

  it("returns a warning when the LLM response has the wrong number of roles", async () => {
    delete process.env.LLM_MODE;
    completeTextMock.mockResolvedValue({
      text: JSON.stringify({ roles: [{ index: 0, role: "narration" }] }),
      model: "gpt-4.1-mini",
      tokensIn: 40,
      tokensOut: 10,
      provider: "openai",
    });
    const { classifyTranslatedSegments } = await import("./classify-segments");

    const source = buildTranscript(
      [
        { text: "你好", startSec: 0, endSec: 1 },
        { text: "再见", startSec: 1, endSec: 2 },
      ],
      "zh",
    );
    const translated = buildTranscript([
      { text: "Xin chào", startSec: 0, endSec: 1 },
      { text: "Tạm biệt", startSec: 1, endSec: 2 },
    ]);

    const result = await classifyTranslatedSegments({ source, translated, mode: "lazy" });

    expect(result.ok).toBe(false);
  });
});

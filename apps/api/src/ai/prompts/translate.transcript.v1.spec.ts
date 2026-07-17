import { describe, expect, it } from "vitest";
import {
  buildTranslateTranscriptPrompt,
  mergeTranslatedSegments,
} from "./translate.transcript.v1";
import type { RemixTranscriptV1 } from "@factory/shared";

const SOURCE: RemixTranscriptV1 = {
  version: 1,
  language: "zh",
  durationSec: 10,
  segments: [
    { startSec: 0, endSec: 5, text: "你好" },
    { startSec: 5, endSec: 10, text: "再见" },
  ],
  fullText: "你好再见",
  provider: "openai",
  model: "whisper-1",
};

describe("translate.transcript.v1", () => {
  it("builds prompt with global segment indices", () => {
    const prompt = buildTranslateTranscriptPrompt({
      sourceLanguage: "zh",
      segments: [
        { index: 2, startSec: 10, endSec: 15, text: "测试" },
      ],
      contextBefore: "前文",
    });

    expect(prompt).toContain('"index": 2');
    expect(prompt).toContain("前文");
    expect(prompt).toContain("测试");
    expect(prompt).toContain("không được giữ chữ Hán");
  });

  it("merges translated segments by index", () => {
    const merged = mergeTranslatedSegments(SOURCE, {
      segments: [
        { index: 0, text: "Xin chào" },
        { index: 1, text: "Tạm biệt" },
      ],
    });

    expect(merged[0]?.text).toBe("Xin chào");
    expect(merged[0]?.startSec).toBe(0);
    expect(merged[1]?.text).toBe("Tạm biệt");
  });
});

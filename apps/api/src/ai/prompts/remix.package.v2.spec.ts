import { describe, expect, it } from "vitest";
import {
  buildRemixPromptV2,
  parseRemixPackageV2Json,
  REMIX_PACKAGE_V2_CONTEXT_CHARS,
} from "./remix.package.v2";

const SAMPLE_TRANSCRIPT = {
  version: 1 as const,
  language: "chinese",
  durationSec: 120,
  segments: [
    { startSec: 0, endSec: 30, text: "第一段内容" },
    { startSec: 30, endSec: 60, text: "第二段内容" },
    { startSec: 60, endSec: 90, text: "第三段内容" },
    { startSec: 90, endSec: 120, text: "第四段内容" },
  ],
  fullText: "第一段内容第二段内容第三段内容第四段内容",
  provider: "openai",
  model: "whisper-1",
};

const SLIM_V2_LLM_FIXTURE = {
  locale: "vi",
  packaging: {
    titles: ["Tiêu đề A", "Tiêu đề B", "Tiêu đề C"],
    description: "Recap đầy đủ — theo dõi để không bỏ lỡ!",
    hashtags: ["tu_tien", "recap", "douyin"],
  },
  transform_notes: {
    input_mode: "transcript_full",
    source_duration_sec: 120,
    source_language: "zh",
    rewrite_strategy: "packaging_only",
    risks: ["proper nouns may need review"],
  },
} as const;

describe("buildRemixPromptV2", () => {
  it("sends transcript excerpt for packaging fields only", () => {
    const { user } = buildRemixPromptV2({
      caption: "修仙少年意外获得系统",
      title: "系统觉醒",
      genre: "cultivation",
      locale: "vi",
      transcript: SAMPLE_TRANSCRIPT,
    });

    expect(user).toContain("titles + description + hashtags");
    expect(user).toContain(SAMPLE_TRANSCRIPT.fullText);
    expect(user).not.toMatch(/Transcript segments/);
    expect(user).not.toContain('"startSec"');
  });

  it("truncates long transcript excerpt", () => {
    const longText = "字".repeat(REMIX_PACKAGE_V2_CONTEXT_CHARS + 200);
    const { user } = buildRemixPromptV2({
      caption: "c",
      title: "t",
      genre: "g",
      locale: "vi",
      transcript: { ...SAMPLE_TRANSCRIPT, fullText: longText },
    });

    expect(user).toContain("…");
    expect(user).not.toContain(longText);
  });

  it("system rules only ask for packaging fields", () => {
    const { system } = buildRemixPromptV2({
      caption: "修仙少年意外获得系统",
      title: "系统觉醒",
      genre: "cultivation",
      locale: "vi",
      transcript: SAMPLE_TRANSCRIPT,
    });

    expect(system).toMatch(/titles/i);
    expect(system).toMatch(/description/i);
    expect(system).toMatch(/hashtags/i);
    expect(system).toMatch(/KHÔNG tạo banners/i);
    expect(system).not.toMatch(/timing_source/i);
  });
});

describe("parseRemixPackageV2Json", () => {
  it("accepts packaging-only JSON and fills empty banners/subtitles", () => {
    const parsed = parseRemixPackageV2Json(JSON.stringify(SLIM_V2_LLM_FIXTURE));

    expect(parsed.packaging.titles).toEqual([
      "Tiêu đề A",
      "Tiêu đề B",
      "Tiêu đề C",
    ]);
    expect(parsed.packaging.description).toContain("Recap");
    expect(parsed.banners).toEqual({ top: "", bottom: "", watermark: "" });
    expect(parsed.subtitles.cues).toEqual([]);
    expect(parsed.transform_notes.input_mode).toBe("transcript_full");
  });

  it("strips LLM-supplied banners and subtitles", () => {
    const parsed = parseRemixPackageV2Json(
      JSON.stringify({
        ...SLIM_V2_LLM_FIXTURE,
        banners: { top: "X", bottom: "Y", watermark: "Z" },
        subtitles: {
          format: "srt",
          timing_source: "stt",
          cues: [
            {
              start: "00:00:00,000",
              end: "00:00:30,000",
              text: "Should be dropped",
            },
          ],
        },
      }),
    );

    expect(parsed.banners.top).toBe("");
    expect(parsed.subtitles.cues).toEqual([]);
  });

  it("rejects JSON missing packaging", () => {
    expect(() =>
      parseRemixPackageV2Json(
        JSON.stringify({
          locale: "vi",
          transform_notes: SLIM_V2_LLM_FIXTURE.transform_notes,
        }),
      ),
    ).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  buildRemixPromptV2,
  parseRemixPackageV2Json,
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

const SLIM_V2_PACKAGE_FIXTURE = {
  locale: "vi",
  banners: {
    top: "RECAP TU TIÊN",
    bottom: "Theo dõi để xem tiếp",
    watermark: "STUDIO ALPHA",
  },
  packaging: {
    titles: ["Tiêu đề A", "Tiêu đề B", "Tiêu đề C"],
    description: "Recap đầy đủ — theo dõi để không bỏ lỡ!",
    hashtags: ["tu_tien", "recap", "douyin"],
  },
  subtitles: {
    format: "srt",
    timing_source: "stt",
    cues: [
      {
        start: "00:00:00,000",
        end: "00:00:30,000",
        text: "Một thiếu niên tu tiên bất ngờ nhận được hệ thống.",
      },
      {
        start: "00:00:30,000",
        end: "00:01:00,000",
        text: "Anh ta bắt đầu hành trình tu luyện.",
      },
    ],
  },
  transform_notes: {
    input_mode: "transcript_full",
    source_duration_sec: 120,
    source_language: "zh",
    rewrite_strategy: "packaging_subtitles",
    risks: ["proper nouns may need review"],
  },
} as const;

describe("buildRemixPromptV2", () => {
  it("includes segment count and transcript in user message", () => {
    const { user } = buildRemixPromptV2({
      caption: "修仙少年意外获得系统",
      title: "系统觉醒",
      genre: "cultivation",
      locale: "vi",
      transcript: SAMPLE_TRANSCRIPT,
    });

    expect(user).toMatch(/Transcript segments \(4\)/);
    expect(user).toContain('"startSec": 0');
    expect(user).toContain("Duration: 120s");
  });

  it("system rules mention banners, packaging, and subtitles", () => {
    const { system } = buildRemixPromptV2({
      caption: "修仙少年意外获得系统",
      title: "系统觉醒",
      genre: "cultivation",
      locale: "vi",
      transcript: SAMPLE_TRANSCRIPT,
    });

    expect(system).toMatch(/banner/i);
    expect(system).toMatch(/packaging/i);
    expect(system).toMatch(/subtitle/i);
  });

  it("system rules keep STT timing rules but drop narration/hook", () => {
    const { system } = buildRemixPromptV2({
      caption: "修仙少年意外获得系统",
      title: "系统觉醒",
      genre: "cultivation",
      locale: "vi",
      transcript: SAMPLE_TRANSCRIPT,
    });

    expect(system).toMatch(/TRANSCRIPT đầy đủ/i);
    expect(system).toMatch(/timing_source.*stt/i);
    expect(system).toMatch(/STT/i);
    expect(system).not.toMatch(/narration/i);
    expect(system).not.toMatch(/hook/i);
    expect(system).not.toMatch(/≤\s*3/i);
    expect(system).not.toMatch(/source_duration_sec\s*×/i);
  });

  it("user message frames packaging and subtitles from transcript", () => {
    const { user } = buildRemixPromptV2({
      caption: "修仙少年意外获得系统",
      title: "系统觉醒",
      genre: "cultivation",
      locale: "vi",
      transcript: SAMPLE_TRANSCRIPT,
    });

    expect(user).toMatch(/packaging|đóng gói/i);
    expect(user).toMatch(/subtitle|phụ đề/i);
    expect(user).not.toMatch(/viết lại recap/i);
  });
});

describe("parseRemixPackageV2Json", () => {
  it("accepts slim JSON with timing_source stt", () => {
    const raw = JSON.stringify(SLIM_V2_PACKAGE_FIXTURE);

    const parsed = parseRemixPackageV2Json(raw);

    expect(parsed.locale).toBe("vi");
    expect(parsed.banners.top).toBe("RECAP TU TIÊN");
    expect(parsed.subtitles.timing_source).toBe("stt");
    expect(parsed.transform_notes.input_mode).toBe("transcript_full");
    expect(parsed.transform_notes.source_duration_sec).toBe(120);
    expect(parsed.subtitles.cues).toHaveLength(2);
  });

  it("rejects JSON with only narration/hook and missing banners", () => {
    const raw = JSON.stringify({
      locale: "vi",
      script: {
        narration: "Một thiếu niên tu tiên bất ngờ nhận được hệ thống.",
        duration_estimate_sec: 120,
        sections: [{ label: "hook", text: "Bạn có tin..." }],
      },
      hook_3s: {
        spoken: "Bạn có tin chuyện này bắt đầu từ một viên đá?",
        on_screen: "HỆ THỐNG THỨC TỈNH",
        visual_hint: "close-up shocked face",
      },
      subtitles: {
        format: "srt",
        timing_source: "stt",
        cues: [
          {
            start: "00:00:00,000",
            end: "00:00:30,000",
            text: "Test",
          },
        ],
      },
      transform_notes: {
        input_mode: "transcript_full",
        source_duration_sec: 120,
        source_language: "zh",
        rewrite_strategy: "recap_vn_inspired",
        risks: [],
      },
    });

    expect(() => parseRemixPackageV2Json(raw)).toThrow();
  });
});

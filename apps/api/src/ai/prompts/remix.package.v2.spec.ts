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

describe("buildRemixPromptV2", () => {
  it("includes segment count in user message", () => {
    const { system, user } = buildRemixPromptV2({
      caption: "修仙少年意外获得系统",
      title: "系统觉醒",
      genre: "cultivation",
      locale: "vi",
      transcript: SAMPLE_TRANSCRIPT,
    });

    expect(system).toMatch(/TRANSCRIPT đầy đủ/i);
    expect(system).toMatch(/timing_source.*stt/i);
    expect(user).toContain("Transcript segments (4):");
    expect(user).toContain('"startSec": 0');
    expect(user).toContain("Duration: 120s");
  });
});

describe("parseRemixPackageV2Json", () => {
  it("accepts valid fixture with timing_source stt", () => {
    const raw = JSON.stringify({
      locale: "vi",
      script: {
        narration:
          "Một thiếu niên tu tiên bất ngờ nhận được hệ thống thần bí. Anh ta bắt đầu hành trình tu luyện qua nhiều thử thách khắc nghiệt, gặp gỡ sư phụ và đồng môn, đối mặt kẻ thù mạnh mẽ, khám phá bí mật cổ xưa và dần trở thành cao thủ vạn giới.",
        duration_estimate_sec: 120,
        sections: [
          { label: "hook", text: "Bạn có tin..." },
          { label: "body_0_30", text: "Câu chuyện bắt đầu..." },
          { label: "body_30_60", text: "Anh ta gặp thử thách..." },
          { label: "body_60_90", text: "Cuộc chiến leo thang..." },
          { label: "body_90_120", text: "Kết cục bất ngờ..." },
        ],
      },
      hook_3s: {
        spoken: "Bạn có tin chuyện này bắt đầu từ một viên đá?",
        on_screen: "HỆ THỐNG THỨC TỈNH",
        visual_hint: "close-up shocked face",
      },
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
        rewrite_strategy: "recap_vn_inspired",
        risks: ["proper nouns may need review"],
      },
    });

    const parsed = parseRemixPackageV2Json(raw);

    expect(parsed.locale).toBe("vi");
    expect(parsed.subtitles.timing_source).toBe("stt");
    expect(parsed.transform_notes.input_mode).toBe("transcript_full");
    expect(parsed.transform_notes.source_duration_sec).toBe(120);
    expect(parsed.script.narration).toContain("thiếu niên");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildRemixPrompt,
  parseRemixPackageJson,
} from "./remix.package.v1";

describe("buildRemixPrompt", () => {
  it("buildRemixPrompt includes non-literal translation rule", () => {
    const { system, user } = buildRemixPrompt({
      caption: "修仙少年意外获得系统",
      title: "系统觉醒",
      genre: "cultivation",
      locale: "vi",
    });

    expect(system).toMatch(/rewrite|viết lại/i);
    expect(user).toContain("修仙少年");
  });
});

describe("parseRemixPackageJson", () => {
  it("validates valid JSON", () => {
    const raw = JSON.stringify({
      locale: "vi",
      script: {
        narration: "Một thiếu niên tu tiên bất ngờ nhận được hệ thống.",
        duration_estimate_sec: 180,
        sections: [
          { label: "hook", text: "Bạn có tin..." },
          { label: "body", text: "Câu chuyện bắt đầu..." },
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
        cues: [
          {
            start: "00:00:00,000",
            end: "00:00:03,000",
            text: "Bạn có tin chuyện này bắt đầu từ một viên đá?",
          },
        ],
      },
      transform_notes: {
        source_language: "zh",
        rewrite_strategy: "recap_vn_inspired",
        risks: ["proper nouns may need review"],
      },
    });

    const parsed = parseRemixPackageJson(raw);

    expect(parsed.locale).toBe("vi");
    expect(parsed.script.narration).toContain("thiếu niên");
    expect(parsed.hook_3s.spoken).toBeTruthy();
  });
});

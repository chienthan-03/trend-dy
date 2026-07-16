import { describe, expect, it } from "vitest";
import {
  buildRemixPrompt,
  parseRemixPackageJson,
} from "./remix.package.v1";

const SLIM_PACKAGE_FIXTURE = {
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
    rewrite_strategy: "packaging_subtitles",
    risks: ["proper nouns may need review"],
  },
} as const;

describe("buildRemixPrompt", () => {
  it("system rules mention banners, packaging, and subtitles", () => {
    const { system } = buildRemixPrompt({
      caption: "修仙少年意外获得系统",
      title: "系统觉醒",
      genre: "cultivation",
      locale: "vi",
    });

    expect(system).toMatch(/banner/i);
    expect(system).toMatch(/packaging/i);
    expect(system).toMatch(/subtitle/i);
  });

  it("system rules do not mention narration length or hook ≤3s", () => {
    const { system } = buildRemixPrompt({
      caption: "修仙少年意外获得系统",
      title: "系统觉醒",
      genre: "cultivation",
      locale: "vi",
    });

    expect(system).not.toMatch(/narration/i);
    expect(system).not.toMatch(/hook/i);
    expect(system).not.toMatch(/≤\s*3/i);
    expect(system).not.toMatch(/3\s*giây/i);
  });

  it("user message frames packaging and subtitles from caption", () => {
    const { user } = buildRemixPrompt({
      caption: "修仙少年意外获得系统",
      title: "系统觉醒",
      genre: "cultivation",
      locale: "vi",
    });

    expect(user).toContain("修仙少年");
    expect(user).toMatch(/packaging|đóng gói/i);
    expect(user).toMatch(/subtitle|phụ đề/i);
    expect(user).not.toMatch(/viết lại recap/i);
  });
});

describe("parseRemixPackageJson", () => {
  it("accepts slim JSON without script or hook_3s", () => {
    const raw = JSON.stringify(SLIM_PACKAGE_FIXTURE);

    const parsed = parseRemixPackageJson(raw);

    expect(parsed.locale).toBe("vi");
    expect(parsed.banners.top).toBe("RECAP TU TIÊN");
    expect(parsed.packaging.titles).toHaveLength(3);
    expect(parsed.subtitles.cues[0]?.text).toContain("viên đá");
  });

  it("rejects JSON with only narration/hook and missing banners", () => {
    const raw = JSON.stringify({
      locale: "vi",
      script: {
        narration: "Một thiếu niên tu tiên bất ngờ nhận được hệ thống.",
        duration_estimate_sec: 180,
        sections: [{ label: "hook", text: "Bạn có tin..." }],
      },
      hook_3s: {
        spoken: "Bạn có tin chuyện này bắt đầu từ một viên đá?",
        on_screen: "HỆ THỐNG THỨC TỈNH",
        visual_hint: "close-up shocked face",
      },
    });

    expect(() => parseRemixPackageJson(raw)).toThrow();
  });
});

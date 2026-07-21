import { describe, expect, it } from "vitest";
import {
  detectCoarseTiming,
  normalizeCueTiming,
} from "./normalize-cue-timing";

describe("normalizeCueTiming", () => {
  it("keeps short punctuated Whisper segments", () => {
    const { segments, degraded } = normalizeCueTiming({
      segments: [
        { startSec: 0, endSec: 4, text: "第一句。" },
        { startSec: 4, endSec: 8, text: "第二句！" },
      ],
      words: [],
      durationSec: 8,
    });
    expect(degraded).toBe(false);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      startSec: 0,
      endSec: 4,
      text: "第一句。",
    });
  });

  it("rebuilds mega unpunctuated segment from words and preserves film gaps", () => {
    const { segments } = normalizeCueTiming({
      segments: [
        {
          startSec: 0,
          endSec: 40,
          text: "打听通缉犯在酒馆哪个地方路人见他眼神犀利也不敢打胡乱说向对方表示感谢后",
        },
      ],
      words: [
        { startSec: 7.2, endSec: 7.4, text: "顺" },
        { startSec: 9.38, endSec: 9.56, text: "地方" },
        { startSec: 10.26, endSec: 16.4, text: "路" },
        { startSec: 16.4, endSec: 18.68, text: "人" },
        { startSec: 18.68, endSec: 18.82, text: "见" },
        { startSec: 18.82, endSec: 18.98, text: "他" },
        { startSec: 21.54, endSec: 21.76, text: "说" },
        { startSec: 32.24, endSec: 32.36, text: "向" },
        { startSec: 33.0, endSec: 33.1, text: "谢" },
      ],
      durationSec: 40,
    });
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments.some((s) => s.endSec <= 9.6)).toBe(true);
    expect(segments.some((s) => s.startSec >= 18.5)).toBe(true);
    expect(segments.every((s) => s.endSec - s.startSec <= 15.01)).toBe(true);
  });

  it("degrades to plain-text split when words missing on mega cue", () => {
    const { segments, degraded } = normalizeCueTiming({
      segments: [
        {
          startSec: 0,
          endSec: 60,
          text: "这是一段没有标点的很长中文内容用于测试降级路径需要足够长还要再加一些字才能超过软换行阈值触发切分一二三四",
        },
      ],
      words: [],
      durationSec: 60,
    });
    expect(degraded).toBe(true);
    expect(segments.length).toBeGreaterThan(1);
  });
});

describe("detectCoarseTiming", () => {
  it("flags median > 15s", () => {
    expect(
      detectCoarseTiming({
        segments: [
          { startSec: 0, endSec: 20, text: "a" },
          { startSec: 20, endSec: 40, text: "b" },
        ],
        durationSec: 40,
        degraded: false,
      }),
    ).toBe(true);
  });

  it("flags any cue > 20% of duration", () => {
    expect(
      detectCoarseTiming({
        segments: [
          { startSec: 0, endSec: 1, text: "a" },
          { startSec: 1, endSec: 50, text: "b".repeat(10) },
        ],
        durationSec: 100,
        degraded: false,
      }),
    ).toBe(true);
  });
});

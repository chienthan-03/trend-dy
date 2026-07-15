import { describe, expect, it } from "vitest";
import { buildSrtFromSegments, secToSrtTimestamp } from "./remix-srt";

describe("secToSrtTimestamp", () => {
  it("formats zero seconds", () => {
    expect(secToSrtTimestamp(0)).toBe("00:00:00,000");
  });

  it("formats fractional seconds", () => {
    expect(secToSrtTimestamp(65.5)).toBe("00:01:05,500");
  });
});

describe("buildSrtFromSegments", () => {
  it("builds valid SRT from two segments", () => {
    const srt = buildSrtFromSegments([
      { startSec: 0, endSec: 2.5, text: "Hello" },
      { startSec: 2.5, endSec: 5, text: "World" },
    ]);

    expect(srt).toBe(
      "1\n00:00:00,000 --> 00:00:02,500\nHello\n\n2\n00:00:02,500 --> 00:00:05,000\nWorld\n",
    );
  });

  it("returns empty string for no segments", () => {
    expect(buildSrtFromSegments([])).toBe("");
  });
});

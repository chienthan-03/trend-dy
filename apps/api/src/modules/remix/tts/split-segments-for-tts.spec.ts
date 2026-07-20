import { describe, expect, it } from "vitest";
import { splitSegmentsForTts } from "./split-segments-for-tts";

describe("splitSegmentsForTts", () => {
  it("keeps short segments unchanged", () => {
    const input = [
      { startSec: 0, endSec: 2, text: "Xin chào mọi người." },
    ];
    expect(splitSegmentsForTts(input)).toEqual(input);
  });

  it("splits long multi-sentence segments and reserves pauses", () => {
    const input = [
      {
        startSec: 0,
        endSec: 20,
        text: "Anh ta vừa đến quán rượu. Anh nhìn quanh tìm tội phạm. Cuối cùng anh ngồi xuống.",
      },
    ];

    const result = splitSegmentsForTts(input, {
      maxChars: 40,
      maxDurationSec: 5,
      pauseSec: 0.2,
    });

    expect(result.length).toBe(3);
    expect(result[0]!.text).toContain("quán rượu");
    expect(result[1]!.startSec).toBeGreaterThan(result[0]!.endSec);
    expect(result[2]!.endSec).toBeLessThanOrEqual(20.01);
    const gaps = [
      result[1]!.startSec - result[0]!.endSec,
      result[2]!.startSec - result[1]!.endSec,
    ];
    expect(gaps[0]).toBeGreaterThanOrEqual(0.19);
    expect(gaps[1]).toBeGreaterThanOrEqual(0.19);
  });
});

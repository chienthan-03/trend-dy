import { describe, expect, it } from "vitest";
import {
  allocateBatchSliceRanges,
  allocateBatchSliceRangesByText,
} from "./split-batch-audio";

describe("allocateBatchSliceRanges", () => {
  it("splits batch audio by cue window weights and covers full duration", () => {
    const ranges = allocateBatchSliceRanges(
      [
        { index: 0, text: "a", startSec: 0, endSec: 2 },
        { index: 1, text: "b", startSec: 2, endSec: 6 },
        { index: 2, text: "c", startSec: 6, endSec: 8 },
      ],
      10,
    );

    expect(ranges).toHaveLength(3);
    // weights 2 : 4 : 2 → 0.25 : 0.5 : 0.25 of 10s
    expect(ranges[0]!.durationSec).toBeCloseTo(2.5, 5);
    expect(ranges[1]!.durationSec).toBeCloseTo(5, 5);
    expect(ranges[2]!.offsetSec + ranges[2]!.durationSec).toBeCloseTo(10, 5);
    expect(ranges[0]!.offsetSec).toBe(0);
    expect(ranges[1]!.offsetSec).toBeCloseTo(2.5, 5);
  });
});

describe("allocateBatchSliceRangesByText", () => {
  it("weights by spoken text length, not STT window (avoids mid-phrase cuts)", () => {
    // Short line in a long window + long line in a short window — classic "mất chữ".
    const cues = [
      {
        index: 0,
        text: "Sau khi bày tỏ cảm ơn",
        startSec: 0,
        endSec: 5,
      },
      {
        index: 1,
        text: "anh ấy bình tĩnh đi về phía chiếc bàn đó",
        startSec: 5,
        endSec: 6,
      },
    ];
    const batchAudioDurationSec = 6;

    const byWindow = allocateBatchSliceRanges(cues, batchAudioDurationSec);
    const byText = allocateBatchSliceRangesByText(cues, batchAudioDurationSec);

    // Window weights 5:1 → cue1 only gets ~1s and loses the tail of the phrase.
    expect(byWindow[1]!.durationSec).toBeCloseTo(1, 5);

    const len0 = cues[0]!.text.length;
    const len1 = cues[1]!.text.length;
    const expectedCue1 = (batchAudioDurationSec * len1) / (len0 + len1);
    expect(byText[1]!.durationSec).toBeCloseTo(expectedCue1, 5);
    expect(byText[1]!.durationSec).toBeGreaterThan(byWindow[1]!.durationSec);
    expect(byText[0]!.offsetSec + byText[0]!.durationSec).toBeCloseTo(
      byText[1]!.offsetSec,
      5,
    );
    expect(byText[1]!.offsetSec + byText[1]!.durationSec).toBeCloseTo(
      batchAudioDurationSec,
      5,
    );
  });
});

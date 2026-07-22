import { describe, expect, it } from "vitest";
import { allocateBatchSliceRanges } from "./split-batch-audio";

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

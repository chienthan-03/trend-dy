import { describe, expect, it } from "vitest";
import { planSequentialTimeline } from "./sequential-timeline";

const opts = { blockGapSec: 1 };

describe("planSequentialTimeline", () => {
  it("chains cues so each starts when the previous ends", () => {
    const out = planSequentialTimeline(
      [
        { index: 0, zhStartSec: 0, zhEndSec: 2, audioDurationSec: 3 },
        { index: 1, zhStartSec: 1.5, zhEndSec: 3, audioDurationSec: 2 },
        { index: 2, zhStartSec: 2, zhEndSec: 4, audioDurationSec: 1 },
      ],
      opts,
    );

    expect(out[0]).toEqual({ index: 0, startSec: 0, endSec: 3 });
    expect(out[1]).toEqual({ index: 1, startSec: 3, endSec: 5 });
    expect(out[2]).toEqual({ index: 2, startSec: 5, endSec: 6 });
  });

  it("waits for ZH start when there is a silence gap in the transcript", () => {
    const out = planSequentialTimeline(
      [
        { index: 0, zhStartSec: 0, zhEndSec: 2, audioDurationSec: 2 },
        { index: 1, zhStartSec: 10, zhEndSec: 12, audioDurationSec: 1.5 },
      ],
      opts,
    );

    expect(out[1]!.startSec).toBe(10);
    expect(out[1]!.endSec).toBe(11.5);
  });

  it("defers a later scene when the previous scene still has audio playing", () => {
    const out = planSequentialTimeline(
      [
        { index: 0, zhStartSec: 0, zhEndSec: 2, audioDurationSec: 30 },
        { index: 1, zhStartSec: 2, zhEndSec: 4, audioDurationSec: 30 },
        { index: 2, zhStartSec: 50, zhEndSec: 55, audioDurationSec: 2 },
      ],
      opts,
    );

    const byIndex = new Map(out.map((entry) => [entry.index, entry]));
    expect(byIndex.get(0)!.endSec).toBe(30);
    expect(byIndex.get(1)!.startSec).toBe(30);
    expect(byIndex.get(2)!.startSec).toBe(60);
    expect(byIndex.get(2)!.endSec).toBe(62);
  });
});

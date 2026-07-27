import { describe, expect, it } from "vitest";
import { planSequentialTimeline } from "./sequential-timeline";

describe("planSequentialTimeline", () => {
  it("chains cues so each starts when the previous ends", () => {
    const out = planSequentialTimeline([
      { index: 0, zhStartSec: 0, audioDurationSec: 3 },
      { index: 1, zhStartSec: 1.5, audioDurationSec: 2 },
      { index: 2, zhStartSec: 2, audioDurationSec: 1 },
    ]);

    expect(out[0]).toEqual({ index: 0, startSec: 0, endSec: 3 });
    expect(out[1]).toEqual({ index: 1, startSec: 3, endSec: 5 });
    expect(out[2]).toEqual({ index: 2, startSec: 5, endSec: 6 });
  });

  it("waits for ZH start when there is a silence gap in the transcript", () => {
    const out = planSequentialTimeline([
      { index: 0, zhStartSec: 0, audioDurationSec: 2 },
      { index: 1, zhStartSec: 10, audioDurationSec: 1.5 },
    ]);

    expect(out[1]!.startSec).toBe(10);
    expect(out[1]!.endSec).toBe(11.5);
  });
});

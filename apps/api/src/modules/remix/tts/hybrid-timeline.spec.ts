import { describe, expect, it } from "vitest";
import { planHybridTimeline } from "./hybrid-timeline";

const opts = { blockGapSec: 1, lockGraceSec: 0.5, maxSpeed: 1.25 };

describe("planHybridTimeline", () => {
  it("keeps ZH start for short narration (silence gap, no early pull)", () => {
    const out = planHybridTimeline(
      [
        { index: 0, startSec: 0, endSec: 2, role: "narration", audioDurationSec: 0.8 },
        { index: 1, startSec: 2, endSec: 4, role: "narration", audioDurationSec: 1.0 },
      ],
      opts,
    );
    // First cue is always locked → fitTarget = ZH window (may pad short audio)
    expect(out[0]!.locked).toBe(true);
    expect(out[0]!.startSec).toBe(0);
    expect(out[0]!.fitTargetSec).toBeCloseTo(2.0);
    expect(out[1]!.startSec).toBe(2); // not pulled early
  });

  it("defers following narration when previous unlocked cue overruns ZH end", () => {
    // First cue is always locked (ZH window). Long cue must be unlocked middle.
    const out = planHybridTimeline(
      [
        { index: 0, startSec: 0, endSec: 0.5, role: "narration", audioDurationSec: 0.4 },
        { index: 1, startSec: 0.5, endSec: 2, role: "narration", audioDurationSec: 3.0 },
        { index: 2, startSec: 2, endSec: 4, role: "narration", audioDurationSec: 1.0 },
      ],
      opts,
    );
    expect(out[0]!.locked).toBe(true);
    expect(out[1]!.locked).toBe(false);
    expect(out[1]!.fitTargetSec).toBeCloseTo(3.0); // finish sentence
    expect(out[2]!.startSec).toBeCloseTo(0.5 + 3.0); // deferred past ZH start 2
  });

  it("locks source to ZH window", () => {
    const out = planHybridTimeline(
      [
        { index: 0, startSec: 0, endSec: 2, role: "narration", audioDurationSec: 1.5 },
        { index: 1, startSec: 5, endSec: 6, role: "source", audioDurationSec: 1.2 },
      ],
      opts,
    );
    const source = out.find((c) => c.index === 1)!;
    expect(source.locked).toBe(true);
    expect(source.startSec).toBe(5);
    expect(source.fitTargetSec).toBeCloseTo(1.0); // ZH window
  });

  it("constrains unlocked narration before source with 500ms grace", () => {
    const out = planHybridTimeline(
      [
        { index: 0, startSec: 0, endSec: 0.5, role: "narration", audioDurationSec: 0.4 },
        { index: 1, startSec: 0.5, endSec: 2, role: "narration", audioDurationSec: 10 },
        { index: 2, startSec: 5, endSec: 6, role: "source", audioDurationSec: 1 },
      ],
      opts,
    );
    // start = max(0.5, prev≈0.5)=0.5; maxEnd = 5 + 0.5 = 5.5 → fitTarget = 5.0
    expect(out[1]!.locked).toBe(false);
    expect(out[1]!.startSec).toBeCloseTo(0.5);
    expect(out[1]!.fitTargetSec).toBeCloseTo(5.0);
  });

  it("marks new lock after gap >= blockGapSec", () => {
    const out = planHybridTimeline(
      [
        { index: 0, startSec: 0, endSec: 1, role: "narration", audioDurationSec: 0.5 },
        { index: 1, startSec: 3, endSec: 4, role: "narration", audioDurationSec: 0.5 }, // gap 2s
      ],
      opts,
    );
    expect(out[0]!.locked).toBe(true);
    expect(out[1]!.locked).toBe(true);
    expect(out[1]!.startSec).toBe(3);
  });

  it("uses effectiveRole: missing role treated as narration", () => {
    const out = planHybridTimeline(
      [{ index: 0, startSec: 0, endSec: 1, audioDurationSec: 0.4 }],
      opts,
    );
    expect(out[0]!.locked).toBe(true);
    expect(out[0]!.fitTargetSec).toBeCloseTo(1.0); // locked → ZH window, not natural 0.4
  });
});

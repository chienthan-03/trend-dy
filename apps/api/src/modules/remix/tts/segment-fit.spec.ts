import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyBaseTtsSpeed, applyPad, applyTempo, planSegmentFit } from "./segment-fit";

describe("planSegmentFit", () => {
  it("pads when audio shorter than window", () => {
    const plan = planSegmentFit({ audioDurationSec: 2, targetDurationSec: 5, maxSpeed: 1.25 });
    expect(plan).toEqual({ action: "pad", padSec: 3, speed: 1 });
  });

  it("speeds up when slightly longer", () => {
    const plan = planSegmentFit({ audioDurationSec: 5, targetDurationSec: 4, maxSpeed: 1.25 });
    expect(plan.action).toBe("speed");
    expect(plan.speed).toBeCloseTo(1.25, 2);
  });

  it("requests shorten when beyond max speed", () => {
    const plan = planSegmentFit({ audioDurationSec: 10, targetDurationSec: 4, maxSpeed: 1.25 });
    expect(plan.action).toBe("shorten");
  });

  it("returns ok when durations are nearly equal", () => {
    const plan = planSegmentFit({ audioDurationSec: 4.99, targetDurationSec: 5, maxSpeed: 1.25 });
    expect(plan).toEqual({ action: "ok", speed: 1 });
  });
});

describe("applyPad / applyTempo", () => {
  const env = process.env;
  const input = Buffer.from("fake-audio");

  beforeEach(() => {
    process.env = { ...env };
    process.env.REMIX_TTS_MODE = "fake";
  });

  afterEach(() => {
    process.env = env;
  });

  it("returns passthrough buffer in fake mode for applyPad", async () => {
    const result = await applyPad(input, 2);
    expect(result).toBe(input);
  });

  it("returns passthrough buffer in fake mode for applyTempo", async () => {
    const result = await applyTempo(input, 1.25);
    expect(result).toBe(input);
  });

  it("scales duration in fake mode for applyBaseTtsSpeed", async () => {
    const result = await applyBaseTtsSpeed(input, 4, 1.25);
    expect(result.buffer).toBe(input);
    expect(result.durationSec).toBeCloseTo(3.2, 5);
  });

  it("returns passthrough buffer in fake mode for applyTruncate", async () => {
    const { applyTruncate } = await import("./segment-fit");
    const result = await applyTruncate(input, 1.5);
    expect(result).toBe(input);
  });
});

describe("applyFitToTarget", () => {
  const env = process.env;
  const input = Buffer.from("fake-audio-longer-than-window");

  beforeEach(() => {
    process.env = { ...env };
    process.env.REMIX_TTS_MODE = "fake";
  });

  afterEach(() => {
    process.env = env;
  });

  it("marks shorten plans as needing truncate so overrun cannot spill into the next cue", async () => {
    const { applyFitToTarget, planSegmentFit } = await import("./segment-fit");
    const plan = planSegmentFit({
      audioDurationSec: 10,
      targetDurationSec: 4,
      maxSpeed: 1.25,
    });
    expect(plan.action).toBe("shorten");

    const result = await applyFitToTarget(input, plan, 4);
    // Fake mode: tempo is passthrough, but shorten must still return a
    // truncated buffer identity path that live mode would hard-cut to target.
    expect(result.truncated).toBe(true);
    expect(result.buffer).toBeDefined();
  });
});

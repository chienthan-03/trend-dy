import { beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeDubTimeline } from "./finalize-dub-timeline";

const { probeClipDurationSecMock, applyTruncateMock } = vi.hoisted(() => ({
  probeClipDurationSecMock: vi.fn(async (_buffer: Buffer, fallbackSec: number) => fallbackSec),
  applyTruncateMock: vi.fn(async (_buffer: Buffer, durationSec: number) =>
    Buffer.from(`trimmed:${durationSec}`),
  ),
}));

vi.mock("../remix-audio.util", () => ({
  probeClipDurationSec: probeClipDurationSecMock,
}));

vi.mock("./segment-fit", () => ({
  applyTruncate: applyTruncateMock,
}));

describe("finalizeDubTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    probeClipDurationSecMock.mockImplementation(
      async (_buffer: Buffer, fallbackSec: number) => fallbackSec,
    );
  });

  it("defers unlocked cue when previous clip runs longer than planned", async () => {
    probeClipDurationSecMock
      .mockResolvedValueOnce(3.5)
      .mockResolvedValueOnce(0.4)
      .mockResolvedValueOnce(3.5)
      .mockResolvedValueOnce(0.4);

    const out = await finalizeDubTimeline([
      {
        index: 0,
        plannedStartSec: 0,
        fitTargetSec: 3.5,
        locked: true,
        buffer: Buffer.from("a"),
      },
      {
        index: 1,
        plannedStartSec: 1.5,
        fitTargetSec: 0.4,
        locked: false,
        buffer: Buffer.from("b"),
      },
    ]);

    expect(out[1]!.startSec).toBeGreaterThanOrEqual(3.48);
    expect(out[1]!.deferred).toBe(true);
  });

  it("truncates clip that would overlap the next chained start", async () => {
    probeClipDurationSecMock
      .mockResolvedValueOnce(2.5)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2.5);

    const out = await finalizeDubTimeline([
      {
        index: 0,
        plannedStartSec: 0,
        fitTargetSec: 2.5,
        locked: false,
        buffer: Buffer.from("a"),
      },
      {
        index: 1,
        plannedStartSec: 2,
        fitTargetSec: 1,
        locked: true,
        buffer: Buffer.from("b"),
      },
    ]);

    expect(applyTruncateMock).toHaveBeenCalledWith(Buffer.from("a"), 2);
    expect(out[0]!.truncated).toBe(true);
    expect(out[0]!.endSec).toBeLessThanOrEqual(2.02);
  });

  it("keeps locked cue pinned to planned start", async () => {
    const out = await finalizeDubTimeline([
      {
        index: 0,
        plannedStartSec: 5,
        fitTargetSec: 1,
        locked: true,
        buffer: Buffer.from("a"),
      },
    ]);

    expect(out[0]!.startSec).toBe(5);
    expect(out[0]!.deferred).toBe(false);
  });
});

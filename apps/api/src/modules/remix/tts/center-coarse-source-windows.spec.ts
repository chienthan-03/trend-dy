import { describe, expect, it } from "vitest";
import type { RemixTranscriptSegment } from "@factory/shared";
import { centerCoarseSourceWindows } from "./center-coarse-source-windows";

const cue = (
  startSec: number,
  endSec: number,
  text: string,
  role: RemixTranscriptSegment["role"],
): RemixTranscriptSegment => ({
  startSec,
  endSec,
  text,
  role,
  roleSource: "auto",
});

describe("centerCoarseSourceWindows", () => {
  it("moves end-packed review so later sentences start after the clip", () => {
    const segments: RemixTranscriptSegment[] = [
      cue(0, 6, "Mở đầu.", "narration"),
      cue(6, 12, "Vẫn kể trước clip.", "narration"),
      cue(12, 19.3, "Nhận xét cảnh vừa chiếu.", "narration"),
      cue(19.3, 30, "Tell me where he is.", "source"),
    ];

    const out = centerCoarseSourceWindows(segments, { windowSec: 30 });
    const source = out.find((segment) => segment.role === "source")!;
    const laterReview = out.find((segment) =>
      segment.text.includes("Nhận xét"),
    )!;
    const opening = out.find((segment) => segment.text.includes("Mở đầu"))!;

    expect(source.startSec).toBeGreaterThan(8);
    expect(source.endSec).toBeLessThan(22);
    expect(laterReview.startSec).toBeGreaterThanOrEqual(source.endSec - 0.05);
    expect(opening.startSec).toBe(0);
    expect(laterReview.endSec - laterReview.startSec).toBeCloseTo(7.3, 1);
    expect(source.endSec - source.startSec).toBeCloseTo(10.7, 1);
  });

  it("does not change speaking-window duration of any cue", () => {
    const segments: RemixTranscriptSegment[] = [
      cue(0, 10, "Một.", "narration"),
      cue(10, 20, "Hai.", "narration"),
      cue(20, 30, "Hello.", "source"),
    ];

    const out = centerCoarseSourceWindows(segments, { windowSec: 30 });

    for (const [index, segment] of segments.entries()) {
      expect(out[index]!.endSec - out[index]!.startSec).toBeCloseTo(
        segment.endSec - segment.startSec,
        5,
      );
      expect(out[index]!.text).toBe(segment.text);
    }
  });

  it("leaves windows with Giữ gốc source untouched", () => {
    const segments: RemixTranscriptSegment[] = [
      cue(0, 20, "Kể.", "narration"),
      {
        startSec: 20,
        endSec: 30,
        text: "Locked line.",
        role: "source",
        roleSource: "manual",
      },
    ];

    const out = centerCoarseSourceWindows(segments, { windowSec: 30 });

    expect(out[0]?.startSec).toBe(0);
    expect(out[0]?.endSec).toBe(20);
    expect(out[1]?.startSec).toBe(20);
    expect(out[1]?.endSec).toBe(30);
  });
});

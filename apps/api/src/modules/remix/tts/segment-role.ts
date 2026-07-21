import type { RemixSegmentRole } from "@factory/shared";

export const effectiveRole = (seg: { role?: RemixSegmentRole }): RemixSegmentRole =>
  seg.role === "source" ? "source" : "narration";

const mergeIntervals = (
  intervals: Array<{ startSec: number; endSec: number }>,
): Array<{ startSec: number; endSec: number }> => {
  const raw = intervals
    .filter((s) => s.endSec > s.startSec)
    .map((s) => ({ startSec: s.startSec, endSec: s.endSec }))
    .sort((a, b) => a.startSec - b.startSec);
  const out: Array<{ startSec: number; endSec: number }> = [];
  for (const iv of raw) {
    const last = out[out.length - 1];
    if (!last || iv.startSec > last.endSec) out.push({ ...iv });
    else last.endSec = Math.max(last.endSec, iv.endSec);
  }
  return out;
};

export const mergeNarrationIntervals = (
  segments: Array<{ startSec: number; endSec: number; role?: RemixSegmentRole }>,
): Array<{ startSec: number; endSec: number }> =>
  mergeIntervals(
    segments
      .filter((s) => effectiveRole(s) === "narration")
      .map((s) => ({ startSec: s.startSec, endSec: s.endSec })),
  );

/** MVP duck: every cue window that has TTS audio, ignoring role labels. */
export const mergeAllCueIntervals = (
  segments: Array<{ startSec: number; endSec: number }>,
): Array<{ startSec: number; endSec: number }> =>
  mergeIntervals(
    segments.map((s) => ({ startSec: s.startSec, endSec: s.endSec })),
  );

import type { RemixTranscriptSegment } from "@factory/shared";
import { effectiveRole } from "./segment-role";

const EPS = 0.05;

const round2 = (value: number): number => Math.round(value * 100) / 100;

type Interval = {
  startSec: number;
  endSec: number;
};

const subtractIntervals = (
  startSec: number,
  endSec: number,
  blocked: Interval[],
): Interval[] => {
  const sorted = [...blocked]
    .filter((interval) => interval.endSec > interval.startSec)
    .sort((a, b) => a.startSec - b.startSec);
  const gaps: Interval[] = [];
  let cursor = startSec;

  for (const interval of sorted) {
    const boundedStart = Math.max(interval.startSec, startSec);
    const boundedEnd = Math.min(interval.endSec, endSec);
    if (boundedEnd <= boundedStart) continue;
    if (boundedStart > cursor) {
      gaps.push({ startSec: cursor, endSec: boundedStart });
    }
    cursor = Math.max(cursor, boundedEnd);
  }

  if (cursor < endSec) {
    gaps.push({ startSec: cursor, endSec });
  }

  return gaps;
};

const leftoverOffsetSec = (timeSec: number, leftover: Interval[]): number => {
  let offsetSec = 0;
  for (const gap of leftover) {
    if (timeSec < gap.startSec - EPS) return offsetSec;
    if (timeSec <= gap.endSec + EPS) {
      return (
        offsetSec + Math.max(0, Math.min(timeSec, gap.endSec) - gap.startSec)
      );
    }
    offsetSec += gap.endSec - gap.startSec;
  }
  return offsetSec;
};

const timeAtLeftoverOffsetSec = (
  offsetSec: number,
  leftover: Interval[],
): number => {
  let remainingSec = Math.max(offsetSec, 0);
  for (const gap of leftover) {
    const gapDurationSec = gap.endSec - gap.startSec;
    if (remainingSec <= gapDurationSec) return gap.startSec + remainingSec;
    remainingSec -= gapDurationSec;
  }
  return leftover.at(-1)?.endSec ?? 0;
};

const overlaps = (startSec: number, endSec: number, blocked: Interval): boolean =>
  startSec < blocked.endSec - EPS && endSec > blocked.startSec + EPS;

export type CenterCoarseSourceWindowsOptions = {
  windowSec: number;
  videoEndSec?: number;
};

/**
 * Dual-pass Qwen has no word times, so recovered English used to be packed at
 * the end of each search window and leftover review filled 0 → englishStart.
 * Review of later action then started too early. Center auto source in each
 * window and remap narration into the leftover gaps. Cue durations stay the
 * same — this only moves start times, it does not slow speech.
 */
export const centerCoarseSourceWindows = (
  segments: RemixTranscriptSegment[],
  options: CenterCoarseSourceWindowsOptions,
): RemixTranscriptSegment[] => {
  const windowSec = options.windowSec;
  if (!(windowSec > 0) || segments.length === 0) return segments;

  const videoEndSec =
    options.videoEndSec ??
    Math.max(...segments.map((segment) => segment.endSec), 0);
  if (videoEndSec <= 0) return segments;

  const out = segments.map((segment) => ({ ...segment }));
  const windowCount = Math.max(1, Math.ceil(videoEndSec / windowSec - 1e-9));

  for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
    const windowStartSec = windowIndex * windowSec;
    const windowEndSec = Math.min((windowIndex + 1) * windowSec, videoEndSec);
    const inWindow = out
      .map((segment, index) => ({ segment, index }))
      .filter(
        ({ segment }) =>
          segment.startSec >= windowStartSec - EPS &&
          segment.startSec < windowEndSec - EPS,
      );

    if (inWindow.length === 0) continue;
    if (
      inWindow.some(
        ({ segment }) =>
          effectiveRole(segment) === "source" &&
          segment.roleSource === "manual",
      )
    ) {
      continue;
    }

    const sources = inWindow.filter(
      ({ segment }) => effectiveRole(segment) === "source",
    );
    if (sources.length === 0) continue;

    const sourceDurationSec = sources.reduce(
      (sum, { segment }) =>
        sum + Math.max(segment.endSec - segment.startSec, 0),
      0,
    );
    const slackSec = Math.max(
      windowEndSec - windowStartSec - sourceDurationSec,
      0,
    );
    const newSourceStartSec = windowStartSec + slackSec / 2;
    const newSourceBlock: Interval = {
      startSec: newSourceStartSec,
      endSec: newSourceStartSec + sourceDurationSec,
    };

    const oldLeftover = subtractIntervals(
      windowStartSec,
      windowEndSec,
      sources.map(({ segment }) => ({
        startSec: segment.startSec,
        endSec: segment.endSec,
      })),
    );

    const sourceOrder = [...sources].sort(
      (left, right) =>
        left.segment.startSec - right.segment.startSec ||
        left.index - right.index,
    );
    let sourceCursorSec = newSourceStartSec;
    for (const { index, segment } of sourceOrder) {
      const durationSec = Math.max(segment.endSec - segment.startSec, 0);
      out[index] = {
        ...segment,
        startSec: round2(sourceCursorSec),
        endSec: round2(sourceCursorSec + durationSec),
      };
      sourceCursorSec += durationSec;
    }

    const newLeftover = subtractIntervals(windowStartSec, windowEndSec, [
      newSourceBlock,
    ]);
    if (newLeftover.length === 0 || oldLeftover.length === 0) continue;

    const narrations = [...inWindow.filter(
      ({ segment }) => effectiveRole(segment) !== "source",
    )].sort(
      (left, right) =>
        left.segment.startSec - right.segment.startSec ||
        left.index - right.index,
    );

    for (const { index, segment } of narrations) {
      const durationSec = Math.max(segment.endSec - segment.startSec, 0);
      const oldOffsetSec = leftoverOffsetSec(segment.startSec, oldLeftover);
      let startSec = timeAtLeftoverOffsetSec(oldOffsetSec, newLeftover);
      let endSec = startSec + durationSec;

      if (overlaps(startSec, endSec, newSourceBlock)) {
        const fitsBefore =
          startSec >= windowStartSec - EPS &&
          startSec + durationSec <= newSourceBlock.startSec + EPS;
        startSec = fitsBefore ? startSec : newSourceBlock.endSec;
        endSec = startSec + durationSec;
      }

      out[index] = {
        ...segment,
        startSec: round2(startSec),
        endSec: round2(endSec),
      };
    }
  }

  return out;
};

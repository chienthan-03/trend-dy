import type { RemixSegmentRole, RemixSegmentRoleSource } from "@factory/shared";
import { effectiveRole } from "./segment-role";

export type HybridCueIn = {
  index: number;
  startSec: number;
  endSec: number;
  role?: RemixSegmentRole;
  roleSource?: RemixSegmentRoleSource;
  audioDurationSec: number;
};

export type HybridCueOut = {
  index: number;
  startSec: number;
  endSec: number;
  fitTargetSec: number;
  locked: boolean;
};

export type HybridTimelineOptions = {
  blockGapSec: number;
  lockGraceSec: number;
  maxSpeed: number;
  videoEndSec?: number;
  lockAutoSource?: boolean;
};

export type HybridLockCueIn = Pick<
  HybridCueIn,
  "index" | "startSec" | "endSec" | "role" | "roleSource"
>;

export type HybridLockOptions = Pick<
  HybridTimelineOptions,
  "blockGapSec" | "lockAutoSource"
>;

const EPS = 0.1;

/**
 * Which cues are lock-anchored to their ZH window.
 *
 * Default (precise STT): first cue, any source-role cue, and narration that
 * starts a new "block" after a silence gap >= `blockGapSec`.
 *
 * Coarse timing (`lockAutoSource: false`, e.g. bilingual dual-pass windows):
 * ZH windows are guesses, so squeezing block-start cues races ahead of
 * picture. Only lock cues the user marked Giữ gốc (`roleSource: "manual"`).
 *
 * Depends only on cue timing/role — not audio duration — so callers can
 * compute this before TTS synthesis runs.
 */
export const markHybridLocks = (
  cues: HybridLockCueIn[],
  options: HybridLockOptions,
): Set<number> => {
  const sorted = [...cues].sort(
    (a, b) => a.startSec - b.startSec || a.index - b.index,
  );
  const trustZhWindows = options.lockAutoSource !== false;

  const lockedIdx = new Set<number>();
  sorted.forEach((cue, i) => {
    if (trustZhWindows && i === 0) lockedIdx.add(cue.index);
    if (effectiveRole(cue) === "source") {
      if (trustZhWindows || cue.roleSource === "manual") {
        lockedIdx.add(cue.index);
      }
    }
    if (trustZhWindows && i > 0) {
      const prev = sorted[i - 1]!;
      const gap = cue.startSec - prev.endSec;
      if (effectiveRole(cue) === "narration" && gap >= options.blockGapSec) {
        lockedIdx.add(cue.index);
      }
    }
  });

  return lockedIdx;
};

export const planHybridTimeline = (
  cues: HybridCueIn[],
  options: HybridTimelineOptions,
): HybridCueOut[] => {
  const sorted = [...cues].sort(
    (a, b) => a.startSec - b.startSec || a.index - b.index,
  );
  if (sorted.length === 0) return [];

  const lockedIdx = markHybridLocks(sorted, {
    blockGapSec: options.blockGapSec,
    lockAutoSource: options.lockAutoSource,
  });

  const lockStarts = sorted
    .filter((c) => lockedIdx.has(c.index))
    .map((c) => c.startSec);

  const nextLockStartAfter = (zhStart: number): number => {
    const next = lockStarts.find((s) => s > zhStart + 1e-9);
    if (next != null) return next;
    if (options.videoEndSec != null && Number.isFinite(options.videoEndSec)) {
      return options.videoEndSec;
    }
    return Number.POSITIVE_INFINITY;
  };

  let prevPlacedEnd = 0;
  const out: HybridCueOut[] = [];

  for (const cue of sorted) {
    const locked = lockedIdx.has(cue.index);
    if (locked) {
      const fitTargetSec = Math.max(cue.endSec - cue.startSec, EPS);
      const startSec = cue.startSec;
      const endSec = startSec + fitTargetSec;
      out.push({
        index: cue.index,
        startSec,
        endSec,
        fitTargetSec,
        locked: true,
      });
      prevPlacedEnd = startSec + fitTargetSec;
      continue;
    }

    const startSec = Math.max(cue.startSec, prevPlacedEnd);
    const naturalEnd = startSec + cue.audioDurationSec;
    const nextLock = nextLockStartAfter(cue.startSec);
    const maxEndSec = Number.isFinite(nextLock)
      ? nextLock + options.lockGraceSec
      : Number.POSITIVE_INFINITY;
    const fitTargetSec =
      naturalEnd <= maxEndSec
        ? Math.max(cue.audioDurationSec, EPS)
        : Math.max(maxEndSec - startSec, EPS);
    const placedEnd = startSec + Math.min(cue.audioDurationSec, fitTargetSec);
    out.push({
      index: cue.index,
      startSec,
      endSec: placedEnd,
      fitTargetSec,
      locked: false,
    });
    prevPlacedEnd = placedEnd;
  }

  return out.sort((a, b) => a.index - b.index);
};

import { probeClipDurationSec } from "../remix-audio.util";
import { applyTruncate } from "./segment-fit";

const EPS_SEC = 0.02;

export type FinalizeTimelineEntry = {
  index: number;
  plannedStartSec: number;
  fitTargetSec: number;
  locked: boolean;
  buffer: Buffer;
};

export type FinalizedTimelineEntry = {
  index: number;
  startSec: number;
  endSec: number;
  buffer: Buffer;
  truncated: boolean;
  deferred: boolean;
};

/**
 * Post-fit pass for replace-mode dub: chain unlocked cues on actual audio end,
 * pin locked cues to their planned ZH anchor, and hard-truncate every clip so
 * it cannot spill into the next cue's start (amix sums overlaps into double voice).
 */
export const finalizeDubTimeline = async (
  entries: FinalizeTimelineEntry[],
): Promise<FinalizedTimelineEntry[]> => {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => a.index - b.index);
  const placements: Array<FinalizeTimelineEntry & { startSec: number }> = [];

  let cursorSec = 0;
  for (const entry of sorted) {
    const startSec = entry.locked
      ? entry.plannedStartSec
      : Math.max(entry.plannedStartSec, cursorSec);

    const fitDurSec = Math.max(entry.fitTargetSec, EPS_SEC);
    const probedDurSec = await probeClipDurationSec(entry.buffer, fitDurSec);
    const placedDurSec = Math.min(probedDurSec, fitDurSec);
    cursorSec = startSec + placedDurSec;

    placements.push({ ...entry, startSec });
  }

  const out: FinalizedTimelineEntry[] = [];

  for (let i = 0; i < placements.length; i += 1) {
    const placement = placements[i]!;
    const next = placements[i + 1];

    let maxDurSec = Math.max(placement.fitTargetSec, EPS_SEC);
    if (next) {
      const hardCapSec = Math.max(next.startSec - placement.startSec, EPS_SEC);
      maxDurSec = Math.min(maxDurSec, hardCapSec);
    }

    let buffer = placement.buffer;
    let durSec = await probeClipDurationSec(buffer, maxDurSec);
    let truncated = false;

    if (durSec > maxDurSec + EPS_SEC) {
      buffer = await applyTruncate(buffer, maxDurSec);
      durSec = maxDurSec;
      truncated = true;
    }

    out.push({
      index: placement.index,
      startSec: placement.startSec,
      endSec: placement.startSec + durSec,
      buffer,
      truncated,
      deferred: !placement.locked && placement.startSec > placement.plannedStartSec + EPS_SEC,
    });
  }

  return out;
};

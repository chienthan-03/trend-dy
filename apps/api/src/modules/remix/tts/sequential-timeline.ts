const EPS_SEC = 0.05;

export type SequentialCueIn = {
  index: number;
  zhStartSec: number;
  zhEndSec: number;
  audioDurationSec: number;
};

export type SequentialCueOut = {
  index: number;
  startSec: number;
  endSec: number;
};

export type SequentialTimelineOptions = {
  /** Reserved for future block-aware policies; placement always chains globally. */
  blockGapSec: number;
};

/**
 * Place cues one after another at fitted clip duration. Each cue starts when the
 * previous one finishes (never earlier than its ZH `startSec`). Clips are fitted
 * to their ZH windows upstream before this planner runs.
 */
export const planSequentialTimeline = (
  cues: SequentialCueIn[],
  _options: SequentialTimelineOptions,
): SequentialCueOut[] => {
  const sorted = [...cues].sort((a, b) => a.index - b.index);
  let cursorSec = 0;
  const out: SequentialCueOut[] = [];

  for (const cue of sorted) {
    const startSec = Math.max(cue.zhStartSec, cursorSec);
    const durationSec = Math.max(cue.audioDurationSec, EPS_SEC);
    const endSec = startSec + durationSec;
    cursorSec = endSec;
    out.push({ index: cue.index, startSec, endSec });
  }

  return out;
};

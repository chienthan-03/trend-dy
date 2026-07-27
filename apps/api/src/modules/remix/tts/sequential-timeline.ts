const EPS_SEC = 0.05;

export type SequentialCueIn = {
  index: number;
  zhStartSec: number;
  audioDurationSec: number;
};

export type SequentialCueOut = {
  index: number;
  startSec: number;
  endSec: number;
};

/**
 * Place cues one after another at natural TTS duration — no speed-up,
 * no truncate. Each cue starts when the previous finishes (never earlier
 * than its ZH `startSec` so block gaps stay silent).
 */
export const planSequentialTimeline = (
  cues: SequentialCueIn[],
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

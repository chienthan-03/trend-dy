export type CueForBatch = {
  index: number;
  text: string;
  startSec: number;
  endSec: number;
};

export type TtsCueBatch = {
  /** Inclusive segment indexes in the original transcript. */
  segmentIndexes: number[];
  cues: CueForBatch[];
  /** Text sent to TTS (cues joined). */
  text: string;
  /** Sum of cue window durations — used when splitting audio by timeline weight. */
  totalWindowSec: number;
};

const DEFAULT_MAX_DURATION_SEC = 10;
const DEFAULT_MAX_CHARS = 400;

export const getTtsBatchMaxDurationSec = (): number => {
  const n = Number(process.env.REMIX_TTS_BATCH_MAX_DURATION_SEC ?? DEFAULT_MAX_DURATION_SEC);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_DURATION_SEC;
  return n;
};

export const getTtsBatchMaxChars = (): number => {
  const n = Number(process.env.REMIX_TTS_BATCH_MAX_CHARS ?? DEFAULT_MAX_CHARS);
  if (!Number.isFinite(n) || n < 40) return DEFAULT_MAX_CHARS;
  return Math.floor(n);
};

/** `batch` (default) = merge adjacent cues; `per_cue` = legacy 1 TTS / cue. */
export const getTtsBatchMode = (): "batch" | "per_cue" => {
  const mode = process.env.REMIX_TTS_BATCH_MODE?.trim().toLowerCase();
  if (mode === "per_cue" || mode === "cue") return "per_cue";
  return "batch";
};

/**
 * Piper default `per_cue`: one synthesis per transcript cue so audio is never
 * ratio-split (smart-batch cuts lose syllables at boundaries — "mất chữ").
 * Set `REMIX_PIPER_TTS_BATCH_MODE=smart` to merge cues for speed.
 */
export const getPiperTtsBatchMode = (): "smart" | "per_cue" => {
  const mode = process.env.REMIX_PIPER_TTS_BATCH_MODE?.trim().toLowerCase();
  if (mode === "smart") return "smart";
  return "per_cue";
};

/** One TTS call per non-empty cue (no post-synthesis audio splitting). */
export const perCueBatchesForTts = (cues: CueForBatch[]): TtsCueBatch[] =>
  cues
    .filter((cue) => cue.text.trim().length > 0)
    .map((cue) => ({
      segmentIndexes: [cue.index],
      cues: [cue],
      text: cue.text.trim(),
      totalWindowSec: cueWindowSec(cue),
    }));

const cueWindowSec = (cue: CueForBatch): number =>
  Math.max(cue.endSec - cue.startSec, 0.1);

const joinCueTexts = (cues: CueForBatch[]): string =>
  cues
    .map((cue) => cue.text.trim())
    .filter(Boolean)
    .join(" ");

/**
 * Group adjacent transcript cues into TTS batches so one OpenRouter speech
 * call covers several Segments, then audio is split back onto each cue window.
 *
 * Never merges across a large timeline gap (silence between cues).
 */
export const batchCuesForTts = (
  cues: CueForBatch[],
  options?: {
    maxDurationSec?: number;
    maxChars?: number;
    /** Max gap between end of cue N and start of N+1 to still merge (default 0.75s). */
    maxGapSec?: number;
  },
): TtsCueBatch[] => {
  if (cues.length === 0) return [];

  const maxDurationSec = options?.maxDurationSec ?? getTtsBatchMaxDurationSec();
  const maxChars = options?.maxChars ?? getTtsBatchMaxChars();
  const maxGapSec = options?.maxGapSec ?? 0.75;

  const batches: TtsCueBatch[] = [];
  let current: CueForBatch[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const text = joinCueTexts(current);
    batches.push({
      segmentIndexes: current.map((cue) => cue.index),
      cues: current,
      text,
      totalWindowSec: current.reduce((sum, cue) => sum + cueWindowSec(cue), 0),
    });
    current = [];
  };

  for (const cue of cues) {
    const text = cue.text.trim();
    if (!text) {
      flush();
      continue;
    }

    if (current.length === 0) {
      current = [cue];
      continue;
    }

    const prev = current[current.length - 1]!;
    const gap = cue.startSec - prev.endSec;
    const nextWindow =
      current.reduce((sum, item) => sum + cueWindowSec(item), 0) +
      cueWindowSec(cue);
    const nextText = joinCueTexts([...current, cue]);

    const wouldBreakGap = gap > maxGapSec;
    const wouldBreakDuration = nextWindow > maxDurationSec && current.length > 0;
    const wouldBreakChars = nextText.length > maxChars && current.length > 0;

    if (wouldBreakGap || wouldBreakDuration || wouldBreakChars) {
      flush();
      current = [cue];
      continue;
    }

    current.push(cue);
  }

  flush();
  return batches;
};

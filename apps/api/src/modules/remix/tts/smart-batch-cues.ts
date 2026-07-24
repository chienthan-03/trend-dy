import {
  getSmartBatchMaxChars,
  getSmartBatchMaxDurationSec,
  getSmartBatchMaxGapSec,
} from "../remix-config";
import type { CueForBatch, TtsCueBatch } from "./batch-cues-for-tts";
import {
  splitBatchAudioToCues,
  type CueAudioSlice,
} from "./split-batch-audio";

const cueWindowSec = (cue: CueForBatch): number =>
  Math.max(cue.endSec - cue.startSec, 0.1);

const joinCueTexts = (cues: CueForBatch[]): string =>
  cues
    .map((cue) => cue.text.trim())
    .filter(Boolean)
    .join(" ");

const endsWithSentencePunctuation = (text: string): boolean =>
  /[.?!…]\s*$/.test(text.trim());

const toBatch = (cues: CueForBatch[]): TtsCueBatch => ({
  segmentIndexes: cues.map((item) => item.index),
  cues,
  text: joinCueTexts(cues),
  totalWindowSec: cues.reduce((sum, item) => sum + cueWindowSec(item), 0),
});

/**
 * Smart cue batching for Piper TTS: merge adjacent cues under gap/duration/char
 * caps, preferring to flush after sentence-ending punctuation when the next cue
 * would exceed caps.
 *
 * Split (MVP): cue-boundary slices only — reuses window-weight allocation from
 * `split-batch-audio` (no ffmpeg silencedetect snap; follow-up).
 */
export const smartBatchCuesForTts = (
  cues: CueForBatch[],
  options?: {
    maxDurationSec?: number;
    maxChars?: number;
    maxGapSec?: number;
  },
): TtsCueBatch[] => {
  if (cues.length === 0) return [];

  const maxDurationSec =
    options?.maxDurationSec ?? getSmartBatchMaxDurationSec();
  const maxChars = options?.maxChars ?? getSmartBatchMaxChars();
  const maxGapSec = options?.maxGapSec ?? getSmartBatchMaxGapSec();

  const batches: TtsCueBatch[] = [];
  let current: CueForBatch[] = [];

  const flush = () => {
    if (current.length === 0) return;
    batches.push(toBatch(current));
    current = [];
  };

  const tryAddCue = (cue: CueForBatch): void => {
    while (true) {
      const text = cue.text.trim();
      if (!text) {
        flush();
        return;
      }

      if (current.length === 0) {
        current = [cue];
        return;
      }

      const prev = current[current.length - 1]!;
      const gap = cue.startSec - prev.endSec;
      const nextWindow =
        current.reduce((sum, item) => sum + cueWindowSec(item), 0) +
        cueWindowSec(cue);
      const nextText = joinCueTexts([...current, cue]);

      const wouldBreakGap = gap > maxGapSec;
      const wouldBreakDuration =
        nextWindow > maxDurationSec && current.length > 0;
      const wouldBreakChars = nextText.length > maxChars && current.length > 0;

      if (wouldBreakGap) {
        flush();
        current = [cue];
        return;
      }

      if (wouldBreakDuration || wouldBreakChars) {
        let splitAt = -1;
        for (let i = current.length - 1; i >= 0; i -= 1) {
          if (endsWithSentencePunctuation(current[i]!.text)) {
            splitAt = i;
            break;
          }
        }

        if (splitAt >= 0 && splitAt < current.length - 1) {
          batches.push(toBatch(current.slice(0, splitAt + 1)));
          current = current.slice(splitAt + 1);
          continue;
        }

        flush();
        current = [cue];
        return;
      }

      current.push(cue);
      return;
    }
  };

  for (const cue of cues) {
    tryAddCue(cue);
  }

  flush();
  return batches;
};

/** Cue-boundary-only MVP split — delegates to window-weight batch slicing. */
export const splitSmartBatchAudioToCues = async (input: {
  cues: CueForBatch[];
  batchMp3: Buffer;
  batchAudioDurationSec: number;
}): Promise<CueAudioSlice[]> => splitBatchAudioToCues(input);

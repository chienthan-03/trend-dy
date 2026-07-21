import {
  buildSegmentsFromPlainText,
  PLAIN_TEXT_MAX_CHARS,
} from "../../../ai/plain-text-segments";

export const CUE_MAX_DURATION_SEC = 15;
export const CUE_MIN_SPEECH_SEC = 0.25;
export const CUE_WORD_GAP_SEC = 0.8;
export const CUE_MAX_WORD_DURATION_SEC = 1.0;
export const CUE_SOFT_WRAP_CHARS = PLAIN_TEXT_MAX_CHARS;
export const CUE_COARSE_MEDIAN_SEC = 15;
export const CUE_COARSE_FRACTION = 0.2;

export type CueSegment = { startSec: number; endSec: number; text: string };
export type CueWord = { startSec: number; endSec: number; text: string };

const SENTENCE_PUNCT_RE = /[。！？.!?]/;
const round2 = (value: number): number => Math.round(value * 100) / 100;

const shouldKeepWhisperSegment = (segment: CueSegment): boolean => {
  const duration = segment.endSec - segment.startSec;
  if (duration <= 0) return false;
  if (duration > CUE_MAX_DURATION_SEC) return false;
  const text = segment.text.trim();
  if (!text) return false;
  if (SENTENCE_PUNCT_RE.test(text)) return true;
  return text.length <= CUE_SOFT_WRAP_CHARS;
};

const wordsInWindow = (
  words: CueWord[],
  windowStart: number,
  windowEnd: number,
): CueWord[] =>
  words
    .filter(
      (word) =>
        word.endSec > windowStart &&
        word.startSec < windowEnd &&
        word.endSec > word.startSec,
    )
    .map((word) => ({
      startSec: Math.max(word.startSec, windowStart),
      endSec: Math.min(word.endSec, windowEnd),
      text: word.text,
    }))
    .filter((word) => word.endSec > word.startSec)
    .sort((a, b) => a.startSec - b.startSec);

type WordIsland = CueWord[];

const clusterWordsIntoIslands = (words: CueWord[]): WordIsland[] => {
  const kept = words.filter(
    (word) => word.endSec - word.startSec <= CUE_MAX_WORD_DURATION_SEC,
  );
  if (kept.length === 0) return [];

  const islands: WordIsland[] = [];
  let current: CueWord[] = [kept[0]!];
  let islandEnd = kept[0]!.endSec;

  for (let i = 1; i < kept.length; i += 1) {
    const word = kept[i]!;
    const gap = word.startSec - islandEnd;
    if (gap >= CUE_WORD_GAP_SEC) {
      islands.push(current);
      current = [word];
      islandEnd = word.endSec;
    } else {
      current.push(word);
      islandEnd = Math.max(islandEnd, word.endSec);
    }
  }
  islands.push(current);
  return islands;
};

const cuesFromIsland = (island: CueWord[]): CueSegment[] => {
  if (island.length === 0) return [];
  const out: CueSegment[] = [];
  let i = 0;
  while (i < island.length) {
    const startSec = island[i]!.startSec;
    let text = "";
    let endSec = island[i]!.endSec;
    while (i < island.length) {
      const next = text + island[i]!.text;
      if (text.length > 0 && next.length > CUE_SOFT_WRAP_CHARS) break;
      text = next;
      endSec = island[i]!.endSec;
      i += 1;
      if (SENTENCE_PUNCT_RE.test(island[i - 1]!.text)) break;
    }
    if (text.trim()) {
      out.push({
        startSec: round2(startSec),
        endSec: round2(endSec),
        text: text.trim(),
      });
    } else {
      i += 1;
    }
  }
  return out;
};

const capLongCues = (cues: CueSegment[], words: CueWord[]): CueSegment[] => {
  const out: CueSegment[] = [];
  for (const cue of cues) {
    if (cue.endSec - cue.startSec <= CUE_MAX_DURATION_SEC) {
      out.push(cue);
      continue;
    }
    const mid = (cue.startSec + cue.endSec) / 2;
    const inCue = wordsInWindow(words, cue.startSec, cue.endSec).filter(
      (w) => w.endSec - w.startSec <= CUE_MAX_WORD_DURATION_SEC,
    );
    if (inCue.length < 2) {
      out.push({ ...cue, endSec: round2(cue.startSec + CUE_MAX_DURATION_SEC) });
      continue;
    }
    let cutAt = inCue[0]!.endSec;
    let best = Number.POSITIVE_INFINITY;
    for (const word of inCue) {
      const dist = Math.abs(word.endSec - mid);
      if (dist < best) {
        best = dist;
        cutAt = word.endSec;
      }
    }
    const leftWords = inCue.filter((w) => w.endSec <= cutAt + 1e-6);
    const rightWords = inCue.filter((w) => w.startSec >= cutAt - 1e-6);
    out.push(...capLongCues(cuesFromIsland(leftWords), words));
    out.push(...capLongCues(cuesFromIsland(rightWords), words));
  }
  return out;
};

const mergeTinyCues = (cues: CueSegment[]): CueSegment[] => {
  if (cues.length === 0) return [];
  const sorted = [...cues].sort((a, b) => a.startSec - b.startSec);
  const out: CueSegment[] = [];
  for (const cue of sorted) {
    const dur = cue.endSec - cue.startSec;
    const last = out[out.length - 1];
    if (dur < CUE_MIN_SPEECH_SEC && last) {
      last.endSec = cue.endSec;
      last.text = `${last.text}${cue.text}`;
      continue;
    }
    if (dur < CUE_MIN_SPEECH_SEC && !last) {
      // Defer merge into next
      out.push({ ...cue });
      continue;
    }
    if (
      last &&
      last.endSec - last.startSec < CUE_MIN_SPEECH_SEC
    ) {
      last.endSec = cue.endSec;
      last.text = `${last.text}${cue.text}`;
      continue;
    }
    out.push({ ...cue });
  }
  return out.filter((c) => c.endSec > c.startSec && c.text.trim().length > 0);
};

const rebuildFromWords = (
  segment: CueSegment,
  words: CueWord[],
): CueSegment[] | null => {
  const windowWords = wordsInWindow(words, segment.startSec, segment.endSec);
  if (windowWords.length === 0) return null;

  const islands = clusterWordsIntoIslands(windowWords);
  const cues = islands.flatMap((island) => cuesFromIsland(island));
  return mergeTinyCues(capLongCues(cues, windowWords));
};

export const normalizeCueTiming = (input: {
  segments: CueSegment[];
  words: CueWord[];
  durationSec: number;
}): { segments: CueSegment[]; degraded: boolean } => {
  const hasText = input.segments.some((s) => s.text.trim().length > 0);
  if (!hasText) {
    return { segments: [], degraded: false };
  }

  let degraded = false;
  const out: CueSegment[] = [];

  for (const segment of input.segments) {
    if (!segment.text.trim()) continue;

    if (shouldKeepWhisperSegment(segment)) {
      out.push({
        startSec: round2(segment.startSec),
        endSec: round2(segment.endSec),
        text: segment.text.trim(),
      });
      continue;
    }

    const rebuilt = rebuildFromWords(segment, input.words);
    if (rebuilt && rebuilt.length > 0) {
      out.push(...rebuilt);
      continue;
    }

    degraded = true;
    out.push(
      ...buildSegmentsFromPlainText(
        segment.text,
        Math.max(segment.endSec - segment.startSec, 0.1),
        segment.startSec,
      ),
    );
  }

  const merged = mergeTinyCues(out);
  if (merged.length === 0 && hasText) {
    throw new Error(
      "normalizeCueTiming produced 0 cues from non-empty transcript",
    );
  }

  return { segments: merged, degraded };
};

export const detectCoarseTiming = (input: {
  segments: CueSegment[];
  durationSec: number;
  degraded: boolean;
}): boolean => {
  if (input.degraded) return true;
  if (input.segments.length === 0) return true;
  const durations = input.segments.map((s) =>
    Math.max(s.endSec - s.startSec, 0),
  );
  const sorted = [...durations].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;
  if (median > CUE_COARSE_MEDIAN_SEC) return true;
  const durationSec = Math.max(input.durationSec, 0.1);
  return durations.some((d) => d > durationSec * CUE_COARSE_FRACTION);
};

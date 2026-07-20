export type TimedTextSegment = {
  startSec: number;
  endSec: number;
  text: string;
};

export type SplitSegmentsForTtsOptions = {
  /** Split when text is longer than this (default 80). */
  maxChars?: number;
  /** Split when the timing window is longer than this (default 8s). */
  maxDurationSec?: number;
  /** Silence reserved between split sentences inside a parent window (default 0.22s). */
  pauseSec?: number;
};

const SENTENCE_SPLIT_RE = /(?<=[.!?…。！？;；\n])\s+/;

const splitTextParts = (text: string): string[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const parts = trimmed
    .split(SENTENCE_SPLIT_RE)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [trimmed];
};

const needsSplit = (
  segment: TimedTextSegment,
  maxChars: number,
  maxDurationSec: number,
): boolean => {
  const duration = Math.max(segment.endSec - segment.startSec, 0);
  const chars = segment.text.trim().length;
  const parts = splitTextParts(segment.text);
  return parts.length > 1 && (chars > maxChars || duration > maxDurationSec);
};

/**
 * Expand coarse STT/translate segments into sentence-sized windows so TTS
 * breathes like the source cut — instead of reading one long block per cue.
 *
 * Time is redistributed by character weight inside the parent window, with a
 * short pause reserved between sentences.
 */
export const splitSegmentsForTts = (
  segments: TimedTextSegment[],
  options: SplitSegmentsForTtsOptions = {},
): TimedTextSegment[] => {
  const maxChars = options.maxChars ?? 80;
  const maxDurationSec = options.maxDurationSec ?? 8;
  const pauseSec = options.pauseSec ?? 0.22;

  const out: TimedTextSegment[] = [];

  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;

    if (!needsSplit(segment, maxChars, maxDurationSec)) {
      out.push({
        startSec: segment.startSec,
        endSec: segment.endSec,
        text,
      });
      continue;
    }

    const parts = splitTextParts(text);
    const windowSec = Math.max(segment.endSec - segment.startSec, 0.1);
    const totalPause = pauseSec * Math.max(parts.length - 1, 0);
    const speakBudget = Math.max(windowSec - totalPause, 0.1 * parts.length);
    const totalChars = parts.reduce((sum, part) => sum + part.length, 0) || 1;

    let cursor = segment.startSec;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!;
      const weight = part.length / totalChars;
      const speakSec = Math.max(speakBudget * weight, 0.12);
      const startSec = Math.round(cursor * 100) / 100;
      const endSec = Math.round((cursor + speakSec) * 100) / 100;
      out.push({ startSec, endSec, text: part });
      cursor = endSec + (index < parts.length - 1 ? pauseSec : 0);
    }

    // Keep the last piece inside the parent end bound.
    const last = out[out.length - 1];
    if (last && last.endSec > segment.endSec) {
      last.endSec = segment.endSec;
      if (last.endSec <= last.startSec) {
        last.endSec = Math.round((last.startSec + 0.12) * 100) / 100;
      }
    }
  }

  return out;
};

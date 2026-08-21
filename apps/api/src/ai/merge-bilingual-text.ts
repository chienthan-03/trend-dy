import type {
  RemixTranscriptSegment,
  RemixSegmentRole,
} from "@factory/shared";
import {
  buildSegmentsFromPlainText,
  splitPlainTextPhrases,
} from "./plain-text-segments";

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK_RUN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
const CJK_PUNCTUATION_RE = /[，。！？；：、]+/g;
const LATIN_DIALOGUE_RE = /[A-Za-z]{2,}|\b(?:I|A)\b/i;
const LATIN_TOKEN_RE = /[A-Za-z]+(?:['’][A-Za-z]+)?/g;
/** EN→VI is longer; Piper needs slower pacing than raw English ASR length. */
const ENGLISH_TO_VI_EXPAND = 1.4;
const VI_SPEECH_CHARS_PER_SEC = 11;
const MIN_ENGLISH_CUE_SEC = 0.6;

export type MergeBilingualTextInput = {
  primaryText: string;
  englishText?: string;
  englishPasses?: BilingualEnglishPass[];
  primaryLanguage?: string;
  durationSec: number;
  timeOffsetSec?: number;
};

export type BilingualEnglishPass = {
  text: string;
  timeOffsetSec: number;
  durationSec: number;
};

export type MergeBilingualTextResult = {
  segments: RemixTranscriptSegment[];
  fullText: string;
  language: string;
  addedEnglish: boolean;
};

/**
 * OpenRouter's Qwen ASR response is text-only. Keep this heuristic deliberately
 * conservative: short Latin tokens such as IDs or punctuation should not turn
 * a Chinese narration cue into a character cue.
 */
export const hasLatinDialogueText = (text: string): boolean =>
  LATIN_DIALOGUE_RE.test(text);

const normalizeLatinText = (text: string): string =>
  (text.match(LATIN_TOKEN_RE) ?? []).join(" ").toLowerCase();

const extractEnglishText = (text: string): string =>
  text
    .replace(CJK_RUN_RE, "")
    .replace(CJK_PUNCTUATION_RE, "")
    .replace(/\s+/g, " ")
    .trim();

const isDuplicateEnglish = (
  primaryText: string,
  englishText: string,
): boolean => {
  const primaryLatin = normalizeLatinText(primaryText);
  const englishLatin = normalizeLatinText(englishText);
  if (!primaryLatin || !englishLatin) return false;

  return (
    primaryLatin === englishLatin ||
    primaryLatin.includes(englishLatin) ||
    englishLatin.includes(primaryLatin)
  );
};

const hasRecoverableEnglishText = (text: string): boolean =>
  /[A-Za-z]{3,}(?:['’][A-Za-z]+)?|\b(?:I|A)\b/i.test(text);

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const stripEnglishFromPrimary = (
  primaryText: string,
  englishTexts: string[],
): string => {
  let remaining = primaryText;
  for (const englishText of englishTexts) {
    const latin = extractEnglishText(englishText);
    const tokens = latin.split(/\s+/).filter(Boolean).map(escapeRegExp);
    if (tokens.length === 0) continue;
    remaining = remaining.replace(
      new RegExp(tokens.join("[\\s,.'’?!]*"), "i"),
      " ",
    );
  }
  return remaining.replace(/\s+/g, " ").trim();
};

const estimateEnglishSpeechDurationSec = (
  text: string,
  windowDurationSec: number,
): number => {
  const windowSec = Math.max(windowDurationSec, 0);
  if (windowSec <= 0) return 0;

  const estimatedSec =
    (text.length * ENGLISH_TO_VI_EXPAND) / VI_SPEECH_CHARS_PER_SEC;
  const boundedSec = Math.min(
    windowSec,
    Math.max(estimatedSec, Math.min(MIN_ENGLISH_CUE_SEC, windowSec)),
  );
  return Math.round(boundedSec * 100) / 100;
};

const roleForPrimarySegment = (text: string): RemixSegmentRole =>
  hasLatinDialogueText(text) && !CJK_RE.test(text) ? "source" : "narration";

const withRole = (
  segment: Omit<RemixTranscriptSegment, "role" | "roleSource">,
  role: RemixSegmentRole,
): RemixTranscriptSegment => ({
  ...segment,
  role,
  roleSource: "auto",
});

type TimelineInterval = {
  startSec: number;
  endSec: number;
};

const mergeIntervals = (intervals: TimelineInterval[]): TimelineInterval[] => {
  const sorted = intervals
    .filter((interval) => interval.endSec > interval.startSec)
    .sort((a, b) => a.startSec - b.startSec);
  const merged: TimelineInterval[] = [];

  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.startSec > previous.endSec) {
      merged.push({ ...interval });
      continue;
    }
    previous.endSec = Math.max(previous.endSec, interval.endSec);
  }

  return merged;
};

const subtractIntervals = (
  startSec: number,
  endSec: number,
  blocked: TimelineInterval[],
): TimelineInterval[] => {
  const gaps: TimelineInterval[] = [];
  let cursor = startSec;

  for (const interval of mergeIntervals(blocked)) {
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

const buildSegmentsAcrossIntervals = (
  text: string,
  intervals: TimelineInterval[],
): RemixTranscriptSegment[] => {
  const phrases = splitPlainTextPhrases(text);
  const totalDurationSec = intervals.reduce(
    (sum, interval) => sum + interval.endSec - interval.startSec,
    0,
  );
  const totalChars =
    phrases.reduce((sum, phrase) => sum + phrase.length, 0) || 1;

  if (phrases.length === 0 || totalDurationSec <= 0) return [];

  const usableIntervals = intervals.filter(
    (interval) => interval.endSec > interval.startSec,
  );
  if (usableIntervals.length === 0) return [];

  const phrasesByInterval: string[][] = usableIntervals.map(() => []);
  const charBudgetByInterval = usableIntervals.map(
    (interval) =>
      totalChars * ((interval.endSec - interval.startSec) / totalDurationSec),
  );

  let intervalCursor = 0;
  let usedCharsInInterval = 0;
  for (const phrase of phrases) {
    const remainingBudget =
      charBudgetByInterval[intervalCursor]! - usedCharsInInterval;
    const canAdvance =
      intervalCursor < usableIntervals.length - 1 &&
      usedCharsInInterval > 0 &&
      phrase.length > remainingBudget + 1e-9;
    if (canAdvance) {
      intervalCursor += 1;
      usedCharsInInterval = 0;
    }
    phrasesByInterval[intervalCursor]!.push(phrase);
    usedCharsInInterval += phrase.length;
    while (
      intervalCursor < usableIntervals.length - 1 &&
      usedCharsInInterval >= charBudgetByInterval[intervalCursor]! - 1e-9
    ) {
      intervalCursor += 1;
      usedCharsInInterval = 0;
    }
  }

  return usableIntervals.flatMap((interval, index) => {
    const intervalPhrases = phrasesByInterval[index]!;
    if (intervalPhrases.length === 0) return [];

    const intervalDurationSec = interval.endSec - interval.startSec;
    const intervalChars =
      intervalPhrases.reduce((sum, phrase) => sum + phrase.length, 0) || 1;
    let cursorSec = 0;

    return intervalPhrases.map((phrase, phraseIndex) => {
      const spanSec = intervalDurationSec * (phrase.length / intervalChars);
      const startSec = interval.startSec + cursorSec;
      const endSec =
        phraseIndex === intervalPhrases.length - 1
          ? interval.endSec
          : startSec + spanSec;
      cursorSec += spanSec;
      return withRole(
        {
          startSec: Math.round(startSec * 100) / 100,
          endSec: Math.round(endSec * 100) / 100,
          text: phrase,
        },
        roleForPrimarySegment(phrase),
      );
    });
  });
};

const mergeWindowedBilingualPasses = (
  input: MergeBilingualTextInput & {
    englishPasses: BilingualEnglishPass[];
  },
): MergeBilingualTextResult => {
  const primaryText = input.primaryText.trim();
  const durationSec = Math.max(input.durationSec, 0);
  const timeOffsetSec = Math.max(input.timeOffsetSec ?? 0, 0);
  const timelineEndSec = timeOffsetSec + durationSec;
  const acceptedEnglish: Array<
    BilingualEnglishPass & TimelineInterval
  > = [];
  const seenTexts: string[] = [];

  for (const pass of input.englishPasses) {
    const text = extractEnglishText(pass.text);
    const windowStartSec = Math.max(pass.timeOffsetSec, timeOffsetSec);
    const windowEndSec = Math.min(
      pass.timeOffsetSec + Math.max(pass.durationSec, 0),
      timelineEndSec,
    );
    const windowDurationSec = windowEndSec - windowStartSec;
    const speechDurationSec = estimateEnglishSpeechDurationSec(
      text,
      windowDurationSec,
    );
    const slackSec = Math.max(windowDurationSec - speechDurationSec, 0);
    const startSec = Math.max(
      Math.round(windowStartSec * 100) / 100,
      Math.round((windowStartSec + slackSec / 2) * 100) / 100,
    );
    const endSec = Math.min(
      Math.round(windowEndSec * 100) / 100,
      Math.round((startSec + speechDurationSec) * 100) / 100,
    );

    if (
      !text ||
      !hasRecoverableEnglishText(text) ||
      endSec <= startSec ||
      seenTexts.some((seen) => isDuplicateEnglish(seen, text))
    ) {
      continue;
    }

    acceptedEnglish.push({
      ...pass,
      text,
      durationSec: speechDurationSec,
      timeOffsetSec: startSec,
      startSec,
      endSec,
    });
    seenTexts.push(text);
  }

  const englishText = acceptedEnglish.map((pass) => pass.text).join(" ");
  const hasFullWindowCoverage = acceptedEnglish.some(
    (pass) =>
      pass.startSec <= timeOffsetSec &&
      pass.endSec >= timelineEndSec,
  );
  if (primaryText && hasFullWindowCoverage) {
    return mergeBilingualTextPasses({
      ...input,
      englishText,
      englishPasses: undefined,
    });
  }

  const englishSegments = acceptedEnglish.flatMap((pass) =>
    buildSegmentsFromPlainText(
      pass.text,
      pass.endSec - pass.startSec,
      pass.startSec,
    ).map((segment) => withRole(segment, "source")),
  );
  const strippedPrimary = stripEnglishFromPrimary(
    primaryText,
    acceptedEnglish.map((pass) => pass.text),
  );
  const narrationText =
    strippedPrimary ||
    (CJK_RE.test(primaryText) ? strippedPrimary : primaryText);
  const narrationIntervals = subtractIntervals(
    timeOffsetSec,
    timelineEndSec,
    acceptedEnglish,
  );
  const primarySegments = buildSegmentsAcrossIntervals(
    narrationText,
    narrationIntervals,
  );
  const segments = [...primarySegments, ...englishSegments].sort(
    (left, right) => left.startSec - right.startSec,
  );

  return {
    segments,
    fullText: segments
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join(" ")
      .trim(),
    language: acceptedEnglish.length > 0
      ? "mixed"
      : input.primaryLanguage?.trim() || "unknown",
    addedEnglish: acceptedEnglish.length > 0,
  };
};

/**
 * Merge the text-only auto and English Qwen passes into a single, non-overlapping
 * coarse timeline. Recovered English is centered in each search window so review
 * narration can sit both before and after the clip. This is intentionally marked
 * as coarse by the caller: without provider timestamps, the exact film-dialogue
 * position cannot be known.
 */
export const mergeBilingualTextPasses = (
  input: MergeBilingualTextInput,
): MergeBilingualTextResult => {
  if (input.englishPasses) {
    return mergeWindowedBilingualPasses({
      ...input,
      englishPasses: input.englishPasses,
    });
  }

  const primaryText = input.primaryText.trim();
  const extractedEnglish = extractEnglishText(input.englishText ?? "");
  const englishText =
    extractedEnglish && !isDuplicateEnglish(primaryText, extractedEnglish)
      ? extractedEnglish
      : "";
  const durationSec = Math.max(input.durationSec, 0);
  const timeOffsetSec = Math.max(input.timeOffsetSec ?? 0, 0);
  const primaryChars = primaryText.length;
  const englishChars = englishText.length;
  const totalChars = primaryChars + englishChars;
  const primaryDurationSec =
    totalChars > 0 ? durationSec * (primaryChars / totalChars) : 0;
  const englishDurationSec = Math.max(durationSec - primaryDurationSec, 0);

  const primarySegments = primaryText
    ? buildSegmentsFromPlainText(
        primaryText,
        primaryDurationSec,
        timeOffsetSec,
      ).map((segment) => withRole(segment, roleForPrimarySegment(segment.text)))
    : [];
  const englishSegments = englishText
    ? buildSegmentsFromPlainText(
        englishText,
        englishDurationSec,
        timeOffsetSec + primaryDurationSec,
      ).map((segment) => withRole(segment, "source"))
    : [];
  const segments = [...primarySegments, ...englishSegments];

  return {
    segments,
    fullText: [primaryText, englishText].filter(Boolean).join(" "),
    language: englishText ? "mixed" : input.primaryLanguage?.trim() || "unknown",
    addedEnglish: englishText.length > 0,
  };
};

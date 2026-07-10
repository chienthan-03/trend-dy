const WORDS_PER_SECOND = 2.5;
const MIN_SENTENCE_SECONDS = 3;

export type SrtCue = {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};

const splitSentences = (script: string): string[] =>
  script
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const countWords = (text: string): number =>
  text.split(/\s+/).filter(Boolean).length;

export const sentenceDurationMs = (text: string): number => {
  const words = countWords(text);
  const seconds = Math.max(MIN_SENTENCE_SECONDS, words / WORDS_PER_SECOND);
  return Math.round(seconds * 1000);
};

const formatTimestamp = (ms: number): string => {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
};

export const buildSrtCues = (script: string): SrtCue[] => {
  const sentences = splitSentences(script);
  let cursorMs = 0;

  return sentences.map((text, index) => {
    const startMs = cursorMs;
    const durationMs = sentenceDurationMs(text);
    const endMs = startMs + durationMs;
    cursorMs = endMs;
    return { index: index + 1, startMs, endMs, text };
  });
};

export const formatSrt = (cues: SrtCue[]): string =>
  cues
    .map(
      (cue) =>
        `${cue.index}\n${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}\n${cue.text}`,
    )
    .join("\n\n");

export const voiceScriptToSrt = (script: string): string => {
  const cues = buildSrtCues(script.trim());
  if (cues.length === 0) {
    return "";
  }
  return `${formatSrt(cues)}\n`;
};

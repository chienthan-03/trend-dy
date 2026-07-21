/** Soft cap so plain-text fallback still yields TTS-sized cue windows. */
export const PLAIN_TEXT_MAX_CHARS = 48;

export const splitPlainTextPhrases = (text: string): string[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const bySentence = trimmed
    .split(/(?<=[。！？.!?])\s*|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const seeds = bySentence.length > 0 ? bySentence : [trimmed];
  const phrases: string[] = [];

  for (const seed of seeds) {
    if (seed.length <= PLAIN_TEXT_MAX_CHARS) {
      phrases.push(seed);
      continue;
    }

    // Chinese Whisper often returns space/comma-separated phrases without 。！？
    const byPause = seed
      .split(/(?<=[，、；;,])\s*|\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    const chunks = byPause.length > 1 ? byPause : [seed];
    let buffer = "";

    for (const chunk of chunks) {
      if (!buffer) {
        buffer = chunk;
        continue;
      }
      if (`${buffer}${chunk}`.length <= PLAIN_TEXT_MAX_CHARS) {
        buffer = `${buffer}${/[，、；;,\s]$/.test(buffer) ? "" : " "}${chunk}`.trim();
        continue;
      }
      phrases.push(buffer);
      buffer = chunk;
    }

    if (buffer) phrases.push(buffer);
  }

  // Final hard wrap for unbroken CJK runs.
  return phrases.flatMap((phrase) => {
    if (phrase.length <= PLAIN_TEXT_MAX_CHARS) return [phrase];
    const parts: string[] = [];
    for (let i = 0; i < phrase.length; i += PLAIN_TEXT_MAX_CHARS) {
      parts.push(phrase.slice(i, i + PLAIN_TEXT_MAX_CHARS));
    }
    return parts;
  });
};

export const buildSegmentsFromPlainText = (
  text: string,
  durationSec: number,
  timeOffsetSec = 0,
): Array<{ startSec: number; endSec: number; text: string }> => {
  const sentences = splitPlainTextPhrases(text);
  if (sentences.length === 0) {
    return [];
  }

  const totalChars =
    sentences.reduce((sum, sentence) => sum + sentence.length, 0) || 1;
  let cursor = 0;

  return sentences.map((sentence, index) => {
    const weight = sentence.length / totalChars;
    const span = durationSec * weight;
    const startSec = timeOffsetSec + cursor;
    const endSec =
      index === sentences.length - 1
        ? timeOffsetSec + durationSec
        : timeOffsetSec + cursor + span;
    cursor += span;

    return {
      startSec: Math.round(startSec * 100) / 100,
      endSec: Math.round(endSec * 100) / 100,
      text: sentence,
    };
  });
};

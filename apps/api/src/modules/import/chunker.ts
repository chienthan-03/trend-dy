export type TextChunk = {
  text: string;
  ordinal: number;
  tokenEstimate: number;
};

const MIN_WINDOW = 800;
const MAX_WINDOW = 1200;
const OVERLAP_TOKENS = 100;

export const estimateTokens = (text: string): number => {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (!/\s/.test(trimmed)) {
    return Math.ceil(trimmed.length / 4);
  }

  if (words.length === 0) {
    return Math.ceil(trimmed.length / 4);
  }

  return Math.ceil(words.length * 1.3);
};

const sliceWords = (words: string[], start: number, end: number): string =>
  words.slice(start, end).join(" ");

export const chunkText = (text: string): TextChunk[] => {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  const totalTokens = estimateTokens(trimmed);

  if (totalTokens <= MAX_WINDOW) {
    return [{ text: trimmed, ordinal: 0, tokenEstimate: totalTokens }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let ordinal = 0;

  while (start < words.length) {
    let end = start;

    while (end < words.length) {
      const candidate = sliceWords(words, start, end + 1);
      const tokens = estimateTokens(candidate);

      if (tokens > MAX_WINDOW) {
        break;
      }

      end += 1;

      if (tokens >= MIN_WINDOW) {
        const remaining = sliceWords(words, end, words.length);
        const remainingTokens = estimateTokens(remaining);
        if (remainingTokens === 0 || tokens + remainingTokens > MAX_WINDOW) {
          break;
        }
      }
    }

    if (end === start) {
      end = start + 1;
    }

    const chunkWords = sliceWords(words, start, end);
    const tokenEstimate = estimateTokens(chunkWords);
    chunks.push({ text: chunkWords, ordinal, tokenEstimate });
    ordinal += 1;

    if (end >= words.length) {
      break;
    }

    let overlapStart = end;
    while (overlapStart > start) {
      const overlapTokens = estimateTokens(sliceWords(words, overlapStart - 1, end));
      if (overlapTokens >= OVERLAP_TOKENS - 20) {
        overlapStart -= 1;
        break;
      }
      overlapStart -= 1;
    }

    if (overlapStart <= start) {
      overlapStart = Math.max(start + 1, end - Math.ceil(OVERLAP_TOKENS / 1.3));
    }

    start = overlapStart;
  }

  return chunks;
};

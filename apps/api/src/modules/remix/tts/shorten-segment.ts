import { completeText } from "../../../ai/gateway";

export type ShortenSegmentInput = {
  text: string;
  targetDurationSec: number;
};

export type ShortenSegmentResult = {
  text: string;
  tokensIn?: number;
  tokensOut?: number;
};

const isFakeMode = (): boolean =>
  process.env.REMIX_TTS_MODE?.trim().toLowerCase() === "fake" ||
  process.env.LLM_MODE?.trim().toLowerCase() === "fake";

/** Default `local` — LLM shorten doubles OpenRouter spend on short fine cues. */
const useLocalShorten = (): boolean => {
  if (isFakeMode()) return true;
  const mode = process.env.REMIX_TTS_SHORTEN_MODE?.trim().toLowerCase();
  if (mode === "llm") return false;
  return true;
};

const SHORTEN_SYSTEM_PROMPT =
  "You rewrite a single Vietnamese voiceover line so it can be spoken in less time. " +
  "Preserve the core meaning and tone. Return ONLY the rewritten line — no quotes, " +
  "no explanation, no markdown.";

const buildShortenPrompt = (text: string, targetDurationSec: number): string =>
  `Original line: "${text}"\nTarget spoken duration: ~${targetDurationSec.toFixed(1)}s\n` +
  "Rewrite this line so it is noticeably shorter while keeping its core meaning.";

/**
 * Dependency-free shortening used under REMIX_TTS_MODE=fake / LLM_MODE=fake so
 * CI never needs network access. Keeps the first ~60% of words (min 3, or the
 * single word if the line is already tiny) — short enough that a re-run of
 * `planSegmentFit` on the shorter text's estimated TTS duration reliably fits.
 */
const shortenTextLocally = (text: string): string => {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return text;
  }
  if (words.length <= 3) {
    return words.slice(0, Math.max(1, words.length - 1)).join(" ");
  }

  const keep = Math.max(3, Math.ceil(words.length * 0.6));
  return words.slice(0, keep).join(" ");
};

/**
 * Ask the LLM to rewrite a segment's voiceover line to a shorter form so it
 * fits its allotted window without exceeding the TTS max-speed cap. Used once
 * per segment by `RemixProcessor.handleTts` when `planSegmentFit` returns
 * action "shorten" for the original text.
 */
export const shortenSegmentText = async (
  input: ShortenSegmentInput,
): Promise<ShortenSegmentResult> => {
  const trimmed = input.text.trim();
  if (!trimmed) {
    return { text: trimmed };
  }

  if (useLocalShorten()) {
    return { text: shortenTextLocally(trimmed) };
  }

  const prompt = buildShortenPrompt(trimmed, input.targetDurationSec);
  const result = await completeText(prompt, {
    type: "remix_shorten_segment",
    system: SHORTEN_SYSTEM_PROMPT,
  });

  const shortened = result.text.trim().replace(/^["']|["']$/g, "");
  return {
    text: shortened || shortenTextLocally(trimmed),
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  };
};

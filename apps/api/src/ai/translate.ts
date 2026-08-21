import { createHash } from "node:crypto";
import { translate as googleTranslate } from "google-translate-api-x";
import type { RemixTranscriptV1 } from "@factory/shared";
import { completeJson } from "./gateway";
import {
  buildTranslateTranscriptPrompt,
  TRANSLATE_TRANSCRIPT_SYSTEM,
  translateTranscriptResponseSchema,
} from "./prompts/translate.transcript.v1";
import {
  getGoogleTranslateApiKey,
  getGoogleTranslateSourceLang,
  getHfApiToken,
  getTranslateApiBaseUrl,
  getTranslateBatchDelayMs,
  getTranslateLlmBatchSize,
  getTranslateMaxChars,
  getTranslateMaxRetries,
  getTranslateModel,
  getTranslateProvider,
  resolveTranslateMode,
} from "../modules/remix/translate-config";

export type TranslateTranscriptResult = {
  transcript: RemixTranscriptV1;
  tokensIn?: number;
  tokensOut?: number;
};

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

const FAKE_VI_LINES = [
  "Anh chàng bước vào quán rượu trong cơn mưa.",
  "Hắn hỏi thông tin về tên truy nã.",
  "Cuộc đối đầu bắt đầu leo thang.",
  "Joe và Indio đối đầu trong căn phòng.",
  "Một phát súng quyết định số phận.",
  "Kẻ thù cuối cùng cũng lộ diện.",
  "Bí mật về kho báu được hé lộ.",
  "Họ phải hợp tác để sống sót.",
  "Kết cục đầy kịch tính và bất ngờ.",
  "Câu chuyện khép lại trong im lặng.",
] as const;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const withTranslateLlmModel = async <T>(fn: () => Promise<T>): Promise<T> => {
  const translateModel = process.env.REMIX_TRANSLATE_LLM_MODEL?.trim();
  if (!translateModel) {
    return fn();
  }

  const previousModel = process.env.LLM_MODEL;
  process.env.LLM_MODEL = translateModel;
  try {
    return await fn();
  } finally {
    if (previousModel !== undefined) {
      process.env.LLM_MODEL = previousModel;
    } else {
      delete process.env.LLM_MODEL;
    }
  }
};

export const hasChineseScript = (text: string): boolean => CJK_RE.test(text);

/** Keep CJK only so punctuation/spacing differences do not hide STT duplicates. */
export const normalizeChineseForCompare = (text: string): string =>
  (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) ?? []).join("");

/**
 * True when `candidate` Chinese is the same (or mostly overlapping) content as
 * another source segment that already has a clean Vietnamese translation.
 */
export const isDuplicateChineseSource = (
  candidate: string,
  translatedSources: string[],
): boolean => {
  const norm = normalizeChineseForCompare(candidate);
  if (norm.length < 4) return false;

  for (const other of translatedSources) {
    const otherNorm = normalizeChineseForCompare(other);
    if (otherNorm.length < 4) continue;

    if (norm === otherNorm) return true;

    const shorter = norm.length <= otherNorm.length ? norm : otherNorm;
    const longer = norm.length <= otherNorm.length ? otherNorm : norm;
    if (shorter.length >= 6 && longer.includes(shorter)) return true;

    const shared = countSharedChars(norm, otherNorm);
    const overlap = shared / Math.max(norm.length, otherNorm.length);
    if (overlap >= 0.85) return true;
  }

  return false;
};

const countSharedChars = (a: string, b: string): number => {
  const bag = new Map<string, number>();
  for (const ch of a) {
    bag.set(ch, (bag.get(ch) ?? 0) + 1);
  }

  let shared = 0;
  for (const ch of b) {
    const count = bag.get(ch) ?? 0;
    if (count <= 0) continue;
    shared += 1;
    bag.set(ch, count - 1);
  }
  return shared;
};

/** Drop CJK runs that merely echo the source (LLM mixed VI + leftover ZH). */
export const stripEchoedChinese = (translated: string, sourceText: string): string => {
  if (!hasChineseScript(translated)) return translated.trim();

  const sourceNorm = normalizeChineseForCompare(sourceText);
  if (!sourceNorm) return translated.trim();

  const stripped = translated
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+/g, (run) => {
      const runNorm = normalizeChineseForCompare(run);
      if (runNorm.length >= 2 && sourceNorm.includes(runNorm)) {
        return "";
      }
      return run;
    })
    .replace(/\s+/g, " ")
    .trim();

  return stripped;
};

export const splitTextForTranslation = (
  text: string,
  maxChars: number,
): string[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const parts = trimmed.split(/(?<=[。！？.!?；;，,])\s*/u).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) {
      chunks.push(current.trim());
      current = "";
    }
  };

  for (const part of parts) {
    if (part.length > maxChars) {
      flush();
      for (let i = 0; i < part.length; i += maxChars) {
        chunks.push(part.slice(i, i + maxChars).trim());
      }
      continue;
    }

    const next = current ? `${current} ${part}` : part;
    if (next.length > maxChars) {
      flush();
      current = part;
    } else {
      current = next;
    }
  }

  flush();
  return chunks.length > 0 ? chunks : [trimmed.slice(0, maxChars)];
};

const fakeTranslateText = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const hash = createHash("sha256").update(trimmed).digest();
  const index = hash[0]! % FAKE_VI_LINES.length;
  return `[VI] ${FAKE_VI_LINES[index]} (${trimmed.slice(0, 24)}…)`;
};

const chunkSegments = <T>(items: T[], batchSize: number): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
};

const parseHfTranslationResponse = (payload: unknown): string => {
  if (typeof payload === "string") {
    return payload.trim();
  }

  if (Array.isArray(payload)) {
    const first = payload[0];
    if (typeof first === "string") {
      return first.trim();
    }
    if (first && typeof first === "object" && "translation_text" in first) {
      const text = (first as { translation_text?: unknown }).translation_text;
      if (typeof text === "string") {
        return text.trim();
      }
    }
  }

  if (payload && typeof payload === "object" && "translation_text" in payload) {
    const text = (payload as { translation_text?: unknown }).translation_text;
    if (typeof text === "string") {
      return text.trim();
    }
  }

  if (payload && typeof payload === "object" && "generated_text" in payload) {
    const text = (payload as { generated_text?: unknown }).generated_text;
    if (typeof text === "string") {
      return text.trim();
    }
  }

  throw new Error("Unexpected HuggingFace translation response shape");
};

const translateWithHuggingFace = async (text: string): Promise<string> => {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const token = getHfApiToken();
  if (!token) {
    throw new Error("HF_API_TOKEN is required when REMIX_TRANSLATE_PROVIDER=huggingface");
  }

  const model = getTranslateModel();
  const baseUrl = getTranslateApiBaseUrl();
  const maxRetries = getTranslateMaxRetries();

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/models/${model}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: trimmed }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Translation network request failed (${baseUrl}/models/${model}): ${message}`,
      );
    }

    if (response.status === 429 || response.status === 503) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      const backoffMs = retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
      if (attempt < maxRetries - 1) {
        await sleep(backoffMs);
        continue;
      }
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Translation request failed (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as unknown;
    return parseHfTranslationResponse(payload);
  }

  throw new Error("Translation request failed after retries");
};

const translateWithGoogleCloud = async (text: string): Promise<string> => {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const apiKey = getGoogleTranslateApiKey();
  if (!apiKey) {
    throw new Error("GOOGLE_TRANSLATE_API_KEY is required for Google Cloud translation");
  }

  const sourceLang = getGoogleTranslateSourceLang();
  const url = new URL("https://translation.googleapis.com/language/translate/v2");
  url.searchParams.set("key", apiKey);

  const body: Record<string, unknown> = {
    q: trimmed,
    target: "vi",
    format: "text",
  };

  if (sourceLang !== "auto") {
    body.source = sourceLang;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Cloud translation failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    data?: { translations?: Array<{ translatedText?: string }> };
  };

  const translated = payload.data?.translations?.[0]?.translatedText?.trim();
  if (!translated) {
    throw new Error("Google Cloud translation returned empty text");
  }

  return translated;
};

const translateWithGoogleWeb = async (text: string): Promise<string> => {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const sourceLang = getGoogleTranslateSourceLang();
  const result = await googleTranslate(trimmed, {
    from: sourceLang,
    to: "vi",
    forceBatch: true,
    rejectOnPartialFail: true,
  });

  return result.text.trim();
};

const translateChunkWithGoogle = async (text: string): Promise<string> => {
  if (getGoogleTranslateApiKey()) {
    return translateWithGoogleCloud(text);
  }

  return translateWithGoogleWeb(text);
};

const translateChunkWithHuggingFace = async (text: string): Promise<string> => {
  if (!hasChineseScript(text)) {
    return text;
  }

  const maxChars = getTranslateMaxChars();
  const chunks = splitTextForTranslation(text, maxChars);
  const translatedChunks: string[] = [];

  for (const chunk of chunks) {
    try {
      const translated = await translateWithHuggingFace(chunk);
      translatedChunks.push(translated || chunk);
    } catch {
      translatedChunks.push(chunk);
    }
  }

  return translatedChunks.join(" ").trim();
};

const translateSegmentText = async (text: string): Promise<string> => {
  const trimmed = text.trim();
  if (!trimmed) return "";

  if (resolveTranslateMode() === "fake") {
    return fakeTranslateText(trimmed);
  }

  const provider = getTranslateProvider();
  const maxChars = getTranslateMaxChars();
  const chunks = splitTextForTranslation(trimmed, maxChars);
  const translatedChunks: string[] = [];

  for (const chunk of chunks) {
    let translated = "";
    for (let attempt = 0; attempt <= MAX_RESIDUAL_CHINESE_RETRIES; attempt += 1) {
      try {
        translated =
          provider === "google"
            ? await translateChunkWithGoogle(chunk)
            : await translateChunkWithHuggingFace(chunk);
      } catch {
        translated = "";
      }

      if (translated && !hasChineseScript(translated)) {
        break;
      }

      if (attempt < MAX_RESIDUAL_CHINESE_RETRIES && hasChineseScript(chunk)) {
        continue;
      }
    }

    if (!translated || (hasChineseScript(chunk) && hasChineseScript(translated))) {
      throw new Error(
        `Translation still contains Chinese after retries (${chunk.slice(0, 48)}…)`,
      );
    }

    translatedChunks.push(translated);
  }

  return translatedChunks.join(" ").trim();
};

const MAX_RESIDUAL_CHINESE_RETRIES = 2;

const translateLlmBatch = async (input: {
  sourceLanguage: string;
  indexedBatch: Array<{
    index: number;
    startSec: number;
    endSec: number;
    text: string;
  }>;
  contextBefore: string;
}): Promise<{
  translations: Map<number, string>;
  tokensIn: number;
  tokensOut: number;
}> => {
  const prompt = buildTranslateTranscriptPrompt({
    sourceLanguage: input.sourceLanguage,
    segments: input.indexedBatch,
    contextBefore: input.contextBefore,
  });

  const llm = await withTranslateLlmModel(() =>
    completeJson(prompt, translateTranscriptResponseSchema, {
      system: TRANSLATE_TRANSCRIPT_SYSTEM,
      type: "remix_translate",
    }),
  );

  const translations = new Map<number, string>();
  for (const segment of llm.data.segments) {
    const text = segment.text.trim();
    if (!text) continue;
    translations.set(segment.index, text);
  }

  return {
    translations,
    tokensIn: llm.tokensIn,
    tokensOut: llm.tokensOut,
  };
};

const isCleanVietnamese = (text: string | undefined): boolean => {
  const trimmed = text?.trim();
  return Boolean(trimmed && !hasChineseScript(trimmed));
};

const collectCleanTranslatedSources = (
  source: RemixTranscriptV1,
  translatedByIndex: Map<number, string>,
  excludeIndex?: number,
): string[] => {
  const sources: string[] = [];

  for (let index = 0; index < source.segments.length; index += 1) {
    if (index === excludeIndex) continue;
    if (!isCleanVietnamese(translatedByIndex.get(index))) continue;
    sources.push(source.segments[index]!.text);
  }

  return sources;
};

type ResidualDecision = {
  index: number;
  kind: "duplicate" | "needs_translate";
};

const classifyResidualChinese = (
  source: RemixTranscriptV1,
  translatedByIndex: Map<number, string>,
): ResidualDecision[] => {
  const decisions: ResidualDecision[] = [];

  for (let index = 0; index < source.segments.length; index += 1) {
    const sourceText = source.segments[index]!.text;
    if (!hasChineseScript(sourceText)) continue;

    const rawTranslated = translatedByIndex.get(index);
    const stripped = rawTranslated
      ? stripEchoedChinese(rawTranslated, sourceText)
      : "";

    if (stripped !== (rawTranslated?.trim() ?? "")) {
      translatedByIndex.set(index, stripped);
    }

    if (isCleanVietnamese(translatedByIndex.get(index))) continue;

    const alreadyTranslatedSources = collectCleanTranslatedSources(
      source,
      translatedByIndex,
      index,
    );

    if (isDuplicateChineseSource(sourceText, alreadyTranslatedSources)) {
      decisions.push({ index, kind: "duplicate" });
      continue;
    }

    decisions.push({ index, kind: "needs_translate" });
  }

  return decisions;
};

const translateWithLlm = async (
  source: RemixTranscriptV1,
): Promise<{ segments: RemixTranscriptV1["segments"]; tokensIn: number; tokensOut: number }> => {
  const batchSize = getTranslateLlmBatchSize();
  const batches = chunkSegments(source.segments, batchSize);
  const translatedByIndex = new Map<number, string>();
  let tokensIn = 0;
  let tokensOut = 0;
  let contextBefore = "";

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex]!;
    const startIndex = batchIndex * batchSize;
    const indexedBatch = batch.map((segment, offset) => ({
      index: startIndex + offset,
      startSec: segment.startSec,
      endSec: segment.endSec,
      text: segment.text,
    }));

    const result = await translateLlmBatch({
      sourceLanguage: source.language,
      indexedBatch,
      contextBefore,
    });

    tokensIn += result.tokensIn;
    tokensOut += result.tokensOut;

    for (const [index, text] of result.translations) {
      const sourceText = source.segments[index]?.text ?? "";
      translatedByIndex.set(index, stripEchoedChinese(text, sourceText));
    }

    contextBefore = indexedBatch
      .map((segment) => translatedByIndex.get(segment.index) || segment.text)
      .filter(Boolean)
      .slice(-2)
      .join(" ");
  }

  for (let attempt = 0; attempt < MAX_RESIDUAL_CHINESE_RETRIES; attempt += 1) {
    const residual = classifyResidualChinese(source, translatedByIndex);

    for (const decision of residual) {
      if (decision.kind === "duplicate") {
        translatedByIndex.set(decision.index, "");
      }
    }

    const toTranslate = residual.filter((item) => item.kind === "needs_translate");
    if (toTranslate.length === 0) break;

    // Retry unique leftovers one-by-one so a truncated batch cannot drop middle segments again.
    for (const { index } of toTranslate) {
      const segment = source.segments[index]!;
      const prevTranslated = translatedByIndex.get(index - 1);
      const nextTranslated = translatedByIndex.get(index + 1);
      const retryContext = [prevTranslated, nextTranslated].filter(Boolean).join(" ");

      const result = await translateLlmBatch({
        sourceLanguage: source.language,
        indexedBatch: [
          {
            index,
            startSec: segment.startSec,
            endSec: segment.endSec,
            text: segment.text,
          },
        ],
        contextBefore: retryContext,
      });

      tokensIn += result.tokensIn;
      tokensOut += result.tokensOut;

      const retried = result.translations.get(index)?.trim();
      if (!retried) continue;

      const cleaned = stripEchoedChinese(retried, segment.text);
      if (cleaned && !hasChineseScript(cleaned)) {
        translatedByIndex.set(index, cleaned);
      }
    }
  }

  const residualAfterRetry = classifyResidualChinese(source, translatedByIndex);
  for (const decision of residualAfterRetry) {
    if (decision.kind === "duplicate") {
      translatedByIndex.set(decision.index, "");
    }
  }

  const stillUniqueChinese = residualAfterRetry
    .filter((item) => item.kind === "needs_translate")
    .map((item) => item.index);

  if (stillUniqueChinese.length > 0) {
    throw new Error(
      `Translation still contains Chinese in ${stillUniqueChinese.length} segment(s): indexes ${stillUniqueChinese.slice(0, 12).join(", ")}${stillUniqueChinese.length > 12 ? ", …" : ""}`,
    );
  }

  const segments = source.segments.map((segment, index) => {
    if (translatedByIndex.has(index)) {
      return {
        startSec: segment.startSec,
        endSec: segment.endSec,
        text: translatedByIndex.get(index)!.trim(),
      };
    }

    return {
      startSec: segment.startSec,
      endSec: segment.endSec,
      // Unique Chinese without a translation should have thrown above.
      text: hasChineseScript(segment.text) ? "" : segment.text,
    };
  });

  return { segments, tokensIn, tokensOut };
};

const translateWithMachineProviders = async (
  source: RemixTranscriptV1,
): Promise<RemixTranscriptV1["segments"]> => {
  const delayMs = getTranslateBatchDelayMs();
  const segments: RemixTranscriptV1["segments"] = [];

  for (let i = 0; i < source.segments.length; i += 1) {
    const segment = source.segments[i]!;
    const translatedText = await translateSegmentText(segment.text);
    segments.push({
      startSec: segment.startSec,
      endSec: segment.endSec,
      text: translatedText,
    });

    if (delayMs > 0 && i < source.segments.length - 1) {
      await sleep(delayMs);
    }
  }

  return segments;
};

const getResultProvider = (): string => {
  if (resolveTranslateMode() === "fake") {
    return "fake";
  }

  const provider = getTranslateProvider();
  if (provider === "llm") {
    return "llm";
  }
  if (provider === "google") {
    return getGoogleTranslateApiKey() ? "google-cloud" : "google";
  }

  return "huggingface";
};

export const translateTranscript = async (
  source: RemixTranscriptV1,
): Promise<TranslateTranscriptResult> => {
  const model = getTranslateModel();
  const joinFullText = (segments: RemixTranscriptV1["segments"]): string =>
    segments
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join(" ")
      .trim();

  /** Hard-fail on count mismatch; always copy start/end from source (1:1 cues). */
  const lockTiming = (
    segments: RemixTranscriptV1["segments"],
  ): RemixTranscriptV1["segments"] => {
    if (segments.length !== source.segments.length) {
      throw new Error(
        `Translate segment count mismatch: source=${source.segments.length} translated=${segments.length}`,
      );
    }
    return source.segments.map((sourceSeg, index) => {
      const translatedSeg = { ...segments[index]! };
      if (sourceSeg.role == null) {
        delete translatedSeg.role;
        delete translatedSeg.roleSource;
      } else {
        translatedSeg.role = sourceSeg.role;
        if (sourceSeg.roleSource) {
          translatedSeg.roleSource = sourceSeg.roleSource;
        } else {
          delete translatedSeg.roleSource;
        }
      }

      return {
        ...translatedSeg,
        startSec: sourceSeg.startSec,
        endSec: sourceSeg.endSec,
      };
    });
  };

  if (resolveTranslateMode() === "fake") {
    const segments = lockTiming(await translateWithMachineProviders(source));
    const fullText = joinFullText(segments);

    return {
      transcript: {
        version: 1,
        language: "vi",
        durationSec: source.durationSec,
        segments,
        fullText,
        provider: "fake",
        model,
      },
    };
  }

  if (getTranslateProvider() === "llm") {
    const { segments: rawSegments, tokensIn, tokensOut } =
      await translateWithLlm(source);
    const segments = lockTiming(rawSegments);
    const fullText = joinFullText(segments);

    return {
      transcript: {
        version: 1,
        language: "vi",
        durationSec: source.durationSec,
        segments,
        fullText,
        provider: getResultProvider(),
        model,
      },
      tokensIn,
      tokensOut,
    };
  }

  const segments = lockTiming(await translateWithMachineProviders(source));
  const fullText = joinFullText(segments);

  return {
    transcript: {
      version: 1,
      language: "vi",
      durationSec: source.durationSec,
      segments,
      fullText,
      provider: getResultProvider(),
      model,
    },
  };
};

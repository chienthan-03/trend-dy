import type { RemixTranscriptV1 } from "@factory/shared";
import { estimateSttCostUsd } from "../../ai/stt";
import { estimateLlmCostUsd } from "../usage/cost";
import {
  getTtsBatchMaxChars,
  getTtsBatchMaxDurationSec,
  getTtsBatchMode,
  batchCuesForTts,
} from "./tts/batch-cues-for-tts";
import {
  getPiperModelStem,
  getRemixLlmModel,
  getSttCostPerMinuteUsd,
  getSttModel,
  isBilingualSttEnabled,
  getTtsCostPer1kCharsUsd,
  getTtsMode,
  getTtsModel,
  resolveTtsEngine,
} from "./remix-config";
import {
  getTranslateLlmBatchSize,
  getTranslateModel,
  getTranslateProvider,
  resolveTranslateMode,
} from "./translate-config";
import { resolveLlmCostRates } from "../usage/cost";

export type RemixCostActionId =
  | "retranscribe"
  | "retranslate"
  | "tts"
  | "classify"
  | "banners"
  | "render";

export type RemixActionCostEstimate = {
  action: RemixCostActionId;
  label: string;
  /** null when inputs are missing (e.g. no VI text yet for TTS). */
  estimatedUsd: number | null;
  available: boolean;
  detail: string;
  batchCount?: number;
  charCount?: number;
  durationSec?: number;
};

export type RemixCostEstimate = {
  remakeId: string;
  currency: "USD";
  disclaimer: string;
  rates: {
    sttPerMinuteUsd: number;
    sttModel: string;
    ttsPer1kCharsUsd: number;
    ttsModel: string;
    ttsBatchMode: "batch" | "per_cue";
    translateMode: string;
    translateModel: string;
    remixLlmModel: string;
  };
  actions: RemixActionCostEstimate[];
  lastTtsCostUsd: number | null;
  /** Env default collapsed for UI display — `fake` is never shown, it reads as Piper (local, $0). */
  defaultTtsEngine: "piper" | "live";
  /** Engine that would actually run right now (override > persisted remake > env default), display-safe. */
  resolvedEngine: "piper" | "live";
};

const roundUsd = (value: number): number =>
  Math.round(value * 10_000) / 10_000;

const transcriptCharCount = (
  transcript: RemixTranscriptV1 | null | undefined,
): number => {
  if (!transcript) return 0;
  if (transcript.fullText?.trim()) return transcript.fullText.trim().length;
  return transcript.segments.reduce(
    (sum, segment) => sum + segment.text.trim().length,
    0,
  );
};

/** Rough token estimate for CJK-heavy source (chars ≈ tokens for Chinese). */
const estimateTranslateTokens = (
  sourceChars: number,
  segmentCount: number,
  batchSize: number,
) => {
  const batchCount = Math.max(1, Math.ceil(segmentCount / batchSize));
  const charsPerBatch = sourceChars / batchCount;
  const tokensInPerBatch = Math.max(
    1,
    Math.ceil(charsPerBatch * 1.1 + 900),
  );
  const tokensIn = tokensInPerBatch * batchCount;
  const tokensOut = Math.max(1, Math.ceil(sourceChars * 1.4));
  return { tokensIn, tokensOut, batchCount };
};

const estimateClassifyTokens = (segmentCount: number) => {
  const tokensIn = Math.max(200, segmentCount * 40);
  const tokensOut = Math.max(80, segmentCount * 8);
  return { tokensIn, tokensOut };
};

const isLiveStt = (): boolean =>
  process.env.REMIX_STT_MODE?.trim().toLowerCase() === "live";

const isLiveLlm = (): boolean =>
  process.env.LLM_MODE?.trim().toLowerCase() === "live";

export const buildRemixCostEstimate = (input: {
  remakeId: string;
  videoDurationSec: number | null;
  sourceTranscript: RemixTranscriptV1 | null;
  translatedTranscript: RemixTranscriptV1 | null;
  lastTtsCostUsd?: number | null;
  /** Persisted engine on the remake (`remake.ttsEngine`), if any. */
  ttsEngine?: string | null;
  /** Query/body override so the UI can preview cost before persisting (Task 9). */
  ttsEngineOverride?: string | null;
}): RemixCostEstimate => {
  const ttsMode = getTtsMode();
  const resolvedEngine = resolveTtsEngine({
    payloadEngine: input.ttsEngineOverride ?? null,
    remakeEngine: input.ttsEngine ?? null,
  });
  // `fake` is env/CI-only and never a real user choice — display it as Piper
  // (free, local) so the UI never shows an engine the user didn't pick.
  const defaultTtsEngine: "piper" | "live" = ttsMode === "live" ? "live" : "piper";
  const resolvedEngineForDisplay: "piper" | "live" =
    resolvedEngine === "live" ? "live" : "piper";
  const isPiperResolved = resolvedEngine === "piper";
  // Cost follows the engine the job will actually run (payload/remake override
  // wins over env). Do not require REMIX_TTS_MODE=live — UI can select Live
  // while env default remains fake/piper.
  const isLiveResolved = resolvedEngine === "live";

  const durationSec =
    input.videoDurationSec ??
    input.sourceTranscript?.durationSec ??
    input.translatedTranscript?.durationSec ??
    null;

  const sourceChars = transcriptCharCount(input.sourceTranscript);
  const viChars = transcriptCharCount(input.translatedTranscript);
  const sourceSegmentCount = input.sourceTranscript?.segments.length ?? 0;
  const translateMode = resolveTranslateMode();
  const translateModel = getTranslateModel();
  const remixLlmModel = getRemixLlmModel();
  const translateBatchSize = getTranslateLlmBatchSize();
  const ttsBatchMode = getTtsBatchMode();

  // --- STT / retranscribe ---
  let retranscribe: RemixActionCostEstimate;
  if (durationSec == null || durationSec <= 0) {
    retranscribe = {
      action: "retranscribe",
      label: "Transcribe lại (STT)",
      estimatedUsd: null,
      available: false,
      detail: "Chưa có thời lượng video để ước lượng",
    };
  } else if (!isLiveStt()) {
    retranscribe = {
      action: "retranscribe",
      label: "Transcribe lại (STT)",
      estimatedUsd: 0,
      available: true,
      durationSec,
      detail: `REMIX_STT_MODE≠live — $0 · ~${Math.round(durationSec)}s`,
    };
  } else {
    const sttPassCount = isBilingualSttEnabled() ? 2 : 1;
    const usd = roundUsd(estimateSttCostUsd(durationSec) * sttPassCount);
    retranscribe = {
      action: "retranscribe",
      label: "Transcribe lại (STT)",
      estimatedUsd: usd,
      available: true,
      durationSec,
      detail: `${getSttModel()} · ${sttPassCount} pass${sttPassCount > 1 ? "es" : ""} · ~${Math.round(durationSec)}s · $${getSttCostPerMinuteUsd().toFixed(4)}/phút/pass`,
    };
  }

  // --- Translate ---
  let retranslate: RemixActionCostEstimate;
  if (!input.sourceTranscript || sourceChars === 0) {
    retranslate = {
      action: "retranslate",
      label: "Dịch transcript",
      estimatedUsd: null,
      available: false,
      detail: "Chưa có transcript gốc",
    };
  } else if (translateMode === "fake") {
    retranslate = {
      action: "retranslate",
      label: "Dịch transcript",
      estimatedUsd: 0,
      available: true,
      charCount: sourceChars,
      detail: "Translate mode=fake — $0",
    };
  } else if (getTranslateProvider() === "google") {
    retranslate = {
      action: "retranslate",
      label: "Dịch transcript",
      estimatedUsd: 0,
      available: true,
      charCount: sourceChars,
      detail: `Google Translate · ${sourceChars.toLocaleString()} ký tự (ước $0)`,
    };
  } else if (getTranslateProvider() === "huggingface") {
    retranslate = {
      action: "retranslate",
      label: "Dịch transcript",
      estimatedUsd: 0,
      available: true,
      charCount: sourceChars,
      detail: `HuggingFace · ${sourceChars.toLocaleString()} ký tự (ước $0 nếu free tier)`,
    };
  } else {
    const { tokensIn, tokensOut, batchCount } = estimateTranslateTokens(
      sourceChars,
      sourceSegmentCount,
      translateBatchSize,
    );
    const usd = roundUsd(
      estimateLlmCostUsd(tokensIn, tokensOut, translateModel),
    );
    const translateRates = resolveLlmCostRates(translateModel);
    retranslate = {
      action: "retranslate",
      label: "Dịch transcript",
      estimatedUsd: usd,
      available: true,
      charCount: sourceChars,
      detail: `${translateModel} · ${batchCount} batch × ${translateBatchSize} cue · ~${tokensIn + tokensOut} tokens · $${translateRates.inputPer1kUsd}/1k in`,
    };
  }

  // --- TTS ---
  let tts: RemixActionCostEstimate;
  if (!input.translatedTranscript || viChars === 0) {
    tts = {
      action: "tts",
      label: "Tạo audio VI (TTS)",
      estimatedUsd: null,
      available: false,
      detail: "Cần bản dịch VI trước",
    };
  } else if (isPiperResolved) {
    tts = {
      action: "tts",
      label: "Tạo audio VI (TTS)",
      estimatedUsd: 0,
      available: true,
      charCount: viChars,
      detail: `Piper local · ${getPiperModelStem()} · $0`,
    };
  } else if (!isLiveResolved) {
    tts = {
      action: "tts",
      label: "Tạo audio VI (TTS)",
      estimatedUsd: 0,
      available: true,
      charCount: viChars,
      detail: "REMIX_TTS_MODE≠live — $0",
    };
  } else {
    const cues = input.translatedTranscript.segments.map((segment, index) => ({
      index,
      text: segment.text,
      startSec: segment.startSec,
      endSec: segment.endSec,
    }));
    const batches =
      ttsBatchMode === "per_cue"
        ? cues
            .filter((cue) => cue.text.trim())
            .map((cue) => ({ text: cue.text.trim(), cues: [cue] }))
        : batchCuesForTts(cues);
    const billedChars = batches.reduce((sum, batch) => sum + batch.text.length, 0);
    const usd = roundUsd(
      (billedChars / 1000) * getTtsCostPer1kCharsUsd(),
    );
    tts = {
      action: "tts",
      label: "Tạo audio VI (TTS)",
      estimatedUsd: usd,
      available: true,
      charCount: billedChars,
      batchCount: batches.length,
      detail: `${getTtsModel()} · ${batches.length} batch · ${billedChars.toLocaleString()} ký tự · $${getTtsCostPer1kCharsUsd()}/1k (cache hit = $0)`,
    };
  }

  // --- Classify ---
  const segmentCount = input.translatedTranscript?.segments.length ?? 0;
  let classify: RemixActionCostEstimate;
  if (!input.sourceTranscript || !input.translatedTranscript) {
    classify = {
      action: "classify",
      label: "Phân loại lại",
      estimatedUsd: null,
      available: false,
      detail: "Cần cả transcript gốc + VI",
    };
  } else if (!isLiveLlm()) {
    classify = {
      action: "classify",
      label: "Phân loại lại",
      estimatedUsd: 0,
      available: true,
      detail: "LLM_MODE≠live — phân loại local $0",
    };
  } else {
    const { tokensIn, tokensOut } = estimateClassifyTokens(segmentCount);
    classify = {
      action: "classify",
      label: "Phân loại lại",
      estimatedUsd: roundUsd(
        estimateLlmCostUsd(tokensIn, tokensOut, remixLlmModel),
      ),
      available: true,
      detail: `${remixLlmModel} · ${segmentCount} cue`,
    };
  }

  // --- Banners ---
  const banners: RemixActionCostEstimate = !isLiveLlm()
    ? {
        action: "banners",
        label: "Tạo nội dung banner (AI)",
        estimatedUsd: 0,
        available: true,
        detail: "LLM_MODE≠live — $0",
      }
    : {
        action: "banners",
        label: "Tạo nội dung banner (AI)",
        estimatedUsd: roundUsd(
          estimateLlmCostUsd(600, 200, remixLlmModel),
        ),
        available: true,
        detail: `${remixLlmModel} · 1 lần LLM ngắn`,
      };

  const render: RemixActionCostEstimate = {
    action: "render",
    label: "Render preview",
    estimatedUsd: 0,
    available: true,
    detail: "FFmpeg local — không tốn OpenRouter",
  };

  return {
    remakeId: input.remakeId,
    currency: "USD",
    disclaimer:
      "Ước lượng theo model + rate OpenRouter (.env). TTS cache hit không tính lại; token thực tế có thể lệch ±20%.",
    rates: {
      sttPerMinuteUsd: getSttCostPerMinuteUsd(),
      sttModel: getSttModel(),
      ttsPer1kCharsUsd: getTtsCostPer1kCharsUsd(),
      ttsModel: getTtsModel(),
      ttsBatchMode,
      translateMode,
      translateModel,
      remixLlmModel,
    },
    actions: [retranscribe, retranslate, tts, classify, banners, render],
    lastTtsCostUsd:
      input.lastTtsCostUsd != null && Number.isFinite(input.lastTtsCostUsd)
        ? input.lastTtsCostUsd
        : null,
    defaultTtsEngine,
    resolvedEngine: resolvedEngineForDisplay,
  };
};

/** Expose batch knobs in detail strings without importing env elsewhere. */
export const getTtsBatchEstimateMeta = (): {
  maxDurationSec: number;
  maxChars: number;
  mode: "batch" | "per_cue";
} => ({
  maxDurationSec: getTtsBatchMaxDurationSec(),
  maxChars: getTtsBatchMaxChars(),
  mode: getTtsBatchMode(),
});

import { createHash } from "node:crypto";
import type {
  RemixTranscriptSegment,
  RemixTranscriptV1,
  RemixTranscriptWord,
} from "@factory/shared";
import {
  getSttChunkDurationSec,
  getSttMaxUploadMb,
  getSttApiBaseUrl,
  getSttResponseFormat,
  getSttAudioBitrateKbps,
  getSttCostPerMinuteUsd,
  getSttModel,
  getSttBilingualEnglishWindowSec,
  isBilingualSttEnabled,
  type SttResponseFormat,
} from "../modules/remix/remix-config";
import {
  compressAudioBufferForStt,
  sliceAudioWindowForStt,
  splitMp3ForStt,
} from "../modules/remix/remix-audio.util";
import { buildSegmentsFromPlainText } from "./plain-text-segments";
import {
  hasLatinDialogueText,
  mergeBilingualTextPasses,
  type BilingualEnglishPass,
} from "./merge-bilingual-text";
import {
  detectCoarseTiming,
  normalizeCueTiming,
} from "../modules/remix/tts/normalize-cue-timing";
import { logGatewayCall, truncateForGatewayLog } from "./openrouter-call-log";

export type TranscribeAudioResult = {
  transcript: RemixTranscriptV1;
  costUsd: number;
  timingDegraded?: boolean;
  timingCoarse?: boolean;
  sttWarning?: string;
};

export type TranscribeWordsResult = {
  words: RemixTranscriptWord[];
  costUsd: number;
};

export { buildSegmentsFromPlainText } from "./plain-text-segments";

const FAKE_CHINESE_LINES = [
  "这是一个测试片段。",
  "主角发现了隐藏的秘密。",
  "剧情进入高潮部分。",
  "观众们纷纷表示震惊。",
  "意外的转折发生了。",
  "故事从这里开始。",
  "命运之轮开始转动。",
  "神秘的力量降临。",
  "危机四伏的时刻。",
  "一切都将改变。",
  "真相终于浮出水面。",
  "新的挑战即将到来。",
] as const;

type WhisperJson = {
  language?: string;
  duration?: number;
  text?: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
  usage?: {
    seconds?: number;
    cost?: number;
  };
};

type AudioUploadFormat = {
  mime: string;
  fileName: string;
};

export const detectAudioUploadFormat = (buffer: Buffer): AudioUploadFormat => {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0x49 &&
    buffer[1] === 0x44 &&
    buffer[2] === 0x33
  ) {
    return { mime: "audio/mpeg", fileName: "audio.mp3" };
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0) {
    return { mime: "audio/mpeg", fileName: "audio.mp3" };
  }

  return { mime: "audio/wav", fileName: "audio.wav" };
};

const estimateAudioDurationSec = (audioBuffer: Buffer): number => {
  const { mime } = detectAudioUploadFormat(audioBuffer);
  if (mime === "audio/mpeg") {
    const bitrateKbps = getSttAudioBitrateKbps();
    return Math.max(1, (audioBuffer.length * 8) / (bitrateKbps * 1000));
  }

  // 16 kHz mono PCM WAV
  return Math.max(1, (audioBuffer.length - 44) / (16000 * 2));
};

export type MapWhisperResult = {
  transcript: RemixTranscriptV1;
  timingDegraded: boolean;
  timingCoarse: boolean;
};

export const mapWhisperResponseToTranscript = (
  payload: WhisperJson,
  model: string,
  provider: string,
  languageHint?: string,
  timeOffsetSec = 0,
  fallbackDurationSec?: number,
): RemixTranscriptV1 =>
  mapWhisperResponseDetailed(
    payload,
    model,
    provider,
    languageHint,
    timeOffsetSec,
    fallbackDurationSec,
  ).transcript;

export const mapWhisperResponseDetailed = (
  payload: WhisperJson,
  model: string,
  provider: string,
  languageHint?: string,
  timeOffsetSec = 0,
  fallbackDurationSec?: number,
): MapWhisperResult => {
  let segments = (payload.segments ?? [])
    .map((segment) => ({
      startSec: segment.start + timeOffsetSec,
      endSec: segment.end + timeOffsetSec,
      text: segment.text.trim(),
    }))
    .filter((segment) => segment.text.length > 0);

  const fullText = payload.text?.trim() ?? segments.map((s) => s.text).join("");
  const usageDurationSec = payload.usage?.seconds;
  const durationSec =
    (Number.isFinite(usageDurationSec) && usageDurationSec! > 0
      ? usageDurationSec
      : payload.duration) ??
    (segments.length > 0
      ? segments[segments.length - 1]!.endSec - timeOffsetSec
      : (fallbackDurationSec ?? 0));

  if (segments.length === 0 && fullText) {
    segments = buildSegmentsFromPlainText(fullText, durationSec, timeOffsetSec);
  }

  const words = (payload.words ?? [])
    .map((word) => ({
      startSec: word.start + timeOffsetSec,
      endSec: word.end + timeOffsetSec,
      text: word.word.trim(),
    }))
    .filter(
      (word) =>
        word.text.length > 0 &&
        Number.isFinite(word.startSec) &&
        Number.isFinite(word.endSec) &&
        word.endSec > word.startSec,
    );

  const normalized = normalizeCueTiming({
    segments:
      segments.length > 0
        ? segments
        : fullText
          ? [{ startSec: timeOffsetSec, endSec: timeOffsetSec + durationSec, text: fullText }]
          : [],
    words,
    durationSec: timeOffsetSec + durationSec,
  });

  const transcript: RemixTranscriptV1 = {
    version: 1,
    language: payload.language ?? languageHint ?? "unknown",
    durationSec: timeOffsetSec + durationSec,
    segments: normalized.segments,
    fullText,
    provider,
    model,
    ...(words.length > 0 ? { words } : {}),
  };

  const timingCoarse = detectCoarseTiming({
    segments: normalized.segments,
    durationSec: transcript.durationSec,
    degraded:
      normalized.degraded ||
      (fullText.length > 0 && (payload.segments?.length ?? 0) === 0),
  });

  return {
    transcript,
    timingDegraded:
      normalized.degraded ||
      (fullText.length > 0 && (payload.segments?.length ?? 0) === 0),
    timingCoarse,
  };
};

export const estimateSttCostUsd = (durationSec: number): number =>
  (durationSec / 60) * getSttCostPerMinuteUsd();

const getFakeDurationSec = (): number => {
  const n = Number(process.env.REMIX_FAKE_DURATION_SEC ?? "60");
  return Number.isFinite(n) && n > 0 ? n : 60;
};

const getMaxUploadBytes = (): number => getSttMaxUploadMb() * 1024 * 1024;

const isFakeSttMode = (): boolean => process.env.REMIX_STT_MODE !== "live";

const mergeTranscripts = (
  parts: RemixTranscriptV1[],
  model: string,
  provider: string,
): RemixTranscriptV1 => {
  const segments = parts.flatMap((part) => part.segments);
  const words = parts.flatMap((part) => part.words ?? []);
  const durationSec = segments.length > 0 ? segments[segments.length - 1]!.endSec : 0;

  return {
    version: 1,
    language: parts.find((part) => part.language)?.language ?? "unknown",
    durationSec,
    segments,
    fullText: segments.map((segment) => segment.text).join(""),
    provider,
    model,
    ...(words.length > 0 ? { words } : {}),
  };
};

const OPENROUTER_BILINGUAL_WARNING =
  "OpenRouter Qwen dual-pass (auto + English) đã bắt thêm EN, nhưng API chỉ trả text nên timing cue vẫn là ước lượng.";

const OPENROUTER_EN_PASS_FAILURE_WARNING =
  "OpenRouter English pass failed; transcript chính vẫn được giữ lại.";

const OPENROUTER_EN_EMPTY_WARNING =
  "OpenRouter English pass không trả về text EN mới; timing cue vẫn là ước lượng.";

const getTranscriptText = (transcript: RemixTranscriptV1): string =>
  transcript.fullText.trim() ||
  transcript.segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

type EnglishRecoveryResult = {
  passes: BilingualEnglishPass[];
  costUsd: number;
  failed: boolean;
};

const recoverEnglishWithOpenRouter = async (input: {
  audioBuffer: Buffer;
  durationSec: number;
  timeOffsetSec: number;
}): Promise<EnglishRecoveryResult> => {
  const windowSec = getSttBilingualEnglishWindowSec();
  const passes: BilingualEnglishPass[] = [];
  let costUsd = 0;
  let failed = false;

  for (
    let offsetSec = 0;
    offsetSec < input.durationSec;
    offsetSec += windowSec
  ) {
    const currentWindowSec = Math.min(
      windowSec,
      input.durationSec - offsetSec,
    );
    let windowBuffer = input.audioBuffer;

    if (input.durationSec > windowSec) {
      try {
        windowBuffer = await sliceAudioWindowForStt(
          input.audioBuffer,
          offsetSec,
          currentWindowSec,
        );
      } catch {
        failed = true;
        continue;
      }
    }

    try {
      const result = await transcribeWithOpenAi(
        windowBuffer,
        "en",
        input.timeOffsetSec + offsetSec,
      );
      costUsd += result.costUsd;
      passes.push({
        text: getTranscriptText(result.transcript),
        timeOffsetSec: input.timeOffsetSec + offsetSec,
        durationSec: currentWindowSec,
      });
    } catch {
      failed = true;
    }
  }

  return { passes, costUsd, failed };
};

const transcribeBilingualWithOpenRouter = async (
  audioBuffer: Buffer,
  timeOffsetSec = 0,
): Promise<TranscribeAudioResult> => {
  const primary = await transcribeWithOpenAi(
    audioBuffer,
    undefined,
    timeOffsetSec,
  );
  const durationSec = Math.max(
    estimateAudioDurationSec(audioBuffer),
    primary.transcript.durationSec - timeOffsetSec,
    0,
  );
  const english = await recoverEnglishWithOpenRouter({
    audioBuffer,
    durationSec,
    timeOffsetSec,
  });
  const merged = mergeBilingualTextPasses({
    primaryText: getTranscriptText(primary.transcript),
    englishPasses: english.passes,
    primaryLanguage: primary.transcript.language,
    durationSec,
    timeOffsetSec,
  });
  const warning = merged.addedEnglish
    ? english.failed
      ? `${OPENROUTER_BILINGUAL_WARNING} ${OPENROUTER_EN_PASS_FAILURE_WARNING}`
      : OPENROUTER_BILINGUAL_WARNING
    : english.failed
      ? OPENROUTER_EN_PASS_FAILURE_WARNING
      : OPENROUTER_EN_EMPTY_WARNING;

  return {
    transcript: {
      version: 1,
      language: merged.language,
      durationSec: timeOffsetSec + durationSec,
      segments: merged.segments,
      fullText: merged.fullText,
      provider: primary.transcript.provider,
      model: primary.transcript.model,
    },
    costUsd: primary.costUsd + english.costUsd,
    timingDegraded: true,
    timingCoarse: true,
    sttWarning: warning,
  };
};

const overlapSec = (
  left: RemixTranscriptSegment,
  right: RemixTranscriptSegment,
): number =>
  Math.max(
    0,
    Math.min(left.endSec, right.endSec) -
      Math.max(left.startSec, right.startSec),
  );

const reattachBilingualRoles = (
  normalizedSegments: RemixTranscriptSegment[],
  originalSegments: RemixTranscriptSegment[],
): RemixTranscriptSegment[] =>
  normalizedSegments.map((segment) => {
    const bestMatch = originalSegments
      .filter((candidate) => candidate.role != null)
      .map((candidate) => ({ candidate, overlap: overlapSec(segment, candidate) }))
      .sort((a, b) => b.overlap - a.overlap)
      .find((match) => match.overlap > 0)?.candidate;

    if (bestMatch?.role) {
      return {
        ...segment,
        role: bestMatch.role,
        ...(bestMatch.roleSource
          ? { roleSource: bestMatch.roleSource }
          : {}),
      };
    }

    return {
      ...segment,
      role:
        hasLatinDialogueText(segment.text) &&
        !/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(segment.text)
          ? "source"
          : "narration",
      roleSource: "auto",
    };
  });

const buildFakeTranscript = (
  wavBuffer: Buffer,
  languageHint?: string,
): RemixTranscriptV1 => {
  const hash = createHash("sha256").update(wavBuffer).digest();
  const durationSec = getFakeDurationSec();
  const segmentCount = 8 + (hash[0]! % 5);
  const model = getSttModel();

  const segments = Array.from({ length: segmentCount }, (_, index) => {
    const startSec = (durationSec / segmentCount) * index;
    const endSec =
      index === segmentCount - 1
        ? durationSec
        : (durationSec / segmentCount) * (index + 1);
    const lineIndex =
      hash[(index + 1) % hash.length]! % FAKE_CHINESE_LINES.length;

    return {
      startSec: Math.round(startSec * 100) / 100,
      endSec: Math.round(endSec * 100) / 100,
      text: FAKE_CHINESE_LINES[lineIndex]!,
    };
  });

  return {
    version: 1,
    language: languageHint ?? "zh",
    durationSec,
    segments,
    fullText: segments.map((segment) => segment.text).join(""),
    provider: "fake",
    model,
  };
};

const transcribeWithOpenAi = async (
  audioBuffer: Buffer,
  languageHint?: string,
  timeOffsetSec = 0,
): Promise<TranscribeAudioResult> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when REMIX_STT_MODE is live");
  }

  const model = getSttModel();
  const baseUrl = getSttApiBaseUrl();
  const preferredFormat = getSttResponseFormat();
  const provider =
    process.env.REMIX_STT_API_URL?.trim() || !process.env.AI_GATEWAY_URL?.trim()
      ? "openai"
      : "gateway";
  const { mime, fileName } = detectAudioUploadFormat(audioBuffer);
  const fallbackDurationSec = estimateAudioDurationSec(audioBuffer);

  const requestTranscription = async (
    responseFormat: SttResponseFormat,
  ): Promise<Response> => {
    const form = new FormData();
    const blobBytes = new Uint8Array(audioBuffer).slice();
    form.append(
      "file",
      new Blob([blobBytes], { type: mime }),
      fileName,
    );
    form.append("model", model);
    form.append("response_format", responseFormat);

    if (responseFormat === "verbose_json") {
      form.append("timestamp_granularities[]", "segment");
      form.append("timestamp_granularities[]", "word");
    }

    if (languageHint) {
      form.append("language", languageHint);
    }

    return fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  };

  let usedJsonFallback = false;
  const started = Date.now();
  let response = await requestTranscription(preferredFormat);
  if (
    !response.ok &&
    preferredFormat === "verbose_json" &&
    (response.status === 400 || response.status === 422)
  ) {
    // Some gateway providers reject verbose_json — fall back to plain text.
    usedJsonFallback = true;
    response = await requestTranscription("json");
  }

  if (!response.ok) {
    const body = await response.text();
    logGatewayCall({
      kind: "stt",
      type: "remix_stt",
      model,
      host: baseUrl,
      status: "error",
      durationMs: Date.now() - started,
      input: {
        languageHint: languageHint ?? null,
        responseFormat: usedJsonFallback ? "json" : preferredFormat,
        audioBytes: audioBuffer.length,
        mime,
        fileName,
        timeOffsetSec,
      },
      output: {
        httpStatus: response.status,
        body: truncateForGatewayLog(body).text,
      },
      error: `STT request failed (${response.status})`,
    });
    throw new Error(`STT request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as WhisperJson;
  const mapped = mapWhisperResponseDetailed(
    payload,
    model,
    provider,
    languageHint,
    timeOffsetSec,
    fallbackDurationSec,
  );

  const costUsd =
    typeof payload.usage?.cost === "number" && payload.usage.cost >= 0
      ? payload.usage.cost
      : estimateSttCostUsd(mapped.transcript.durationSec - timeOffsetSec);

  logGatewayCall({
    kind: "stt",
    type: "remix_stt",
    model,
    host: baseUrl,
    status: "ok",
    durationMs: Date.now() - started,
    input: {
      languageHint: languageHint ?? null,
      responseFormat: usedJsonFallback ? "json" : preferredFormat,
      audioBytes: audioBuffer.length,
      mime,
      fileName,
      timeOffsetSec,
      usedJsonFallback,
    },
    output: {
      segmentCount: mapped.transcript.segments.length,
      durationSec: mapped.transcript.durationSec,
      fullTextChars: mapped.transcript.fullText.length,
      fullTextPreview: truncateForGatewayLog(mapped.transcript.fullText).text,
      costUsd,
      timingDegraded: mapped.timingDegraded || usedJsonFallback,
      timingCoarse: mapped.timingCoarse || usedJsonFallback,
    },
  });

  return {
    transcript: mapped.transcript,
    costUsd,
    timingDegraded: mapped.timingDegraded || usedJsonFallback,
    timingCoarse: mapped.timingCoarse || usedJsonFallback,
  };
};

const transcribeChunkedMp3 = async (
  mp3Buffer: Buffer,
  languageHint?: string,
  segmentSec = getSttChunkDurationSec(),
): Promise<TranscribeAudioResult> => {
  const chunks = await splitMp3ForStt(mp3Buffer, segmentSec);
  const model = getSttModel();
  const provider =
    process.env.REMIX_STT_API_URL?.trim() || !process.env.AI_GATEWAY_URL?.trim()
      ? "openai"
      : "gateway";
  const parts: RemixTranscriptV1[] = [];
  let totalCostUsd = 0;
  let timeOffsetSec = 0;
  let timingDegraded = false;
  const sttWarnings = new Set<string>();

  for (const chunk of chunks) {
    const result = isBilingualSttEnabled()
      ? await transcribeBilingualWithOpenRouter(chunk, timeOffsetSec)
      : await transcribeWithOpenAi(chunk, languageHint, timeOffsetSec);
    parts.push(result.transcript);
    totalCostUsd += result.costUsd;
    timingDegraded = timingDegraded || Boolean(result.timingDegraded);
    if (result.sttWarning) {
      sttWarnings.add(result.sttWarning);
    }

    const transcriptChunkDuration =
      Math.max(result.transcript.durationSec - timeOffsetSec, 0);
    const encodedChunkDuration = estimateAudioDurationSec(chunk);
    const chunkDuration = Math.max(
      transcriptChunkDuration,
      encodedChunkDuration,
    );
    timeOffsetSec += chunkDuration;
  }

  const mergedBase = mergeTranscripts(parts, model, provider);
  const merged = {
    ...mergedBase,
    durationSec: Math.max(mergedBase.durationSec, timeOffsetSec),
  };
  const renormalized = normalizeCueTiming({
    segments: merged.segments,
    words: merged.words ?? [],
    durationSec: merged.durationSec,
  });
  timingDegraded = timingDegraded || renormalized.degraded;
  const normalizedSegments = isBilingualSttEnabled()
    ? reattachBilingualRoles(renormalized.segments, merged.segments)
    : renormalized.segments;
  const transcript: RemixTranscriptV1 = {
    ...merged,
    segments: normalizedSegments,
  };
  const timingCoarse = detectCoarseTiming({
    segments: transcript.segments,
    durationSec: transcript.durationSec,
    degraded: timingDegraded,
  });

  return {
    transcript,
    costUsd: totalCostUsd,
    timingDegraded,
    timingCoarse,
    ...(sttWarnings.size > 0
      ? { sttWarning: [...sttWarnings].join(" ") }
      : {}),
  };
};

export const transcribeAudio = async (
  audioBuffer: Buffer,
  opts?: { languageHint?: string },
): Promise<TranscribeAudioResult> => {
  if (isFakeSttMode()) {
    const transcript = buildFakeTranscript(audioBuffer, opts?.languageHint);
    return {
      transcript,
      costUsd: estimateSttCostUsd(transcript.durationSec),
    };
  }

  const maxBytes = getMaxUploadBytes();
  let prepared = audioBuffer;

  if (prepared.length > maxBytes) {
    prepared = await compressAudioBufferForStt(prepared);
  }

  if (prepared.length > maxBytes) {
    return transcribeChunkedMp3(prepared, opts?.languageHint);
  }

  if (estimateAudioDurationSec(prepared) > getSttChunkDurationSec()) {
    return transcribeChunkedMp3(prepared, opts?.languageHint);
  }

  return isBilingualSttEnabled()
    ? transcribeBilingualWithOpenRouter(prepared)
    : transcribeWithOpenAi(prepared, opts?.languageHint);
};

/**
 * Word-level timestamps for a timeline window — used when silencedetect cannot
 * find film-dialogue beds (they are loud speech, not silence).
 */
export const transcribeWordsInWindow = async (input: {
  audioBuffer: Buffer;
  windowStartSec: number;
  windowEndSec: number;
  languageHint?: string;
}): Promise<TranscribeWordsResult> => {
  const durationSec = Math.max(
    input.windowEndSec - input.windowStartSec,
    0.1,
  );

  if (isFakeSttMode()) {
    // Deterministic fake words with a mid-window gap for unit/integration tests.
    const mid = input.windowStartSec + durationSec * 0.4;
    return {
      words: [
        {
          startSec: input.windowStartSec + 0.1,
          endSec: mid - 1,
          text: "前",
        },
        {
          startSec: mid + 1,
          endSec: input.windowEndSec - 0.1,
          text: "后",
        },
      ],
      costUsd: 0,
    };
  }

  const sliced = await sliceAudioWindowForStt(
    input.audioBuffer,
    input.windowStartSec,
    durationSec,
  );
  const result = await transcribeWithOpenAi(
    sliced,
    input.languageHint,
    input.windowStartSec,
  );

  return {
    words: result.transcript.words ?? [],
    costUsd: result.costUsd,
  };
};

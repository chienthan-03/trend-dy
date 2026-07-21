import { createHash } from "node:crypto";
import type { RemixTranscriptV1, RemixTranscriptWord } from "@factory/shared";
import {
  getSttMaxUploadMb,
  getSttApiBaseUrl,
  getSttResponseFormat,
  getSttAudioBitrateKbps,
  getSttCostPerMinuteUsd,
  getSttModel,
  type SttResponseFormat,
} from "../modules/remix/remix-config";
import {
  compressAudioBufferForStt,
  sliceAudioWindowForStt,
  splitMp3ForStt,
} from "../modules/remix/remix-audio.util";
import { buildSegmentsFromPlainText } from "./plain-text-segments";
import {
  detectCoarseTiming,
  normalizeCueTiming,
} from "../modules/remix/tts/normalize-cue-timing";

export type TranscribeAudioResult = {
  transcript: RemixTranscriptV1;
  costUsd: number;
  timingDegraded?: boolean;
  timingCoarse?: boolean;
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
  const durationSec =
    payload.duration ??
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
    degraded: normalized.degraded,
  });

  return {
    transcript,
    timingDegraded: normalized.degraded,
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
    form.append(
      "file",
      new Blob([audioBuffer], { type: mime }),
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

  return {
    transcript: mapped.transcript,
    costUsd: estimateSttCostUsd(
      mapped.transcript.durationSec - timeOffsetSec,
    ),
    timingDegraded: mapped.timingDegraded || usedJsonFallback,
    timingCoarse: mapped.timingCoarse || usedJsonFallback,
  };
};

const transcribeChunkedMp3 = async (
  mp3Buffer: Buffer,
  languageHint?: string,
): Promise<TranscribeAudioResult> => {
  const chunks = await splitMp3ForStt(mp3Buffer);
  const model = getSttModel();
  const provider =
    process.env.REMIX_STT_API_URL?.trim() || !process.env.AI_GATEWAY_URL?.trim()
      ? "openai"
      : "gateway";
  const parts: RemixTranscriptV1[] = [];
  let totalCostUsd = 0;
  let timeOffsetSec = 0;
  let timingDegraded = false;

  for (const chunk of chunks) {
    const result = await transcribeWithOpenAi(chunk, languageHint, timeOffsetSec);
    parts.push(result.transcript);
    totalCostUsd += result.costUsd;
    timingDegraded = timingDegraded || Boolean(result.timingDegraded);

    const chunkDuration =
      result.transcript.segments.length > 0
        ? result.transcript.segments[result.transcript.segments.length - 1]!
            .endSec - timeOffsetSec
        : 0;
    timeOffsetSec += chunkDuration;
  }

  const merged = mergeTranscripts(parts, model, provider);
  const renormalized = normalizeCueTiming({
    segments: merged.segments,
    words: merged.words ?? [],
    durationSec: merged.durationSec,
  });
  timingDegraded = timingDegraded || renormalized.degraded;
  const transcript: RemixTranscriptV1 = {
    ...merged,
    segments: renormalized.segments,
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

  return transcribeWithOpenAi(prepared, opts?.languageHint);
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

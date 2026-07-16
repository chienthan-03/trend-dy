import { createHash } from "node:crypto";
import type { RemixTranscriptV1 } from "@factory/shared";
import {
  getSttMaxUploadMb,
  getSttApiBaseUrl,
  getSttResponseFormat,
  getSttAudioBitrateKbps,
  getSttCostPerMinuteUsd,
  getSttModel,
} from "../modules/remix/remix-config";
import {
  compressAudioBufferForStt,
  splitMp3ForStt,
} from "../modules/remix/remix-audio.util";

export type TranscribeAudioResult = {
  transcript: RemixTranscriptV1;
  costUsd: number;
};

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

export const buildSegmentsFromPlainText = (
  text: string,
  durationSec: number,
  timeOffsetSec = 0,
): Array<{ startSec: number; endSec: number; text: string }> => {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const parts = trimmed
    .split(/(?<=[。！？.!?])\s*|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const sentences = parts.length > 0 ? parts : [trimmed];
  const totalChars = sentences.reduce((sum, sentence) => sum + sentence.length, 0) || 1;
  let cursor = 0;

  return sentences.map((sentence) => {
    const weight = sentence.length / totalChars;
    const span = durationSec * weight;
    const startSec = timeOffsetSec + cursor;
    const endSec = timeOffsetSec + cursor + span;
    cursor += span;

    return {
      startSec: Math.round(startSec * 100) / 100,
      endSec: Math.round(endSec * 100) / 100,
      text: sentence,
    };
  });
};

export const mapWhisperResponseToTranscript = (
  payload: WhisperJson,
  model: string,
  provider: string,
  languageHint?: string,
  timeOffsetSec = 0,
  fallbackDurationSec?: number,
): RemixTranscriptV1 => {
  let segments = (payload.segments ?? []).map((segment) => ({
    startSec: segment.start + timeOffsetSec,
    endSec: segment.end + timeOffsetSec,
    text: segment.text.trim(),
  }));

  const fullText = payload.text?.trim() ?? segments.map((s) => s.text).join("");

  if (segments.length === 0 && fullText) {
    const durationSec = payload.duration ?? fallbackDurationSec ?? 0;
    segments = buildSegmentsFromPlainText(fullText, durationSec, timeOffsetSec);
  }

  const durationSec =
    payload.duration ??
    (segments.length > 0
      ? segments[segments.length - 1]!.endSec - timeOffsetSec
      : (fallbackDurationSec ?? 0));

  return {
    version: 1,
    language: payload.language ?? languageHint ?? "unknown",
    durationSec: timeOffsetSec + durationSec,
    segments,
    fullText,
    provider,
    model,
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
  const durationSec = segments.length > 0 ? segments[segments.length - 1]!.endSec : 0;

  return {
    version: 1,
    language: parts.find((part) => part.language)?.language ?? "unknown",
    durationSec,
    segments,
    fullText: segments.map((segment) => segment.text).join(""),
    provider,
    model,
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
  const responseFormat = getSttResponseFormat();
  const provider =
    process.env.REMIX_STT_API_URL?.trim() || !process.env.AI_GATEWAY_URL?.trim()
      ? "openai"
      : "gateway";
  const { mime, fileName } = detectAudioUploadFormat(audioBuffer);
  const fallbackDurationSec = estimateAudioDurationSec(audioBuffer);

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
  }

  if (languageHint) {
    form.append("language", languageHint);
  }

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`STT request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as WhisperJson;
  const transcript = mapWhisperResponseToTranscript(
    payload,
    model,
    provider,
    languageHint,
    timeOffsetSec,
    fallbackDurationSec,
  );

  return {
    transcript,
    costUsd: estimateSttCostUsd(transcript.durationSec - timeOffsetSec),
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

  for (const chunk of chunks) {
    const result = await transcribeWithOpenAi(chunk, languageHint, timeOffsetSec);
    parts.push(result.transcript);
    totalCostUsd += result.costUsd;

    const chunkDuration =
      result.transcript.segments.length > 0
        ? result.transcript.segments[result.transcript.segments.length - 1]!
            .endSec - timeOffsetSec
        : 0;
    timeOffsetSec += chunkDuration;
  }

  return {
    transcript: mergeTranscripts(parts, model, provider),
    costUsd: totalCostUsd,
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

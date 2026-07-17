import { ServiceUnavailableException } from "@nestjs/common";
import type { RemixScriptMode } from "@factory/shared";

export const getRemixScriptMode = (): RemixScriptMode => {
  const raw = process.env.REMIX_SCRIPT_MODE?.trim().toLowerCase();
  return raw === "full" ? "full" : "caption";
};

export const isMediaDownloadAllowed = (): boolean => {
  const raw = process.env.REMIX_ALLOW_MEDIA_DOWNLOAD?.trim().toLowerCase();
  return raw === "true" || raw === "1";
};

export const assertFullScriptAllowed = (): void => {
  if (getRemixScriptMode() !== "full") return;
  if (!isMediaDownloadAllowed()) {
    throw new ServiceUnavailableException(
      "REMIX_SCRIPT_MODE=full requires REMIX_ALLOW_MEDIA_DOWNLOAD=true",
    );
  }
};

export const getMediaTtlDays = (): number => {
  const n = Number(process.env.REMIX_MEDIA_TTL_DAYS ?? "7");
  return Number.isFinite(n) && n > 0 ? n : 7;
};

export const getMaxMediaMb = (): number => {
  const n = Number(process.env.REMIX_MAX_MEDIA_MB ?? "50");
  return Number.isFinite(n) && n > 0 ? n : 50;
};

/** Download timeout for large Douyin CDN files (default 10 min). */
export const getMediaDownloadTimeoutMs = (): number => {
  const n = Number(process.env.REMIX_MEDIA_DOWNLOAD_TIMEOUT_MS ?? "600000");
  return Number.isFinite(n) && n > 0 ? n : 600_000;
};

/** Whisper multipart upload limit is 25 MB; stay below by default. */
export const getSttMaxUploadMb = (): number => {
  const n = Number(process.env.REMIX_STT_MAX_UPLOAD_MB ?? "24");
  return Number.isFinite(n) && n > 0 ? n : 24;
};

export const getSttAudioBitrateKbps = (): number => {
  const n = Number(process.env.REMIX_STT_AUDIO_BITRATE_KBPS ?? "24");
  return Number.isFinite(n) && n > 0 ? n : 24;
};

export const getTtsMaxSpeed = (): number => {
  const n = Number(process.env.REMIX_TTS_MAX_SPEED ?? "1.25");
  return Number.isFinite(n) && n > 0 ? n : 1.25;
};

/** OpenRouter: openai/whisper-large-v3-turbo; OpenAI direct: whisper-1 */
export const getSttModel = (): string =>
  process.env.REMIX_STT_MODEL?.trim() || "openai/whisper-large-v3-turbo";

/** Duration-based STT pricing (USD per minute). Turbo ≈ $0.04/hr on OpenRouter/Groq. */
export const getSttCostPerMinuteUsd = (): number => {
  const configured = Number(process.env.REMIX_STT_COST_PER_MINUTE_USD);
  if (Number.isFinite(configured) && configured >= 0) {
    return configured;
  }

  const model = getSttModel().toLowerCase();
  if (model.includes("whisper-large-v3-turbo") || model.includes("distil-whisper")) {
    return 0.04 / 60;
  }
  if (model.includes("gpt-4o-mini-transcribe")) {
    return 0.003;
  }
  if (model.includes("gpt-4o-transcribe")) {
    return 0.006;
  }
  return 0.006;
};

export const getSttApiBaseUrl = (): string => {
  const dedicated = process.env.REMIX_STT_API_URL?.trim();
  if (dedicated) {
    return dedicated.replace(/\/$/, "");
  }
  const gateway = process.env.AI_GATEWAY_URL?.trim();
  if (gateway) {
    return gateway.replace(/\/$/, "");
  }
  return "https://api.openai.com/v1";
};

export type SttResponseFormat = "verbose_json" | "json";

export const getSttResponseFormat = (): SttResponseFormat => {
  const raw = process.env.REMIX_STT_RESPONSE_FORMAT?.trim().toLowerCase();
  if (raw === "verbose_json" || raw === "json") {
    return raw;
  }
  if (process.env.REMIX_STT_API_URL?.trim()) {
    return "verbose_json";
  }
  if (process.env.AI_GATEWAY_URL?.trim()) {
    return "json";
  }
  return "verbose_json";
};

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

export type TtsMode = "fake" | "live";

export const getTtsMode = (): TtsMode => {
  const raw = process.env.REMIX_TTS_MODE?.trim().toLowerCase();
  return raw === "live" ? "live" : "fake";
};

export const getTtsApiBaseUrl = (): string => {
  const dedicated = process.env.REMIX_TTS_API_URL?.trim();
  if (dedicated) {
    return dedicated.replace(/\/$/, "");
  }
  const gateway = process.env.AI_GATEWAY_URL?.trim();
  if (gateway) {
    return gateway.replace(/\/$/, "");
  }
  return "https://api.openai.com/v1";
};

export const getTtsApiKey = (): string =>
  process.env.REMIX_TTS_API_KEY?.trim() ||
  process.env.AI_GATEWAY_API_KEY?.trim() ||
  process.env.OPENAI_API_KEY?.trim() ||
  "";

const isOpenRouterTtsBase = (): boolean =>
  getTtsApiBaseUrl().includes("openrouter.ai");

export const getTtsModel = (): string => {
  const configured = process.env.REMIX_TTS_MODEL?.trim();
  if (configured) return configured;

  // OpenRouter speech models use provider/slug ids (not OpenAI-direct `tts-1`).
  if (isOpenRouterTtsBase()) {
    return "x-ai/grok-voice-tts-1.0";
  }
  return "tts-1";
};

export const getTtsCostPer1kCharsUsd = (): number => {
  const configured = Number(process.env.REMIX_TTS_COST_PER_1K_CHARS_USD);
  return Number.isFinite(configured) && configured >= 0 ? configured : 0.015;
};

export const getDefaultTtsVoiceId = (): string => {
  const configured = process.env.REMIX_TTS_VOICE?.trim();
  if (configured) return configured;
  // Grok Voice (OpenRouter default) uses eve/ara/rex/sal/leo — not alloy/nova.
  if (isOpenRouterTtsBase() && getTtsModel().includes("grok-voice")) {
    return "eve";
  }
  return "alloy";
};

/** Map Studio voice presets onto provider-specific voice ids when needed. */
export const resolveTtsVoiceId = (voiceId: string): string => {
  const trimmed = voiceId.trim() || getDefaultTtsVoiceId();
  if (!isOpenRouterTtsBase()) return trimmed;

  const model = getTtsModel();
  if (model.includes("grok-voice")) {
    const map: Record<string, string> = {
      alloy: "eve",
      nova: "ara",
      echo: "rex",
      fable: "sal",
      onyx: "leo",
      shimmer: "ara",
    };
    return map[trimmed] ?? trimmed;
  }

  if (model.includes("kokoro")) {
    const map: Record<string, string> = {
      alloy: "af_alloy",
      nova: "af_nova",
      echo: "am_echo",
      fable: "af_bella",
      onyx: "am_adam",
      shimmer: "af_sarah",
    };
    return map[trimmed] ?? trimmed;
  }

  return trimmed;
};

export const getDubMaxUploadMb = (): number => {
  const n = Number(process.env.REMIX_DUB_MAX_UPLOAD_MB ?? "30");
  return Number.isFinite(n) && n > 0 ? n : 30;
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

/** Height of each letterbox bar as a fraction of source video height. */
export const getLetterboxRatio = (): number => {
  const n = Number(process.env.REMIX_LETTERBOX_RATIO ?? "0.10");
  return Number.isFinite(n) && n > 0 && n < 0.5 ? n : 0.1;
};

/** Custom font file for letterbox drawtext; omit to use ffmpeg's default/fontconfig. */
export const getRenderFontPath = (): string | undefined =>
  process.env.REMIX_RENDER_FONT_PATH?.trim() || undefined;

/** How far the original audio ducks under narration windows (0.05–1, default 0.2). */
export const getDuckGain = (): number => {
  const n = Number(process.env.REMIX_DUCK_GAIN ?? "0.2");
  if (!Number.isFinite(n)) return 0.2;
  return Math.min(1, Math.max(0.05, n));
};

export type SttResponseFormat = "verbose_json" | "json";

export const getSttResponseFormat = (): SttResponseFormat => {
  const raw = process.env.REMIX_STT_RESPONSE_FORMAT?.trim().toLowerCase();
  if (raw === "verbose_json" || raw === "json") {
    return raw;
  }
  // Prefer timed segments for dub sync. OpenRouter OpenAI-compatible Whisper
  // supports verbose_json; plain json is only for providers that reject it.
  return "verbose_json";
};

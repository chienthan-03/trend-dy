import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
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

export const TTS_SPEED_MIN = 0.75;
export const TTS_SPEED_MAX = 1.25;
export const TTS_MAX_SPEED_MIN = 1;
export const TTS_MAX_SPEED_MAX = 2;

export const getDefaultTtsSpeed = (): number => {
  const n = Number(process.env.REMIX_TTS_DEFAULT_SPEED ?? "1");
  return Number.isFinite(n) && n > 0 ? n : 1;
};

export const resolveTtsSpeed = (remakeSpeed?: number | null): number => {
  const raw = remakeSpeed ?? getDefaultTtsSpeed();
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(TTS_SPEED_MAX, Math.max(TTS_SPEED_MIN, raw));
};

export const resolveTtsMaxSpeed = (remakeMaxSpeed?: number | null): number => {
  if (
    remakeMaxSpeed != null &&
    Number.isFinite(remakeMaxSpeed) &&
    remakeMaxSpeed > 0
  ) {
    return Math.min(TTS_MAX_SPEED_MAX, Math.max(TTS_MAX_SPEED_MIN, remakeMaxSpeed));
  }
  return getTtsMaxSpeed();
};

/**
 * How TTS dub is mixed into the final render:
 * - `replace` (default): TTS every cue; full soundtrack replace (continuous VI).
 * - `mix`: TTS narration only; duck original under narration (Review / Giữ gốc).
 */
export type TtsAudioMode = "replace" | "mix";

export const getTtsAudioMode = (): TtsAudioMode => {
  const raw = process.env.REMIX_TTS_AUDIO_MODE?.trim().toLowerCase();
  if (raw === "mix") return "mix";
  return "replace";
};

export type TtsTimingMode = "sequential" | "hybrid" | "strict";

export const getTtsTimingMode = (): TtsTimingMode => {
  const raw = process.env.REMIX_TTS_TIMING_MODE?.trim().toLowerCase();
  if (raw === "strict") return "strict";
  if (raw === "hybrid") return "hybrid";
  return "sequential";
};

export const getHybridBlockGapSec = (): number => {
  const n = Number(process.env.REMIX_TTS_HYBRID_BLOCK_GAP_SEC ?? "1");
  if (!Number.isFinite(n) || n < 0) return 1;
  return n;
};

export const getHybridLockGraceSec = (): number => {
  const n = Number(process.env.REMIX_TTS_HYBRID_LOCK_GRACE_SEC ?? "0.5");
  if (!Number.isFinite(n) || n < 0) return 0.5;
  return n;
};

export type TtsEngine = "fake" | "live" | "piper";

/** @deprecated Prefer `TtsEngine`; kept for existing imports. */
export type TtsMode = TtsEngine;

/** Env-only default (UI may override via remake.ttsEngine). */
export const getTtsMode = (): TtsEngine => {
  const raw = process.env.REMIX_TTS_MODE?.trim().toLowerCase();
  if (raw === "live") return "live";
  if (raw === "piper" || raw === "local") return "piper";
  return "fake";
};

const normalizeEngine = (value?: string | null): TtsEngine | null => {
  const raw = value?.trim().toLowerCase();
  if (raw === "live" || raw === "piper" || raw === "fake") return raw;
  if (raw === "local") return "piper";
  return null;
};

export const resolveTtsEngine = (input?: {
  payloadEngine?: string | null;
  remakeEngine?: string | null;
}): TtsEngine => {
  const fromPayload = normalizeEngine(input?.payloadEngine);
  if (fromPayload) return fromPayload;
  const fromRemake = normalizeEngine(input?.remakeEngine);
  if (fromRemake) return fromRemake;
  return getTtsMode();
};

export const getPiperBin = (): string =>
  process.env.REMIX_PIPER_BIN?.trim() || "piper";

const resolveDefaultPiperModelDir = (): string => {
  const cwd = process.cwd();
  const candidates = [
    join(cwd, "apps/api/models/tts/ngoc-huyen"),
    join(cwd, "models/tts/ngoc-huyen"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return resolve(candidate);
    }
  }
  return resolve(cwd, "apps/api/models/tts/ngoc-huyen");
};

export const getPiperModelDir = (): string => {
  const configured = process.env.REMIX_PIPER_MODEL_DIR?.trim();
  if (configured) return configured;
  return resolveDefaultPiperModelDir();
};

/** ASCII stem for Windows-safe paths (Piper CLI crashes on Unicode model paths). */
export const getPiperModelStem = (): string =>
  process.env.REMIX_PIPER_MODEL_STEM?.trim() || "ngoc-huyen";

export const getSmartBatchMaxGapSec = (): number => {
  const n = Number(process.env.REMIX_TTS_SMART_BATCH_MAX_GAP_SEC ?? "0.6");
  return Number.isFinite(n) && n > 0 ? n : 0.6;
};

export const getSmartBatchMaxDurationSec = (): number => {
  const n = Number(process.env.REMIX_TTS_SMART_BATCH_MAX_DURATION_SEC ?? "12");
  return Number.isFinite(n) && n > 0 ? n : 12;
};

export const getSmartBatchMaxChars = (): number => {
  const n = Number(process.env.REMIX_TTS_SMART_BATCH_MAX_CHARS ?? "500");
  return Number.isFinite(n) && n > 0 ? n : 500;
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
  if (Number.isFinite(configured) && configured >= 0) return configured;

  // Grok Voice on OpenRouter bills ~$0.058–0.06 / 1k prompt chars (not $0.015).
  const model = getTtsModel().toLowerCase();
  if (model.includes("grok-voice") || model.includes("grok")) {
    return 0.06;
  }
  return 0.015;
};

export const getDefaultTtsVoiceId = (): string => {
  const configured = process.env.REMIX_TTS_VOICE?.trim();
  if (configured) return configured;
  const model = getTtsModel();
  // Grok Voice (OpenRouter default) uses eve/ara/rex/sal/leo — not alloy/nova.
  if (isOpenRouterTtsBase() && model.includes("grok-voice")) {
    return "eve";
  }
  if (isOpenRouterTtsBase() && /gemini/i.test(model)) {
    return "Kore";
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

  if (/gemini/i.test(model)) {
    const map: Record<string, string> = {
      alloy: "Kore",
      nova: "Aoede",
      echo: "Puck",
      fable: "Leda",
      onyx: "Orus",
      shimmer: "Zephyr",
      eve: "Kore",
      ara: "Aoede",
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

/**
 * Gyan/Windows ffmpeg builds often ship without fontconfig defaults; drawtext
 * then crashes (exit 0xC0000005). Prefer an explicit .ttf via env, else the
 * first readable system font we know about.
 */
const DEFAULT_RENDER_FONT_CANDIDATES = [
  "C:\\Windows\\Fonts\\arial.ttf",
  "C:\\Windows\\Fonts\\segoeui.ttf",
  "C:\\Windows\\Fonts\\tahoma.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
];

/** ffmpeg drawtext wants forward slashes; escape of `:` happens at filter build. */
const normalizeFontPathForFfmpeg = (fontPath: string): string =>
  fontPath.replace(/\\/g, "/");

/**
 * Font file for letterbox `drawtext`.
 * `REMIX_RENDER_FONT_PATH` wins when set; otherwise auto-detect a system TTF.
 */
export const getRenderFontPath = (): string | undefined => {
  const configured = process.env.REMIX_RENDER_FONT_PATH?.trim();
  if (configured) return normalizeFontPathForFfmpeg(configured);

  for (const candidate of DEFAULT_RENDER_FONT_CANDIDATES) {
    if (existsSync(candidate)) {
      return normalizeFontPathForFfmpeg(candidate);
    }
  }
  return undefined;
};

/**
 * Original-track gain during narration windows (0–1, default 0 = mute).
 * Source (film dialogue) windows stay at full volume; only narration is ducked.
 */
export const getDuckGain = (): number => {
  const n = Number(process.env.REMIX_DUCK_GAIN ?? "0");
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
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

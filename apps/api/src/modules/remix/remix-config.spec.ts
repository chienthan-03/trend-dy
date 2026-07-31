import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  assertFullScriptAllowed,
  getLetterboxRatio,
  getMediaDownloadTimeoutMs,
  getPiperBin,
  getPiperModelDir,
  getPiperModelStem,
  getRemixLlmModel,
  getRemixScriptMode,
  getRenderFontPath,
  getSmartBatchMaxChars,
  getSmartBatchMaxDurationSec,
  getSmartBatchMaxGapSec,
  getSttCostPerMinuteUsd,
  getSttChunkDurationSec,
  getSttLanguageHint,
  getSttMaxUploadMb,
  getSttModel,
  getSttResponseFormat,
  getDefaultTtsSpeed,
  getTtsMaxSpeed,
  resolveTtsMaxSpeed,
  resolveTtsSpeed,
  getTtsTimingMode,
  getTtsMode,
  resolveTtsEngine,
} from "./remix-config";

describe("remix-config", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });
  afterEach(() => {
    process.env = env;
  });

  it("defaults to caption mode", () => {
    delete process.env.REMIX_SCRIPT_MODE;
    expect(getRemixScriptMode()).toBe("caption");
  });

  it("defaults Remix LLM to GPT-5.6 Luna", () => {
    delete process.env.REMIX_LLM_MODEL;
    delete process.env.LLM_MODEL;
    expect(getRemixLlmModel()).toBe("openai/gpt-5.6-luna");
  });

  it("rejects full mode without media download", () => {
    process.env.REMIX_SCRIPT_MODE = "full";
    process.env.REMIX_ALLOW_MEDIA_DOWNLOAD = "false";
    expect(() => assertFullScriptAllowed()).toThrow(/REMIX_ALLOW_MEDIA_DOWNLOAD/);
  });

  it("allows full mode when download enabled", () => {
    process.env.REMIX_SCRIPT_MODE = "full";
    process.env.REMIX_ALLOW_MEDIA_DOWNLOAD = "true";
    expect(() => assertFullScriptAllowed()).not.toThrow();
  });

  it("defaults media download timeout to 10 minutes", () => {
    delete process.env.REMIX_MEDIA_DOWNLOAD_TIMEOUT_MS;
    expect(getMediaDownloadTimeoutMs()).toBe(600_000);
  });

  it("defaults to verbose_json STT format (including AI gateway)", () => {
    process.env.AI_GATEWAY_URL = "https://openrouter.ai/api/v1";
    process.env.REMIX_STT_MODEL = "openai/whisper-large-v3";
    delete process.env.REMIX_STT_API_URL;
    delete process.env.REMIX_STT_RESPONSE_FORMAT;
    expect(getSttResponseFormat()).toBe("verbose_json");
  });

  it("honors REMIX_STT_RESPONSE_FORMAT=json override", () => {
    process.env.AI_GATEWAY_URL = "https://openrouter.ai/api/v1";
    process.env.REMIX_STT_RESPONSE_FORMAT = "json";
    expect(getSttResponseFormat()).toBe("json");
  });

  it("forces json for gpt-4o-transcribe (verbose_json rejected by OpenRouter)", () => {
    process.env.REMIX_STT_MODEL = "openai/gpt-4o-transcribe";
    process.env.REMIX_STT_RESPONSE_FORMAT = "verbose_json";
    expect(getSttResponseFormat()).toBe("json");
  });

  it("defaults gpt-4o-transcribe to json when format unset", () => {
    process.env.REMIX_STT_MODEL = "openai/gpt-4o-transcribe";
    delete process.env.REMIX_STT_RESPONSE_FORMAT;
    expect(getSttResponseFormat()).toBe("json");
  });

  it("forces json for Qwen ASR because it returns text without Whisper timestamps", () => {
    process.env.REMIX_STT_MODEL = "qwen/qwen3-asr-flash-2026-02-10";
    process.env.REMIX_STT_RESPONSE_FORMAT = "verbose_json";
    expect(getSttResponseFormat()).toBe("json");
  });

  it("defaults STT model to Qwen ASR Flash", () => {
    delete process.env.REMIX_STT_MODEL;
    expect(getSttModel()).toBe("qwen/qwen3-asr-flash-2026-02-10");
  });

  it("caps Qwen uploads at 10 MB and chunks them at five minutes", () => {
    process.env.REMIX_STT_MODEL = "qwen/qwen3-asr-flash-2026-02-10";
    process.env.REMIX_STT_MAX_UPLOAD_MB = "24";
    expect(getSttMaxUploadMb()).toBe(10);
    expect(getSttChunkDurationSec()).toBe(300);
  });

  it("infers turbo STT cost from model name", () => {
    process.env.REMIX_STT_MODEL = "openai/whisper-large-v3-turbo";
    delete process.env.REMIX_STT_COST_PER_MINUTE_USD;
    expect(getSttCostPerMinuteUsd()).toBeCloseTo(0.04 / 60);
  });

  it("infers large-v3 STT cost from model name", () => {
    process.env.REMIX_STT_MODEL = "openai/whisper-large-v3";
    delete process.env.REMIX_STT_COST_PER_MINUTE_USD;
    expect(getSttCostPerMinuteUsd()).toBeCloseTo(0.111 / 60);
  });

  it("infers Qwen ASR duration-based cost from model name", () => {
    process.env.REMIX_STT_MODEL = "qwen/qwen3-asr-flash-2026-02-10";
    delete process.env.REMIX_STT_COST_PER_MINUTE_USD;
    expect(getSttCostPerMinuteUsd()).toBeCloseTo(0.000035 * 60);
  });

  it("reads STT language hint from env", () => {
    delete process.env.REMIX_STT_LANGUAGE;
    expect(getSttLanguageHint()).toBeUndefined();
    process.env.REMIX_STT_LANGUAGE = "zh";
    expect(getSttLanguageHint()).toBe("zh");
  });

  it("defaults TTS max speed to 1.5", () => {
    delete process.env.REMIX_TTS_MAX_SPEED;
    expect(getTtsMaxSpeed()).toBe(1.5);
  });

  it("reads TTS max speed from env", () => {
    process.env.REMIX_TTS_MAX_SPEED = "1.5";
    expect(getTtsMaxSpeed()).toBe(1.5);
  });

  it("defaults TTS base speed to 1", () => {
    delete process.env.REMIX_TTS_DEFAULT_SPEED;
    expect(getDefaultTtsSpeed()).toBe(1);
  });

  it("reads TTS default speed from env", () => {
    process.env.REMIX_TTS_DEFAULT_SPEED = "1.1";
    expect(getDefaultTtsSpeed()).toBe(1.1);
  });

  it("clamps resolveTtsSpeed to 0.75–1.5", () => {
    expect(resolveTtsSpeed(0.5)).toBe(0.75);
    expect(resolveTtsSpeed(2)).toBe(1.5);
    expect(resolveTtsSpeed(1)).toBe(1);
    expect(resolveTtsSpeed(null)).toBe(1);
  });

  it("resolveTtsMaxSpeed prefers remake override over env", () => {
    process.env.REMIX_TTS_MAX_SPEED = "1.5";
    expect(resolveTtsMaxSpeed(1.5)).toBe(1.5);
    expect(resolveTtsMaxSpeed(null)).toBe(1.5);
    expect(resolveTtsMaxSpeed(undefined)).toBe(1.5);
  });

  it("clamps resolveTtsMaxSpeed to 1–2", () => {
    expect(resolveTtsMaxSpeed(0.5)).toBe(1);
    expect(resolveTtsMaxSpeed(3)).toBe(2);
  });

  it("resolveEffectiveTtsMaxSpeed never goes below base ttsSpeed", async () => {
    const { resolveEffectiveTtsMaxSpeed } = await import("./remix-config");
    process.env.REMIX_TTS_MAX_SPEED = "1.25";
    expect(resolveEffectiveTtsMaxSpeed(1.45, null)).toBe(1.45);
    expect(resolveEffectiveTtsMaxSpeed(1.15, 1.5)).toBe(1.5);
    expect(resolveEffectiveTtsMaxSpeed(1, null)).toBe(1.25);
  });

  it("defaults OpenRouter TTS model to Grok Voice", async () => {
    const { getTtsModel, resolveTtsVoiceId } = await import("./remix-config");
    process.env.AI_GATEWAY_URL = "https://openrouter.ai/api/v1";
    delete process.env.REMIX_TTS_API_URL;
    delete process.env.REMIX_TTS_MODEL;
    expect(getTtsModel()).toBe("x-ai/grok-voice-tts-1.0");
    expect(resolveTtsVoiceId("alloy")).toBe("eve");
  });

  it("defaults letterbox ratio to 0.10", () => {
    delete process.env.REMIX_LETTERBOX_RATIO;
    expect(getLetterboxRatio()).toBe(0.1);
  });

  it("reads letterbox ratio from env", () => {
    process.env.REMIX_LETTERBOX_RATIO = "0.15";
    expect(getLetterboxRatio()).toBe(0.15);
  });

  it("falls back to default letterbox ratio for out-of-range values", () => {
    process.env.REMIX_LETTERBOX_RATIO = "0.9";
    expect(getLetterboxRatio()).toBe(0.1);
  });

  it("reads render font path from env", () => {
    process.env.REMIX_RENDER_FONT_PATH = "/fonts/Roboto-Bold.ttf";
    expect(getRenderFontPath()).toBe("/fonts/Roboto-Bold.ttf");
  });

  it("normalizes Windows backslashes in configured font path", () => {
    process.env.REMIX_RENDER_FONT_PATH = "C:\\Windows\\Fonts\\arial.ttf";
    expect(getRenderFontPath()).toBe("C:/Windows/Fonts/arial.ttf");
  });

  it("auto-detects a system font when env is unset", () => {
    delete process.env.REMIX_RENDER_FONT_PATH;
    const fontPath = getRenderFontPath();
    if (process.platform === "win32") {
      expect(fontPath).toMatch(/\/Fonts\/(arial|segoeui|tahoma)\.ttf$/i);
    }
  });

  it("defaults TTS timing mode to sequential", () => {
    delete process.env.REMIX_TTS_TIMING_MODE;
    expect(getTtsTimingMode()).toBe("sequential");
  });

  it("honors REMIX_TTS_TIMING_MODE=hybrid", () => {
    process.env.REMIX_TTS_TIMING_MODE = "hybrid";
    expect(getTtsTimingMode()).toBe("hybrid");
  });

  it("honors REMIX_TTS_TIMING_MODE=strict", () => {
    process.env.REMIX_TTS_TIMING_MODE = "strict";
    expect(getTtsTimingMode()).toBe("strict");
  });

  it("falls back to sequential for unknown timing mode", () => {
    process.env.REMIX_TTS_TIMING_MODE = "elastic";
    expect(getTtsTimingMode()).toBe("sequential");
  });

  it("defaults TTS mode to fake", () => {
    delete process.env.REMIX_TTS_MODE;
    expect(getTtsMode()).toBe("fake");
  });

  it("reads live TTS mode from env", () => {
    process.env.REMIX_TTS_MODE = "live";
    expect(getTtsMode()).toBe("live");
  });

  it("reads piper TTS mode from env (piper or local alias)", () => {
    process.env.REMIX_TTS_MODE = "piper";
    expect(getTtsMode()).toBe("piper");

    process.env.REMIX_TTS_MODE = "local";
    expect(getTtsMode()).toBe("piper");
  });

  it("resolveTtsEngine prefers payload over remake over env", () => {
    process.env.REMIX_TTS_MODE = "fake";
    expect(
      resolveTtsEngine({
        payloadEngine: "live",
        remakeEngine: "piper",
      }),
    ).toBe("live");

    expect(
      resolveTtsEngine({
        payloadEngine: null,
        remakeEngine: "piper",
      }),
    ).toBe("piper");

    process.env.REMIX_TTS_MODE = "live";
    expect(resolveTtsEngine()).toBe("live");
  });

  it("resolveTtsEngine treats local alias as piper", () => {
    expect(resolveTtsEngine({ payloadEngine: "local" })).toBe("piper");
  });

  it("defaults Piper bin to piper", () => {
    delete process.env.REMIX_PIPER_BIN;
    expect(getPiperBin()).toBe("piper");
  });

  it("reads Piper bin from env", () => {
    process.env.REMIX_PIPER_BIN = "/usr/local/bin/piper";
    expect(getPiperBin()).toBe("/usr/local/bin/piper");
  });

  it("defaults Piper model stem to ASCII ngoc-huyen", () => {
    delete process.env.REMIX_PIPER_MODEL_STEM;
    expect(getPiperModelStem()).toBe("ngoc-huyen");
  });

  it("honors REMIX_PIPER_MODEL_DIR override", () => {
    process.env.REMIX_PIPER_MODEL_DIR = "/custom/models/ngoc-huyen";
    expect(getPiperModelDir()).toBe("/custom/models/ngoc-huyen");
  });

  it("defaults smart-batch tunables", () => {
    delete process.env.REMIX_TTS_SMART_BATCH_MAX_GAP_SEC;
    delete process.env.REMIX_TTS_SMART_BATCH_MAX_DURATION_SEC;
    delete process.env.REMIX_TTS_SMART_BATCH_MAX_CHARS;
    expect(getSmartBatchMaxGapSec()).toBe(0.6);
    expect(getSmartBatchMaxDurationSec()).toBe(12);
    expect(getSmartBatchMaxChars()).toBe(500);
  });

  it("reads smart-batch tunables from env", () => {
    process.env.REMIX_TTS_SMART_BATCH_MAX_GAP_SEC = "0.75";
    process.env.REMIX_TTS_SMART_BATCH_MAX_DURATION_SEC = "15";
    process.env.REMIX_TTS_SMART_BATCH_MAX_CHARS = "600";
    expect(getSmartBatchMaxGapSec()).toBe(0.75);
    expect(getSmartBatchMaxDurationSec()).toBe(15);
    expect(getSmartBatchMaxChars()).toBe(600);
  });
});

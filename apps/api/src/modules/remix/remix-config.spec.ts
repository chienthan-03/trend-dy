import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  assertFullScriptAllowed,
  getMediaDownloadTimeoutMs,
  getRemixScriptMode,
  getSttCostPerMinuteUsd,
  getSttModel,
  getSttResponseFormat,
  getTtsMaxSpeed,
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

  it("uses json STT format when AI gateway is set", () => {
    process.env.AI_GATEWAY_URL = "https://openrouter.ai/api/v1";
    delete process.env.REMIX_STT_API_URL;
    expect(getSttResponseFormat()).toBe("json");
  });

  it("defaults STT model to OpenRouter turbo", () => {
    delete process.env.REMIX_STT_MODEL;
    expect(getSttModel()).toBe("openai/whisper-large-v3-turbo");
  });

  it("infers turbo STT cost from model name", () => {
    process.env.REMIX_STT_MODEL = "openai/whisper-large-v3-turbo";
    delete process.env.REMIX_STT_COST_PER_MINUTE_USD;
    expect(getSttCostPerMinuteUsd()).toBeCloseTo(0.04 / 60);
  });

  it("defaults TTS max speed to 1.25", () => {
    delete process.env.REMIX_TTS_MAX_SPEED;
    expect(getTtsMaxSpeed()).toBe(1.25);
  });

  it("reads TTS max speed from env", () => {
    process.env.REMIX_TTS_MAX_SPEED = "1.5";
    expect(getTtsMaxSpeed()).toBe(1.5);
  });
});

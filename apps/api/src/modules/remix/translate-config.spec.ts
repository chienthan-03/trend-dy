import { describe, expect, it, afterEach } from "vitest";
import {
  getGoogleTranslateApiKey,
  getGoogleTranslateSourceLang,
  getHfApiToken,
  getTranslateBatchDelayMs,
  getTranslateLlmBatchSize,
  getTranslateMaxRetries,
  getTranslateMode,
  getTranslateModel,
  getTranslateProvider,
  isTranslateEnabled,
  resolveTranslateMode,
  shouldSkipRemixGenerate,
} from "./translate-config";

describe("translate-config", () => {
  afterEach(() => {
    delete process.env.REMIX_TRANSLATE_ENABLED;
    delete process.env.REMIX_TRANSLATE_MODE;
    delete process.env.REMIX_TRANSLATE_PROVIDER;
    delete process.env.REMIX_TRANSLATE_MODEL;
    delete process.env.HF_API_TOKEN;
    delete process.env.GOOGLE_TRANSLATE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.LLM_MODE;
    delete process.env.LLM_MODEL;
    delete process.env.REMIX_TRANSLATE_BATCH_DELAY_MS;
    delete process.env.REMIX_TRANSLATE_MAX_RETRIES;
    delete process.env.REMIX_TRANSLATE_SOURCE_LANG;
    delete process.env.REMIX_SKIP_GENERATE;
  });

  it("enables translation by default", () => {
    expect(isTranslateEnabled()).toBe(true);
  });

  it("defaults provider to llm", () => {
    expect(getTranslateProvider()).toBe("llm");
  });

  it("uses configured LLM model by default", () => {
    process.env.LLM_MODEL = "openai/gpt-4o-mini";
    expect(getTranslateModel()).toBe("openai/gpt-4o-mini");
  });

  it("uses live llm mode when OpenAI key is present", () => {
    process.env.REMIX_TRANSLATE_MODE = "live";
    process.env.OPENAI_API_KEY = "sk_test";
    expect(resolveTranslateMode()).toBe("live");
  });

  it("reads batch and skip settings", () => {
    process.env.REMIX_TRANSLATE_LLM_BATCH_SIZE = "20";
    process.env.REMIX_SKIP_GENERATE = "true";

    expect(getTranslateLlmBatchSize()).toBe(20);
    expect(shouldSkipRemixGenerate()).toBe(true);
  });

  it("reads Google and HF settings", () => {
    process.env.REMIX_TRANSLATE_PROVIDER = "google";
    process.env.GOOGLE_TRANSLATE_API_KEY = "gcp_key";
    process.env.REMIX_TRANSLATE_SOURCE_LANG = "zh-CN";
    process.env.HF_API_TOKEN = "hf_abc";
    process.env.REMIX_TRANSLATE_BATCH_DELAY_MS = "100";
    process.env.REMIX_TRANSLATE_MAX_RETRIES = "3";

    expect(getGoogleTranslateApiKey()).toBe("gcp_key");
    expect(getGoogleTranslateSourceLang()).toBe("zh-CN");
    expect(getHfApiToken()).toBe("hf_abc");
    expect(getTranslateBatchDelayMs()).toBe(100);
    expect(getTranslateMaxRetries()).toBe(3);
  });

  it("falls back to fake when huggingface live mode has no HF token", () => {
    process.env.REMIX_TRANSLATE_MODE = "live";
    process.env.REMIX_TRANSLATE_PROVIDER = "huggingface";
    expect(resolveTranslateMode()).toBe("fake");
  });
});

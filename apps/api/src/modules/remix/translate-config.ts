export const isTranslateEnabled = (): boolean => {
  const raw = process.env.REMIX_TRANSLATE_ENABLED?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") {
    return false;
  }
  return true;
};

export type TranslateMode = "fake" | "live";

export const getTranslateMode = (): TranslateMode => {
  const raw = process.env.REMIX_TRANSLATE_MODE?.trim().toLowerCase();
  return raw === "live" ? "live" : "fake";
};

export type TranslateProvider = "llm" | "google" | "huggingface";

export const getTranslateProvider = (): TranslateProvider => {
  const raw = process.env.REMIX_TRANSLATE_PROVIDER?.trim().toLowerCase();
  if (raw === "google") return "google";
  if (raw === "huggingface") return "huggingface";
  return "llm";
};

const hasLlmCredentials = (): boolean => {
  if (process.env.LLM_MODE?.trim().toLowerCase() === "fake") {
    return false;
  }
  return Boolean(process.env.OPENAI_API_KEY?.trim());
};

/** Use fake when live is configured but required credentials are missing. */
export const resolveTranslateMode = (): TranslateMode => {
  if (getTranslateMode() === "fake") {
    return "fake";
  }

  const provider = getTranslateProvider();
  if (provider === "huggingface") {
    return getHfApiToken() ? "live" : "fake";
  }
  if (provider === "llm") {
    return hasLlmCredentials() ? "live" : "fake";
  }

  return "live";
};

export const getTranslateModel = (): string => {
  const provider = getTranslateProvider();

  if (provider === "llm") {
    return (
      process.env.REMIX_TRANSLATE_LLM_MODEL?.trim() ||
      process.env.LLM_MODEL?.trim() ||
      "gpt-4o-mini"
    );
  }

  if (provider === "google") {
    return (
      process.env.GOOGLE_TRANSLATE_API_KEY?.trim() ||
      "google-translate-web"
    );
  }

  return (
    process.env.REMIX_TRANSLATE_MODEL?.trim() || "Helsinki-NLP/opus-mt-zh-vi"
  );
};

export const getTranslateLlmBatchSize = (): number => {
  const n = Number(process.env.REMIX_TRANSLATE_LLM_BATCH_SIZE ?? "30");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
};

export const getGoogleTranslateApiKey = (): string | undefined => {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  return key || undefined;
};

/** Source language for Google. Use `auto` to detect mixed zh/en segments. */
export const getGoogleTranslateSourceLang = (): string =>
  process.env.REMIX_TRANSLATE_SOURCE_LANG?.trim() || "auto";

export const getHfApiToken = (): string | undefined => {
  const token = process.env.HF_API_TOKEN?.trim();
  return token || undefined;
};

export const getTranslateApiBaseUrl = (): string =>
  (
    process.env.REMIX_TRANSLATE_API_URL?.trim() ||
    "https://router.huggingface.co/hf-inference"
  ).replace(/\/$/, "");

/** Delay between segment requests to avoid rate limits. */
export const getTranslateBatchDelayMs = (): number => {
  const n = Number(process.env.REMIX_TRANSLATE_BATCH_DELAY_MS ?? "250");
  return Number.isFinite(n) && n >= 0 ? n : 250;
};

export const getTranslateMaxRetries = (): number => {
  const n = Number(process.env.REMIX_TRANSLATE_MAX_RETRIES ?? "5");
  return Number.isFinite(n) && n > 0 ? n : 5;
};

/** Chunk size for Google/HF per request. */
export const getTranslateMaxChars = (): number => {
  const n = Number(process.env.REMIX_TRANSLATE_MAX_CHARS ?? "4500");
  return Number.isFinite(n) && n > 50 ? n : 4500;
};

/** Skip remix_generate after translation — useful when only transcript VI is needed. */
export const shouldSkipRemixGenerate = (): boolean => {
  const raw = process.env.REMIX_SKIP_GENERATE?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "on";
};

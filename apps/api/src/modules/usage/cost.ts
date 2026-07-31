export type LlmCostRates = {
  inputPer1kUsd: number;
  outputPer1kUsd: number;
};

const EMBEDDING_COST_PER_1K_USD = 0.00002;

/** OpenRouter list prices (USD per 1M tokens → per 1k). */
const MODEL_LLM_RATES: Array<{ pattern: RegExp; rates: LlmCostRates }> = [
  {
    pattern: /gpt-4\.1-mini/,
    rates: { inputPer1kUsd: 0.0004, outputPer1kUsd: 0.0016 },
  },
  {
    pattern: /gpt-4\.1-nano/,
    rates: { inputPer1kUsd: 0.0001, outputPer1kUsd: 0.0004 },
  },
  {
    pattern: /gpt-4\.1(?!-mini|-nano)/,
    rates: { inputPer1kUsd: 0.002, outputPer1kUsd: 0.008 },
  },
  {
    pattern: /claude.*haiku/,
    rates: { inputPer1kUsd: 0.0008, outputPer1kUsd: 0.004 },
  },
  {
    pattern: /claude.*sonnet/,
    rates: { inputPer1kUsd: 0.003, outputPer1kUsd: 0.015 },
  },
  {
    pattern: /gemini.*flash/,
    rates: { inputPer1kUsd: 0.0001, outputPer1kUsd: 0.0004 },
  },
  {
    pattern: /gemini.*pro/,
    rates: { inputPer1kUsd: 0.00125, outputPer1kUsd: 0.005 },
  },
  {
    pattern: /deepseek/,
    rates: { inputPer1kUsd: 0.00055, outputPer1kUsd: 0.00219 },
  },
];

const DEFAULT_LLM_RATES: LlmCostRates = {
  inputPer1kUsd: 0.00015,
  outputPer1kUsd: 0.0006,
};

const readEnvLlmRates = (): LlmCostRates | null => {
  const input = Number(process.env.REMIX_LLM_INPUT_COST_PER_1K_USD);
  const output = Number(process.env.REMIX_LLM_OUTPUT_COST_PER_1K_USD);
  if (
    Number.isFinite(input) &&
    input >= 0 &&
    Number.isFinite(output) &&
    output >= 0
  ) {
    return { inputPer1kUsd: input, outputPer1kUsd: output };
  }
  return null;
};

export const inferLlmCostRates = (model?: string | null): LlmCostRates => {
  const slug = (model ?? "").trim().toLowerCase();
  if (!slug) return DEFAULT_LLM_RATES;

  for (const entry of MODEL_LLM_RATES) {
    if (entry.pattern.test(slug)) {
      return entry.rates;
    }
  }

  return DEFAULT_LLM_RATES;
};

/** Resolve LLM token rates: explicit env override, else model slug lookup. */
export const resolveLlmCostRates = (model?: string | null): LlmCostRates => {
  const fromEnv = readEnvLlmRates();
  if (fromEnv) return fromEnv;
  return inferLlmCostRates(model);
};

export const estimateEmbeddingCostUsd = (tokensIn: number): number =>
  (tokensIn / 1000) * EMBEDDING_COST_PER_1K_USD;

export const estimateLlmCostUsd = (
  tokensIn: number,
  tokensOut: number,
  model?: string | null,
): number => {
  const { inputPer1kUsd, outputPer1kUsd } = resolveLlmCostRates(model);
  return (
    (tokensIn / 1000) * inputPer1kUsd + (tokensOut / 1000) * outputPer1kUsd
  );
};

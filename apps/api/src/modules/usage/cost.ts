const EMBEDDING_COST_PER_1K_USD = 0.00002;
const LLM_INPUT_COST_PER_1K_USD = 0.00015;
const LLM_OUTPUT_COST_PER_1K_USD = 0.0006;

export const estimateEmbeddingCostUsd = (tokensIn: number): number =>
  (tokensIn / 1000) * EMBEDDING_COST_PER_1K_USD;

export const estimateLlmCostUsd = (
  tokensIn: number,
  tokensOut: number,
): number =>
  (tokensIn / 1000) * LLM_INPUT_COST_PER_1K_USD +
  (tokensOut / 1000) * LLM_OUTPUT_COST_PER_1K_USD;

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  estimateLlmCostUsd,
  inferLlmCostRates,
  resolveLlmCostRates,
} from "./cost";

describe("cost", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.REMIX_LLM_INPUT_COST_PER_1K_USD;
    delete process.env.REMIX_LLM_OUTPUT_COST_PER_1K_USD;
  });

  afterEach(() => {
    process.env = env;
  });

  it("uses fallback rates for GPT-5.6 Luna", () => {
    const rates = inferLlmCostRates("openai/gpt-5.6-luna");
    expect(rates.inputPer1kUsd).toBe(0.00015);
    expect(rates.outputPer1kUsd).toBe(0.0006);
  });

  it("prefers env override over model lookup", () => {
    process.env.REMIX_LLM_INPUT_COST_PER_1K_USD = "0.001";
    process.env.REMIX_LLM_OUTPUT_COST_PER_1K_USD = "0.002";
    const rates = resolveLlmCostRates("openai/gpt-5.6-luna");
    expect(rates.inputPer1kUsd).toBe(0.001);
    expect(rates.outputPer1kUsd).toBe(0.002);
  });

  it("estimates GPT-5.6 Luna cost using fallback rates", () => {
    const cost = estimateLlmCostUsd(1000, 1000, "openai/gpt-5.6-luna");
    expect(cost).toBeCloseTo(0.00075, 6);
  });
});

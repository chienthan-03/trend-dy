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

  it("infers gpt-4o-mini rates", () => {
    const rates = inferLlmCostRates("openai/gpt-4o-mini");
    expect(rates.inputPer1kUsd).toBe(0.00015);
    expect(rates.outputPer1kUsd).toBe(0.0006);
  });

  it("infers gpt-4o rates", () => {
    const rates = inferLlmCostRates("openai/gpt-4o");
    expect(rates.inputPer1kUsd).toBe(0.0025);
    expect(rates.outputPer1kUsd).toBe(0.01);
  });

  it("prefers env override over model lookup", () => {
    process.env.REMIX_LLM_INPUT_COST_PER_1K_USD = "0.001";
    process.env.REMIX_LLM_OUTPUT_COST_PER_1K_USD = "0.002";
    const rates = resolveLlmCostRates("openai/gpt-4o");
    expect(rates.inputPer1kUsd).toBe(0.001);
    expect(rates.outputPer1kUsd).toBe(0.002);
  });

  it("estimates LLM cost using model slug", () => {
    const mini = estimateLlmCostUsd(1000, 1000, "openai/gpt-4o-mini");
    const full = estimateLlmCostUsd(1000, 1000, "openai/gpt-4o");
    expect(full).toBeGreaterThan(mini * 10);
    expect(mini).toBeCloseTo(0.00075, 6);
    expect(full).toBeCloseTo(0.0125, 6);
  });
});

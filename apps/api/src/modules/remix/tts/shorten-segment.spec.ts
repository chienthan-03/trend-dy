import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const completeTextMock = vi.fn();

vi.mock("../../../ai/gateway", () => ({
  completeText: completeTextMock,
}));

describe("shortenSegmentText", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    completeTextMock.mockReset();
  });

  afterEach(() => {
    process.env = env;
  });

  it("shortens locally without calling the LLM when REMIX_TTS_MODE=fake", async () => {
    process.env.REMIX_TTS_MODE = "fake";
    delete process.env.LLM_MODE;
    const { shortenSegmentText } = await import("./shorten-segment");

    const original = "Đây là một câu rất dài cần được rút ngắn lại cho vừa khung thời gian";
    const result = await shortenSegmentText({ text: original, targetDurationSec: 2 });

    expect(completeTextMock).not.toHaveBeenCalled();
    expect(result.text.length).toBeLessThan(original.length);
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("shortens locally without calling the LLM when LLM_MODE=fake", async () => {
    delete process.env.REMIX_TTS_MODE;
    process.env.LLM_MODE = "fake";
    const { shortenSegmentText } = await import("./shorten-segment");

    const original = "one two three four five six seven eight";
    const result = await shortenSegmentText({ text: original, targetDurationSec: 2 });

    expect(completeTextMock).not.toHaveBeenCalled();
    expect(result.text).toBe("one two three four five");
  });

  it("returns empty text unchanged", async () => {
    process.env.REMIX_TTS_MODE = "fake";
    const { shortenSegmentText } = await import("./shorten-segment");

    const result = await shortenSegmentText({ text: "   ", targetDurationSec: 2 });
    expect(result.text).toBe("");
    expect(completeTextMock).not.toHaveBeenCalled();
  });

  it("defaults to local shorten without LLM (avoids OpenRouter burn on fine cues)", async () => {
    delete process.env.REMIX_TTS_MODE;
    delete process.env.LLM_MODE;
    delete process.env.REMIX_TTS_SHORTEN_MODE;
    vi.resetModules();
    const { shortenSegmentText } = await import("./shorten-segment");

    const original = "one two three four five six seven eight";
    const result = await shortenSegmentText({ text: original, targetDurationSec: 2 });

    expect(completeTextMock).not.toHaveBeenCalled();
    expect(result.text).toBe("one two three four five");
  });

  it("calls completeText when REMIX_TTS_SHORTEN_MODE=llm and strips wrapping quotes", async () => {
    delete process.env.REMIX_TTS_MODE;
    delete process.env.LLM_MODE;
    process.env.REMIX_TTS_SHORTEN_MODE = "llm";
    vi.resetModules();
    completeTextMock.mockResolvedValue({
      text: '"Câu ngắn hơn"',
      model: "gpt-4.1-mini",
      tokensIn: 20,
      tokensOut: 8,
      provider: "openai",
    });
    const { shortenSegmentText } = await import("./shorten-segment");

    const result = await shortenSegmentText({
      text: "Một câu dài cần rút ngắn",
      targetDurationSec: 1.5,
    });

    expect(completeTextMock).toHaveBeenCalledWith(
      expect.stringContaining("Một câu dài cần rút ngắn"),
      expect.objectContaining({ type: "remix_shorten_segment" }),
    );
    expect(result.text).toBe("Câu ngắn hơn");
    expect(result.tokensIn).toBe(20);
    expect(result.tokensOut).toBe(8);
  });

  it("falls back to local shortening when the LLM returns empty text", async () => {
    delete process.env.REMIX_TTS_MODE;
    delete process.env.LLM_MODE;
    process.env.REMIX_TTS_SHORTEN_MODE = "llm";
    vi.resetModules();
    completeTextMock.mockResolvedValue({
      text: "   ",
      model: "gpt-4.1-mini",
      tokensIn: 5,
      tokensOut: 0,
      provider: "openai",
    });
    const { shortenSegmentText } = await import("./shorten-segment");

    const original = "one two three four five six seven eight";
    const result = await shortenSegmentText({ text: original, targetDurationSec: 1 });

    expect(result.text).toBe("one two three four five");
  });
});

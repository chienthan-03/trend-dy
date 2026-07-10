import { describe, expect, it } from "vitest";
import { chunkText, estimateTokens } from "./chunker";

/** Build prose of roughly `targetTokens` using words*1.3 approximation. */
const makeProse = (targetTokens: number): string => {
  const wordsNeeded = Math.ceil(targetTokens / 1.3);
  return Array.from({ length: wordsNeeded }, (_, i) => `word${i}`).join(" ");
};

describe("estimateTokens", () => {
  it("approximates tokens as words * 1.3", () => {
    expect(estimateTokens("one two three")).toBe(Math.ceil(3 * 1.3));
  });

  it("falls back to chars/4 when there are no word breaks", () => {
    const text = "a".repeat(40);
    expect(estimateTokens(text)).toBe(Math.ceil(40 / 4));
  });
});

describe("chunkText", () => {
  it("returns a single chunk for short text under the window", () => {
    const text = makeProse(200);
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe(text);
    expect(chunks[0]?.ordinal).toBe(0);
    expect(chunks[0]?.tokenEstimate).toBeGreaterThan(0);
    expect(chunks[0]?.tokenEstimate).toBeLessThanOrEqual(1200);
  });

  it("splits long text into ~800–1200 token windows", () => {
    const text = makeProse(3500);
    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(2);
    const nonLast = chunks.slice(0, -1);
    for (const chunk of nonLast) {
      expect(chunk.tokenEstimate).toBeGreaterThanOrEqual(800);
      expect(chunk.tokenEstimate).toBeLessThanOrEqual(1200);
    }
    // Last chunk may be smaller than the min window
    const last = chunks[chunks.length - 1]!;
    expect(last.tokenEstimate).toBeGreaterThan(0);
    expect(last.tokenEstimate).toBeLessThanOrEqual(1200);
  });

  it("overlaps consecutive chunks by ~100 tokens", () => {
    const text = makeProse(2500);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    const a = chunks[0]!.text;
    const b = chunks[1]!.text;
    // Find shared suffix/prefix overlap
    const aWords = a.split(/\s+/);
    const bWords = b.split(/\s+/);
    let overlapWords = 0;
    for (let n = Math.min(aWords.length, bWords.length); n > 0; n--) {
      const suffix = aWords.slice(-n).join(" ");
      const prefix = bWords.slice(0, n).join(" ");
      if (suffix === prefix) {
        overlapWords = n;
        break;
      }
    }
    const overlapTokens = Math.ceil(overlapWords * 1.3);
    expect(overlapTokens).toBeGreaterThanOrEqual(80);
    expect(overlapTokens).toBeLessThanOrEqual(130);
  });

  it("assigns sequential ordinals starting at 0", () => {
    const chunks = chunkText(makeProse(2500));
    expect(chunks.map((c) => c.ordinal)).toEqual(
      chunks.map((_, i) => i),
    );
  });
});

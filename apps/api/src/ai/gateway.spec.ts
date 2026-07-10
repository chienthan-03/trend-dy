import { describe, expect, it } from "vitest";
import { embedTexts } from "./gateway";

describe("embedTexts", () => {
  it("returns deterministic fake embeddings in fake mode", async () => {
    process.env.EMBEDDING_MODE = "fake";

    const result = await embedTexts(["hello world", "hello world"]);

    expect(result.provider).toBe("fake");
    expect(result.embeddings).toHaveLength(2);
    expect(result.embeddings[0]).toHaveLength(1536);
    expect(result.embeddings[0]).toEqual(result.embeddings[1]);
    expect(result.tokensIn).toBeGreaterThan(0);
  });

  it("returns empty embeddings for empty input", async () => {
    process.env.EMBEDDING_MODE = "fake";

    const result = await embedTexts([]);

    expect(result.embeddings).toEqual([]);
    expect(result.tokensIn).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyGenre } from "./genre-classifier";

describe("classifyGenre", () => {
  const previousLlmMode = process.env.LLM_MODE;

  beforeEach(() => {
    process.env.LLM_MODE = "fake";
  });

  afterEach(() => {
    if (previousLlmMode === undefined) {
      delete process.env.LLM_MODE;
    } else {
      process.env.LLM_MODE = previousLlmMode;
    }
  });

  it("detects genre from hashtags and caption via rules", async () => {
    const result = await classifyGenre({
      boardGenre: "web_novel",
      caption: "Top manhwa recap của tuần #manhwa_recap #viral",
      hashtags: ["manhwa_recap", "viral"],
    });

    expect(result.genres).toContain("manhwa_recap");
    expect(result.genreConfidence).toBeGreaterThan(0.5);
    expect(result.genreSource).toBe("ai");
  });

  it("seeds from board genre when caption has no strong genre signal", async () => {
    const result = await classifyGenre({
      boardGenre: "cultivation",
      caption: "Viral clip hay nhất hôm nay",
      hashtags: ["viral", "hot"],
    });

    expect(result.genres[0]).toBe("cultivation");
    expect(result.genreSource).toBe("board");
  });

  it("includes secondary genres when multiple signals appear", async () => {
    const result = await classifyGenre({
      boardGenre: "fantasy",
      caption: "Regression + system build mạnh #regression #system",
      hashtags: ["regression", "system", "fantasy"],
    });

    expect(result.genres).toEqual(
      expect.arrayContaining(["regression", "system"]),
    );
  });
});

import { GENRES, type Genre } from "@factory/shared";
import { z } from "zod";
import { completeJson } from "../../ai/gateway";

export type GenreClassifyInput = {
  boardGenre: string;
  caption: string | null;
  hashtags: string[];
};

export type GenreClassifyResult = {
  genres: string[];
  genreConfidence: number;
  genreSource: "board" | "ai";
};

const genreClassifySchema = z.object({
  genres: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
});

const GENRE_KEYWORDS: Record<Genre, string[]> = {
  movie_recap: ["movie_recap", "movie", "phim"],
  anime_recap: ["anime_recap", "anime"],
  manhwa_recap: ["manhwa_recap", "manhwa"],
  manhua_recap: ["manhua_recap", "manhua"],
  motion_comic: ["motion_comic", "motion comic"],
  web_novel: ["web_novel", "truyện", "novel"],
  regression: ["regression", "hồi quy"],
  apocalypse: ["apocalypse", "tận thế"],
  system: ["system", "hệ thống"],
  cultivation: ["cultivation", "tu tiên", "tu luyện"],
  fantasy: ["fantasy", "huyễn"],
  zombie: ["zombie", "xác sống"],
  survival: ["survival", "sinh tồn"],
};

const normalizeText = (caption: string | null, hashtags: string[]): string =>
  `${caption ?? ""} ${hashtags.join(" ")}`.toLowerCase();

const scoreGenreMatches = (
  text: string,
): Array<{ genre: Genre; score: number }> => {
  const matches: Array<{ genre: Genre; score: number }> = [];

  for (const genre of GENRES) {
    const keywords = GENRE_KEYWORDS[genre];
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += keyword.includes("_") ? 2 : 1;
      }
    }
    if (score > 0) {
      matches.push({ genre, score });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
};

const classifyWithRules = (
  input: GenreClassifyInput,
): GenreClassifyResult | null => {
  const text = normalizeText(input.caption, input.hashtags);
  const matches = scoreGenreMatches(text);

  if (matches.length === 0) {
    return null;
  }

  const genres = matches.map((match) => match.genre);
  const topScore = matches[0]!.score;
  const confidence = Math.min(0.95, 0.55 + topScore * 0.1);

  return {
    genres,
    genreConfidence: confidence,
    genreSource: "ai",
  };
};

export const classifyGenre = async (
  input: GenreClassifyInput,
): Promise<GenreClassifyResult> => {
  const rulesResult = classifyWithRules(input);
  if (rulesResult) {
    return rulesResult;
  }

  if (process.env.LLM_MODE !== "fake") {
    const prompt = [
      "Classify Douyin viral item genres from caption and hashtags.",
      `Board seed genre: ${input.boardGenre}`,
      `Caption: ${input.caption ?? ""}`,
      `Hashtags: ${input.hashtags.join(", ")}`,
      `Allowed genres: ${GENRES.join(", ")}`,
      "Return JSON { genres: string[], confidence: number }.",
    ].join("\n");

    const llm = await completeJson(prompt, genreClassifySchema, {
      system: "You classify short-form video genres for a content studio.",
    });

    const genres = llm.data.genres.filter((genre): genre is Genre =>
      (GENRES as readonly string[]).includes(genre),
    );

    if (genres.length > 0) {
      return {
        genres,
        genreConfidence: llm.data.confidence,
        genreSource: "ai",
      };
    }
  }

  return {
    genres: [input.boardGenre],
    genreConfidence: 0.5,
    genreSource: "board",
  };
};

import type { Genre } from "@factory/shared";

export type GenreBoardDefaults = {
  keyword: string;
  contentType: string;
};

/** Default search keyword + Just One API contentType per studio genre. */
export const GENRE_BOARD_DEFAULTS: Partial<Record<Genre, GenreBoardDefaults>> = {
  movie_recap: { keyword: "电影解说", contentType: "MOVIE" },
  anime_recap: { keyword: "动漫解说", contentType: "ACG" },
  manhwa_recap: { keyword: "韩漫解说", contentType: "DRAMA" },
  manhua_recap: { keyword: "国漫解说", contentType: "ACG" },
  motion_comic: { keyword: "漫剧", contentType: "DRAMA" },
  web_novel: { keyword: "小说推文", contentType: "DRAMA" },
  regression: { keyword: "重生小说", contentType: "DRAMA" },
  apocalypse: { keyword: "末世小说", contentType: "DRAMA" },
  system: { keyword: "系统流", contentType: "GAME" },
  cultivation: { keyword: "修仙小说", contentType: "DRAMA" },
  fantasy: { keyword: "玄幻小说", contentType: "DRAMA" },
  zombie: { keyword: "丧尸小说", contentType: "DRAMA" },
  survival: { keyword: "生存小说", contentType: "DRAMA" },
};

export const resolveBoardSearch = (
  boardKey: string,
  genre: string | undefined,
  config: Record<string, unknown>,
): { keyword: string; contentType: string } => {
  if (typeof config.keyword === "string" && config.keyword.trim()) {
    return {
      keyword: config.keyword.trim(),
      contentType:
        typeof config.contentType === "string" && config.contentType.trim()
          ? config.contentType.trim()
          : "ALL",
    };
  }

  const genreFromKey = boardKey.split(":").pop();
  const genreSlug = (genre ?? genreFromKey ?? "web_novel") as Genre;
  const defaults = GENRE_BOARD_DEFAULTS[genreSlug];

  return {
    keyword: defaults?.keyword ?? "小说推文",
    contentType: defaults?.contentType ?? "ALL",
  };
};

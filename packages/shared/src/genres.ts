export const GENRES = [
  "movie_recap", "anime_recap", "manhwa_recap", "manhua_recap",
  "motion_comic", "web_novel", "regression", "apocalypse",
  "system", "cultivation", "fantasy", "zombie", "survival",
] as const;
export type Genre = (typeof GENRES)[number];
export const VIRAL_TIERS = ["S", "A", "B", "C"] as const;
export type ViralTier = (typeof VIRAL_TIERS)[number];

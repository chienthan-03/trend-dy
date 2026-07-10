import { VIRAL_TIERS, type ViralTier } from "@factory/shared";

export type TierScoreInput = {
  id: string;
  genre: string;
  rankPosition: number | null;
  caption: string | null;
  stats: Record<string, number> | null;
  previousStats?: Record<string, number> | null;
};

export type TierScoreResult = {
  id: string;
  trendScore: number;
  tier: ViralTier;
};

const TIER_QUOTAS: Record<ViralTier, number> = {
  S: 0.125,
  A: 0.25,
  B: 0.35,
  C: 0.275,
};

const statTotal = (stats: Record<string, number> | null | undefined): number => {
  if (!stats) {
    return 0;
  }
  return Object.values(stats).reduce((sum, value) => sum + value, 0);
};

const velocityScore = (
  current: Record<string, number> | null,
  previous: Record<string, number> | null | undefined,
): number => {
  const currentTotal = statTotal(current);
  const previousTotal = statTotal(previous);
  if (previousTotal <= 0) {
    return currentTotal > 0 ? 0.35 : 0;
  }
  const delta = (currentTotal - previousTotal) / previousTotal;
  return Math.max(0, Math.min(1, delta));
};

const rankScore = (rankPosition: number | null): number => {
  if (!rankPosition || rankPosition <= 0) {
    return 0.2;
  }
  return 1 / Math.log2(rankPosition + 1);
};

const captionRubric = (caption: string | null): number => {
  if (!caption) {
    return 0.1;
  }
  const lengthScore = Math.min(1, caption.length / 120);
  const hookWords = /hook|bí mật|không ngờ|xem ngay|#|!/i.test(caption)
    ? 0.25
    : 0;
  return Math.min(1, lengthScore * 0.75 + hookWords);
};

export const computeTrendScore = (input: TierScoreInput): number => {
  const engagement = Math.min(1, statTotal(input.stats) / 50_000);
  const velocity = velocityScore(input.stats, input.previousStats);
  const rank = rankScore(input.rankPosition);
  const rubric = captionRubric(input.caption);

  const trendScore =
    rank * 0.35 + velocity * 0.3 + engagement * 0.2 + rubric * 0.15;

  return Math.round(trendScore * 1000) / 1000;
};

const assignTiers = (
  rows: Array<{ id: string; trendScore: number }>,
): Map<string, ViralTier> => {
  const sorted = [...rows].sort((a, b) => b.trendScore - a.trendScore);
  const tiers = new Map<string, ViralTier>();
  const total = sorted.length;

  if (total === 0) {
    return tiers;
  }

  let cursor = 0;
  for (const tier of VIRAL_TIERS) {
    const count = Math.max(1, Math.round(total * TIER_QUOTAS[tier]));
    const slice = sorted.slice(cursor, cursor + count);
    for (const row of slice) {
      tiers.set(row.id, tier);
    }
    cursor += count;
    if (cursor >= total) {
      break;
    }
  }

  for (const row of sorted) {
    if (!tiers.has(row.id)) {
      tiers.set(row.id, "C");
    }
  }

  return tiers;
};

export const scoreItemsWithinGenre = (
  items: TierScoreInput[],
): TierScoreResult[] => {
  const byGenre = new Map<string, TierScoreInput[]>();

  for (const item of items) {
    const bucket = byGenre.get(item.genre) ?? [];
    bucket.push(item);
    byGenre.set(item.genre, bucket);
  }

  const results: TierScoreResult[] = [];

  for (const genreItems of byGenre.values()) {
    const scored = genreItems.map((item) => ({
      id: item.id,
      trendScore: computeTrendScore(item),
    }));
    const tierMap = assignTiers(scored);

    for (const row of scored) {
      results.push({
        id: row.id,
        trendScore: row.trendScore,
        tier: tierMap.get(row.id) ?? "C",
      });
    }
  }

  return results.sort((a, b) => b.trendScore - a.trendScore);
};

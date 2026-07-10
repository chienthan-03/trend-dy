import { createHash } from "node:crypto";
import type { DouyinRankItem, DouyinRankingAdapter } from "../douyin-ranking.adapter";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

const slugFromBoardKey = (boardKey: string): string => {
  const segment = boardKey.split(":").pop() ?? boardKey;
  return segment.replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
};

const hashSeed = (boardKey: string, rankPosition: number): string =>
  createHash("sha256").update(`${boardKey}:${rankPosition}`).digest("hex").slice(0, 12);

const buildFixtureItem = (boardKey: string, rankPosition: number): DouyinRankItem => {
  const slug = slugFromBoardKey(boardKey);
  const seed = hashSeed(boardKey, rankPosition);
  const publishedAt = new Date(Date.UTC(2026, 0, rankPosition, 12, 0, 0));

  return {
    externalId: `fake-${seed}`,
    rankPosition,
    title: `[fake:${slug}] Viral recap #${rankPosition}`,
    caption: `Fixture caption for ${slug} board rank ${rankPosition}. #${slug} #viral`,
    authorHandle: `@fake_${slug}_${rankPosition}`,
    stats: {
      likes: 10_000 + rankPosition * 1_337,
      comments: 100 + rankPosition * 17,
      shares: 50 + rankPosition * 9,
    },
    hashtags: [slug, "viral", "recap"],
    coverUrl: `https://example.test/fake/${seed}/cover.jpg`,
    canonicalUrl: `https://example.test/fake/${seed}`,
    publishedAt,
    rawPayload: {
      boardKey,
      rankPosition,
      source: "fake-douyin-adapter",
    },
  };
};

export class FakeDouyinAdapter implements DouyinRankingAdapter {
  async fetchBoard(
    boardKey: string,
    config: Record<string, unknown>,
  ): Promise<DouyinRankItem[]> {
    const requestedLimit =
      typeof config.limit === "number" && Number.isFinite(config.limit)
        ? Math.trunc(config.limit)
        : DEFAULT_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);

    return Array.from({ length: limit }, (_, index) =>
      buildFixtureItem(boardKey, index + 1),
    );
  }
}

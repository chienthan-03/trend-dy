import { describe, expect, it } from "vitest";
import { scoreItemsWithinGenre, type TierScoreInput } from "./tier-scorer";

const baseItem = (
  overrides: Partial<TierScoreInput> & Pick<TierScoreInput, "id">,
): TierScoreInput => ({
  genre: "fantasy",
  rankPosition: 5,
  caption: "Epic fantasy recap hook",
  stats: { likes: 10_000, comments: 500, shares: 200 },
  previousStats: { likes: 8_000, comments: 400, shares: 150 },
  ...overrides,
});

describe("scoreItemsWithinGenre", () => {
  it("ranks and tiers items independently per genre", () => {
    const items: TierScoreInput[] = [
      baseItem({ id: "a", genre: "fantasy", rankPosition: 1 }),
      baseItem({ id: "b", genre: "fantasy", rankPosition: 10 }),
      baseItem({ id: "c", genre: "zombie", rankPosition: 1 }),
      baseItem({ id: "d", genre: "zombie", rankPosition: 8 }),
    ];

    const scored = scoreItemsWithinGenre(items);
    const byId = Object.fromEntries(scored.map((row) => [row.id, row]));

    expect(byId.a!.tier).toBe("S");
    expect(byId.c!.tier).toBe("S");
    expect(byId.b!.trendScore).toBeLessThan(byId.a!.trendScore);
    expect(byId.d!.trendScore).toBeLessThan(byId.c!.trendScore);
  });

  it("boosts trend score when velocity is positive", () => {
    const rising = baseItem({
      id: "rising",
      previousStats: { likes: 1_000, comments: 50, shares: 20 },
      stats: { likes: 5_000, comments: 300, shares: 120 },
    });
    const flat = baseItem({
      id: "flat",
      previousStats: { likes: 5_000, comments: 300, shares: 120 },
      stats: { likes: 5_000, comments: 300, shares: 120 },
    });

    const [risingScore, flatScore] = scoreItemsWithinGenre([rising, flat]);

    expect(risingScore!.trendScore).toBeGreaterThan(flatScore!.trendScore);
  });

  it("assigns S/A/B/C tiers by relative trend score within a genre", () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      baseItem({
        id: `item-${index}`,
        rankPosition: index + 1,
        stats: {
          likes: 20_000 - index * 1_500,
          comments: 800 - index * 50,
          shares: 400 - index * 30,
        },
        previousStats: {
          likes: 15_000 - index * 1_000,
          comments: 600 - index * 40,
          shares: 300 - index * 20,
        },
      }),
    );

    const scored = scoreItemsWithinGenre(items);
    const tiers = scored.map((row) => row.tier);

    expect(tiers).toContain("S");
    expect(tiers).toContain("A");
    expect(tiers).toContain("B");
    expect(tiers).toContain("C");
    expect(scored[0]!.tier).toBe("S");
    expect(scored[scored.length - 1]!.tier).toBe("C");
  });
});

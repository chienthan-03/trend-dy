import { describe, expect, it } from "vitest";
import { createDouyinAdapter } from "../douyin-ranking.adapter";
import { FakeDouyinAdapter } from "./fake-douyin.adapter";

describe("FakeDouyinAdapter", () => {
  const adapter = new FakeDouyinAdapter();

  it("returns deterministic items for the same boardKey", async () => {
    const first = await adapter.fetchBoard("douyin:hot:movie_recap", {});
    const second = await adapter.fetchBoard("douyin:hot:movie_recap", {});

    expect(first).toEqual(second);
  });

  it("returns different items for different boardKeys", async () => {
    const movie = await adapter.fetchBoard("douyin:hot:movie_recap", {});
    const anime = await adapter.fetchBoard("douyin:hot:anime_recap", {});

    expect(movie[0]?.externalId).not.toBe(anime[0]?.externalId);
    expect(movie[0]?.title).not.toBe(anime[0]?.title);
  });

  it("returns normalized rank items with required metadata fields", async () => {
    const items = await adapter.fetchBoard("douyin:hot:manhwa_recap", {});

    expect(items.length).toBeGreaterThan(0);

    for (const [index, item] of items.entries()) {
      expect(item.externalId).toMatch(/^fake-/);
      expect(item.rankPosition).toBe(index + 1);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.caption.length).toBeGreaterThan(0);
      expect(item.authorHandle.length).toBeGreaterThan(0);
      expect(item.stats).toMatchObject({
        likes: expect.any(Number),
        comments: expect.any(Number),
        shares: expect.any(Number),
      });
      expect(item.hashtags.length).toBeGreaterThan(0);
      expect(item.rawPayload).toMatchObject({ boardKey: "douyin:hot:manhwa_recap" });
    }
  });

  it("respects config.limit when provided", async () => {
    const items = await adapter.fetchBoard("douyin:hot:fantasy", { limit: 2 });

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.rankPosition)).toEqual([1, 2]);
  });
});

describe("createDouyinAdapter", () => {
  it("defaults to the fake adapter", async () => {
    const previous = process.env.DOUYIN_ADAPTER;
    delete process.env.DOUYIN_ADAPTER;

    try {
      const adapter = await createDouyinAdapter();
      const items = await adapter.fetchBoard("douyin:hot:system", {});

      expect(items.length).toBeGreaterThan(0);
      expect(items[0]?.externalId).toMatch(/^fake-/);
    } finally {
      if (previous === undefined) {
        delete process.env.DOUYIN_ADAPTER;
      } else {
        process.env.DOUYIN_ADAPTER = previous;
      }
    }
  });

  it("returns fake adapter when DOUYIN_ADAPTER=fake", async () => {
    const previous = process.env.DOUYIN_ADAPTER;
    process.env.DOUYIN_ADAPTER = "fake";

    try {
      const adapter = await createDouyinAdapter();
      expect(adapter).toBeInstanceOf(FakeDouyinAdapter);
    } finally {
      if (previous === undefined) {
        delete process.env.DOUYIN_ADAPTER;
      } else {
        process.env.DOUYIN_ADAPTER = previous;
      }
    }
  });

  it("requires a studio plugin path when DOUYIN_ADAPTER=live", async () => {
    const previousAdapter = process.env.DOUYIN_ADAPTER;
    const previousModule = process.env.DOUYIN_LIVE_ADAPTER_MODULE;
    process.env.DOUYIN_ADAPTER = "live";
    delete process.env.DOUYIN_LIVE_ADAPTER_MODULE;

    try {
      await expect(createDouyinAdapter()).rejects.toThrow(/DOUYIN_LIVE_ADAPTER_MODULE/);
    } finally {
      if (previousAdapter === undefined) {
        delete process.env.DOUYIN_ADAPTER;
      } else {
        process.env.DOUYIN_ADAPTER = previousAdapter;
      }
      if (previousModule === undefined) {
        delete process.env.DOUYIN_LIVE_ADAPTER_MODULE;
      } else {
        process.env.DOUYIN_LIVE_ADAPTER_MODULE = previousModule;
      }
    }
  });
});

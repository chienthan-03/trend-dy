import { FakeDouyinAdapter } from "./adapters/fake-douyin.adapter";

export type DouyinRankItem = {
  externalId: string;
  rankPosition: number;
  title: string;
  caption: string;
  authorHandle: string;
  stats: Record<string, number>;
  hashtags: string[];
  coverUrl?: string;
  canonicalUrl?: string;
  publishedAt?: Date;
  rawPayload: unknown;
};

export interface DouyinRankingAdapter {
  fetchBoard(boardKey: string, config: Record<string, unknown>): Promise<DouyinRankItem[]>;
}

/**
 * Creates the configured Douyin ranking adapter.
 *
 * Environment:
 * - `DOUYIN_ADAPTER` — `fake` (default) or `live`
 * - `DOUYIN_LIVE_ADAPTER_MODULE` — required when `DOUYIN_ADAPTER=live`; absolute or
 *   package-resolvable path to a studio-provided plugin that exports
 *   `createLiveDouyinAdapter(): DouyinRankingAdapter | Promise<DouyinRankingAdapter>`
 *
 * The in-repo fake adapter returns deterministic metadata fixtures for dev and tests.
 * Production crawl logic lives in the studio-owned live plugin and is loaded dynamically.
 * Do not commit ToS-bypass or anti-bot scraping code to this repository.
 */
export const createDouyinAdapter = async (): Promise<DouyinRankingAdapter> => {
  const mode = process.env.DOUYIN_ADAPTER ?? "fake";

  if (mode === "fake") {
    return new FakeDouyinAdapter();
  }

  if (mode === "live") {
    const modulePath = process.env.DOUYIN_LIVE_ADAPTER_MODULE;
    if (!modulePath) {
      throw new Error(
        "DOUYIN_LIVE_ADAPTER_MODULE must be set when DOUYIN_ADAPTER=live. " +
          "Install the studio-provided live adapter plugin separately; " +
          "this repository does not ship ToS-bypass crawl code.",
      );
    }

    const liveModule = (await import(modulePath)) as {
      createLiveDouyinAdapter?: () => DouyinRankingAdapter | Promise<DouyinRankingAdapter>;
    };

    if (typeof liveModule.createLiveDouyinAdapter !== "function") {
      throw new Error(
        `Live adapter module "${modulePath}" must export createLiveDouyinAdapter()`,
      );
    }

    return liveModule.createLiveDouyinAdapter();
  }

  throw new Error(`Unknown DOUYIN_ADAPTER value "${mode}". Use "fake" or "live".`);
};

import { resolve } from "node:path";
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
 * - `DOUYIN_API_PROVIDER` — `justoneapi` (default) or `http`
 * - `DOUYIN_API_TOKEN` — Just One API token (required for justoneapi)
 * - `DOUYIN_API_BASE_URL` — optional; default https://api.justoneapi.com
 * - `DOUYIN_HTTP_FETCH_URL` — studio proxy JSON endpoint (provider=http)
 * - `DOUYIN_LIVE_ADAPTER_MODULE` — optional custom plugin path
 */
export const createDouyinAdapter = async (): Promise<DouyinRankingAdapter> => {
  const mode = process.env.DOUYIN_ADAPTER ?? "fake";

  if (mode === "fake") {
    return new FakeDouyinAdapter();
  }

  if (mode === "live") {
    const modulePath = process.env.DOUYIN_LIVE_ADAPTER_MODULE?.trim();

    if (modulePath) {
      const resolvedModule = modulePath.startsWith(".")
        ? resolve(__dirname, "adapters", modulePath)
        : modulePath;
      const liveModule = (await import(resolvedModule)) as {
        createLiveDouyinAdapter?: () => DouyinRankingAdapter | Promise<DouyinRankingAdapter>;
      };

      if (typeof liveModule.createLiveDouyinAdapter !== "function") {
        throw new Error(
          `Live adapter module "${modulePath}" must export createLiveDouyinAdapter()`,
        );
      }

      return liveModule.createLiveDouyinAdapter();
    }

    const { LiveDouyinAdapter } = await import("./adapters/live/live-douyin.adapter");
    return new LiveDouyinAdapter();
  }

  throw new Error(`Unknown DOUYIN_ADAPTER value "${mode}". Use "fake" or "live".`);
};

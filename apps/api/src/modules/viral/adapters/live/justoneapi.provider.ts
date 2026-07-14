import type { DouyinRankItem } from "../../douyin-ranking.adapter";
import { mapJustOneResponse } from "./map-justone-items";

export type JustOneFetchParams = {
  boardKey: string;
  keyword: string;
  contentType: string;
  limit: number;
  pages: number;
  genre?: string;
  config: Record<string, unknown>;
};

const DEFAULT_BASE_URL = "https://api.justoneapi.com";

const resolveBaseUrl = (): string => {
  const fromEnv = process.env.DOUYIN_API_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return DEFAULT_BASE_URL;
};

const resolveToken = (config: Record<string, unknown>): string => {
  const fromConfig = typeof config.apiToken === "string" ? config.apiToken.trim() : "";
  const fromEnv = process.env.DOUYIN_API_TOKEN?.trim() ?? "";
  const token = fromConfig || fromEnv;
  if (!token) {
    throw new Error(
      "Live Douyin crawl requires DOUYIN_API_TOKEN (Just One API) or board adapterConfig.apiToken",
    );
  }
  return token;
};

export const fetchJustOneBoard = async (
  params: JustOneFetchParams,
): Promise<DouyinRankItem[]> => {
  const token = resolveToken(params.config);
  const baseUrl = resolveBaseUrl();
  const sortType =
    typeof params.config.sortType === "string" ? params.config.sortType : "HIGH_INTERACTION";
  const videoType =
    typeof params.config.videoType === "string" ? params.config.videoType : "ALL";

  const collected: DouyinRankItem[] = [];
  const pageSize = 10;

  for (let page = 1; page <= params.pages && collected.length < params.limit; page += 1) {
    const url = new URL(`${baseUrl}/api/douyin/hot-search/v1`);
    url.searchParams.set("token", token);
    url.searchParams.set("keyword", params.keyword);
    url.searchParams.set("contentType", params.contentType);
    url.searchParams.set("videoType", videoType);
    url.searchParams.set("sortType", sortType);
    url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "ai-content-factory/1.0",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Just One API HTTP ${response.status} for board ${params.boardKey}: ${body.slice(0, 200)}`,
      );
    }

    const payload = (await response.json()) as {
      code?: number;
      message?: string | null;
      data?: unknown;
    };

    if (payload.code !== 0) {
      throw new Error(
        `Just One API error ${payload.code ?? "?"}: ${payload.message ?? "unknown"} (board ${params.boardKey})`,
      );
    }

    const remaining = params.limit - collected.length;
    const pageItems = mapJustOneResponse(payload.data, params.boardKey, remaining);
    for (const item of pageItems) {
      collected.push({
        ...item,
        rankPosition: collected.length + 1,
      });
    }

    if (pageItems.length < pageSize) {
      break;
    }
  }

  if (collected.length === 0) {
    throw new Error(
      `Just One API returned no items for keyword "${params.keyword}" (board ${params.boardKey})`,
    );
  }

  return collected;
};

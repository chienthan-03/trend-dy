import type { DouyinRankItem, DouyinRankingAdapter } from "../../douyin-ranking.adapter";
import { resolveBoardSearch } from "./genre-board-config";
import { fetchJustOneBoard } from "./justoneapi.provider";
import { mapJustOneResponse } from "./map-justone-items";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const clampLimit = (config: Record<string, unknown>): number => {
  const requested =
    typeof config.limit === "number" && Number.isFinite(config.limit)
      ? Math.trunc(config.limit)
      : DEFAULT_LIMIT;
  return Math.min(Math.max(requested, 1), MAX_LIMIT);
};

const clampPages = (config: Record<string, unknown>, limit: number): number => {
  const requested =
    typeof config.pages === "number" && Number.isFinite(config.pages)
      ? Math.trunc(config.pages)
      : Math.ceil(limit / 10);
  return Math.min(Math.max(requested, 1), 5);
};

const fetchHttpJsonBoard = async (
  boardKey: string,
  config: Record<string, unknown>,
  limit: number,
): Promise<DouyinRankItem[]> => {
  const fetchUrl =
    typeof config.fetchUrl === "string"
      ? config.fetchUrl.trim()
      : process.env.DOUYIN_HTTP_FETCH_URL?.trim();

  if (!fetchUrl) {
    throw new Error(
      "HTTP live adapter requires DOUYIN_HTTP_FETCH_URL or board adapterConfig.fetchUrl",
    );
  }

  const url = new URL(fetchUrl);
  url.searchParams.set("boardKey", boardKey);
  if (typeof config.keyword === "string") {
    url.searchParams.set("keyword", config.keyword);
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "ai-content-factory/1.0",
  };
  const bearer = process.env.DOUYIN_HTTP_BEARER?.trim();
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Douyin HTTP proxy ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  const data =
    payload && typeof payload === "object" && "data" in (payload as object)
      ? (payload as { data: unknown }).data
      : payload;
  const items = mapJustOneResponse(data, boardKey, limit);
  if (items.length === 0) {
    throw new Error(`Douyin HTTP proxy returned no items for board ${boardKey}`);
  }
  return items;
};

/**
 * Live metadata adapter — no anti-bot signing in-repo.
 * Providers: justoneapi (default), http (studio proxy JSON).
 */
export class LiveDouyinAdapter implements DouyinRankingAdapter {
  async fetchBoard(
    boardKey: string,
    config: Record<string, unknown>,
  ): Promise<DouyinRankItem[]> {
    const limit = clampLimit(config);
    const pages = clampPages(config, limit);
    const provider = (
      typeof config.provider === "string"
        ? config.provider
        : process.env.DOUYIN_API_PROVIDER ?? "justoneapi"
    ).toLowerCase();

    const genre =
      typeof config.genre === "string" ? config.genre : boardKey.split(":").pop();

    if (provider === "http") {
      return fetchHttpJsonBoard(boardKey, config, limit);
    }

    const { keyword, contentType } = resolveBoardSearch(boardKey, genre, config);

    return fetchJustOneBoard({
      boardKey,
      keyword,
      contentType,
      limit,
      pages,
      genre,
      config,
    });
  }
}

export const createLiveDouyinAdapter = (): DouyinRankingAdapter =>
  new LiveDouyinAdapter();

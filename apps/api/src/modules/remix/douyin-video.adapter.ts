export type DouyinVideoDetail = {
  videoId: string;
  title: string;
  caption: string;
  authorHandle: string;
  stats: Record<string, number>;
  coverUrl?: string;
  canonicalUrl?: string;
  publishedAt?: Date;
  playUrl?: string;
  rawPayload: unknown;
};

export interface DouyinVideoAdapter {
  resolveShareUrl(shareUrl: string): Promise<{ videoId: string; canonicalUrl?: string }>;
  getVideoDetail(videoId: string): Promise<DouyinVideoDetail>;
}

/**
 * Creates the configured Douyin video adapter.
 *
 * Environment:
 * - `DOUYIN_ADAPTER` — `fake` (default) or `live`
 * - `DOUYIN_VIDEO_PROVIDER` — `ytdlp` (paste-link without Just One) or unset (Just One)
 * - `DOUYIN_API_TOKEN` — Just One API token (required for live Just One video)
 * - `DOUYIN_API_BASE_URL` — optional; default https://api.justoneapi.com
 * - `YTDLP_BIN` / `YTDLP_COOKIES_FILE` / `YTDLP_COOKIES_FROM_BROWSER` — yt-dlp path
 */
export const createDouyinVideoAdapter = async (): Promise<DouyinVideoAdapter> => {
  const mode = process.env.DOUYIN_ADAPTER ?? "fake";

  if (mode === "fake") {
    const { FakeDouyinVideoAdapter } = await import("./adapters/fake-douyin-video.adapter");
    return new FakeDouyinVideoAdapter();
  }

  if (mode === "live") {
    const { isYtdlpVideoProvider } = await import(
      "./adapters/live/ytdlp-video.provider"
    );
    if (isYtdlpVideoProvider()) {
      const { YtdlpDouyinVideoAdapter } = await import(
        "./adapters/live/ytdlp-douyin-video.adapter"
      );
      return new YtdlpDouyinVideoAdapter();
    }
    const { LiveDouyinVideoAdapter } = await import("./adapters/live/live-douyin-video.adapter");
    return new LiveDouyinVideoAdapter();
  }

  throw new Error(`Unknown DOUYIN_ADAPTER value "${mode}". Use "fake" or "live".`);
};

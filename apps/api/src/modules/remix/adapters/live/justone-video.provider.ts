import type { DouyinVideoDetail } from "../../douyin-video.adapter";

const DEFAULT_BASE_URL = "https://api.justoneapi.com";
const SHARE_URL_TRANSFER_TIMEOUT_MS = 60_000;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const pickString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

export const extractDouyinShareUrl = (input: string): string | null => {
  const match = input.match(/https?:\/\/v\.douyin\.com\/[A-Za-z0-9_-]+\/?/i);
  return match?.[0] ?? null;
};

export const extractDouyinVideoIdFromUrl = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const patterns = [
    /\/video\/(\d+)/i,
    /\/note\/(\d+)/i,
    /\/share\/video\/(\d+)/i,
    /[?&](?:modal_id|item_ids|aweme_id)=(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
};

export const parseJustOneShareUrlTransferData = (
  data: unknown,
): { videoId: string; canonicalUrl?: string } | null => {
  if (typeof data === "string" && data.trim()) {
    const canonicalUrl = data.trim();
    const videoId = extractDouyinVideoIdFromUrl(canonicalUrl);
    if (videoId) {
      return { videoId, canonicalUrl };
    }
    return null;
  }

  const root = asRecord(data);
  if (!root) {
    return null;
  }

  const videoId = pickString(
    root.aweme_id,
    root.awemeId,
    root.video_id,
    root.videoId,
    root.id,
  );

  const canonicalUrl = pickString(
    root.url,
    root.share_url,
    root.shareUrl,
    root.canonical_url,
    root.redirect_url,
    root.redirectUrl,
  );

  if (videoId) {
    return {
      videoId,
      canonicalUrl: canonicalUrl || `https://www.douyin.com/video/${videoId}`,
    };
  }

  if (canonicalUrl) {
    const fromUrl = extractDouyinVideoIdFromUrl(canonicalUrl);
    if (fromUrl) {
      return { videoId: fromUrl, canonicalUrl };
    }
  }

  return null;
};

const resolveBaseUrl = (): string => {
  const fromEnv = process.env.DOUYIN_API_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return DEFAULT_BASE_URL;
};

const resolveToken = (): string => {
  const token = process.env.DOUYIN_API_TOKEN?.trim() ?? "";
  if (!token) {
    throw new Error(
      "Live Douyin video adapter requires DOUYIN_API_TOKEN (Just One API)",
    );
  }
  return token;
};

const fetchJustOneJson = async (
  path: string,
  params: Record<string, string>,
  timeoutMs = 30_000,
): Promise<unknown> => {
  const token = resolveToken();
  const baseUrl = resolveBaseUrl();
  const url = new URL(`${baseUrl}${path}`);

  url.searchParams.set("token", token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ai-content-factory/1.0",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Just One API HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    code?: number | string;
    message?: string | null;
    data?: unknown;
  };

  const code = Number(payload.code);
  if (!Number.isFinite(code) || code !== 0) {
    throw new Error(
      `Just One API error ${payload.code ?? "?"}: ${payload.message ?? "unknown"}`,
    );
  }

  return payload.data;
};

export const resolveJustOneShareUrl = async (
  shareUrl: string,
): Promise<{ videoId: string; canonicalUrl?: string }> => {
  const trimmed = shareUrl.trim();
  if (!trimmed) {
    throw new Error("shareUrl is required");
  }

  const directVideoId = extractDouyinVideoIdFromUrl(trimmed);
  if (directVideoId) {
    return {
      videoId: directVideoId,
      canonicalUrl: `https://www.douyin.com/video/${directVideoId}`,
    };
  }

  const shortShareUrl = extractDouyinShareUrl(trimmed) ?? trimmed;
  const data = await fetchJustOneJson(
    "/api/douyin/share-url-transfer/v1",
    { shareUrl: shortShareUrl },
    SHARE_URL_TRANSFER_TIMEOUT_MS,
  );

  const parsed = parseJustOneShareUrlTransferData(data);
  if (!parsed?.videoId) {
    throw new Error(
      `Just One API share-url-transfer returned no video id (data=${JSON.stringify(data).slice(0, 200)})`,
    );
  }

  return parsed;
};

export const mapJustOneVideoDetail = (videoId: string, data: unknown): DouyinVideoDetail => {
  const root = asRecord(data) ?? {};
  const attrs = asRecord(root.attribute_datas) ?? asRecord(root.attributeDatas) ?? {};
  const author =
    asRecord(root.author) ??
    asRecord(root.creator) ??
    asRecord(root.user_info) ??
    asRecord(root.userInfo) ??
    {};
  const stats =
    asRecord(root.statistics) ??
    asRecord(root.stats) ??
    asRecord(root.engagement) ??
    attrs;
  const video = asRecord(root.video);

  const resolvedVideoId = pickString(
    root.aweme_id,
    root.awemeId,
    root.video_id,
    root.videoId,
    root.id,
    videoId,
  );

  const title = pickString(
    attrs.item_title,
    root.title,
    root.desc,
    root.caption,
    root.description,
  );
  const caption = pickString(root.desc, root.caption, root.description, attrs.item_title, title);
  const authorHandle = pickString(
    author.unique_id,
    author.uniqueId,
    author.short_id,
    author.nickname,
    author.name,
    root.author_handle,
    root.authorHandle,
  );

  const likes =
    asNumber(stats.digg_count) ??
    asNumber(stats.like_count) ??
    asNumber(stats.likes) ??
    asNumber(stats.like_cnt_all) ??
    asNumber(root.like_count) ??
    0;
  const comments =
    asNumber(stats.comment_count) ??
    asNumber(stats.comments) ??
    asNumber(stats.comment_cnt_all) ??
    asNumber(root.comment_count) ??
    0;
  const shares =
    asNumber(stats.share_count) ??
    asNumber(stats.shares) ??
    asNumber(stats.share_cnt_all) ??
    asNumber(root.share_count) ??
    0;

  const coverObj = video?.cover ?? root.cover;
  const coverRecord = asRecord(coverObj);
  const coverUrlList = coverRecord?.url_list ?? coverRecord?.urlList;
  const coverUrl =
    Array.isArray(coverUrlList) && typeof coverUrlList[0] === "string"
      ? coverUrlList[0]
      : pickString(root.cover_url, root.coverUrl);

  const playObj = asRecord(video?.play_addr) ?? asRecord(video?.playAddr) ?? asRecord(root.play_addr);
  const playUrlList = playObj?.url_list ?? playObj?.urlList;
  const playUrl =
    Array.isArray(playUrlList) && typeof playUrlList[0] === "string"
      ? playUrlList[0]
      : pickString(root.play_url, root.playUrl);

  const canonicalUrl = pickString(
    root.share_url,
    root.shareUrl,
    root.url,
    root.canonical_url,
    resolvedVideoId ? `https://www.douyin.com/video/${resolvedVideoId}` : "",
  );

  let publishedAt: Date | undefined;
  const createTime =
    asNumber(root.create_time) ??
    asNumber(root.createTime) ??
    asNumber(root.publish_time) ??
    asNumber(attrs.item_create_time);
  if (createTime !== undefined) {
    publishedAt = new Date(createTime > 1_000_000_000_000 ? createTime : createTime * 1000);
  }

  return {
    videoId: resolvedVideoId,
    title: title || caption || `Douyin ${resolvedVideoId}`,
    caption: caption || title,
    authorHandle: authorHandle
      ? authorHandle.startsWith("@")
        ? authorHandle
        : `@${authorHandle}`
      : "@unknown",
    stats: { likes, comments, shares },
    coverUrl: coverUrl || undefined,
    canonicalUrl: canonicalUrl || undefined,
    publishedAt,
    playUrl: playUrl || undefined,
    rawPayload: { source: "justoneapi", raw: root },
  };
};

export const fetchJustOneVideoDetail = async (videoId: string): Promise<DouyinVideoDetail> => {
  const data = await fetchJustOneJson("/api/douyin/get-video-detail/v2", { videoId });
  const root = asRecord(data);

  const detailData =
    asRecord(root?.aweme_detail) ??
    asRecord(root?.awemeDetail) ??
    asRecord(root?.video) ??
    asRecord(root?.detail) ??
    root ??
    data;

  return mapJustOneVideoDetail(videoId, detailData);
};

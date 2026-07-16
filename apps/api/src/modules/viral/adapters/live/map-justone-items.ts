import type { DouyinRankItem } from "../../douyin-ranking.adapter";

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

/** Hot-search returns `cover_image_uri` (tos-cn-… path), not a full CDN URL. */
const DOUYIN_COVER_FROM = "3213915784";

const resolveDouyinMediaUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://p3.douyinpic.com/img/${trimmed}~c5_300x400.jpeg?from=${DOUYIN_COVER_FROM}`;
};

const extractList = (data: unknown): unknown[] => {
  const root = asRecord(data);
  if (!root) {
    return [];
  }

  const candidates = [
    root.content_list,
    root.contentList,
    root.list,
    root.items,
    root.videos,
    root.aweme_list,
    root.awemeList,
    root.data,
    root.results,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
    const nested = asRecord(candidate);
    if (nested) {
      for (const key of ["list", "items", "videos", "aweme_list"]) {
        if (Array.isArray(nested[key])) {
          return nested[key] as unknown[];
        }
      }
    }
  }

  return [];
};

const extractHashtags = (caption: string, raw: Record<string, unknown>): string[] => {
  const fromField = raw.hashtags ?? raw.text_extra ?? raw.challenge_list;
  if (Array.isArray(fromField)) {
    const tags = fromField
      .map((entry) => {
        if (typeof entry === "string") {
          return entry.replace(/^#/, "");
        }
        const row = asRecord(entry);
        return pickString(row?.hashtag_name, row?.name, row?.tag_name);
      })
      .filter(Boolean);
    if (tags.length > 0) {
      return tags;
    }
  }

  const matches = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return matches.map((tag) => tag.slice(1));
};

const mapOneItem = (
  raw: unknown,
  boardKey: string,
  rankPosition: number,
): DouyinRankItem | null => {
  const row = asRecord(raw);
  if (!row) {
    return null;
  }

  const attrs = asRecord(row.attribute_datas) ?? asRecord(row.attributeDatas) ?? {};
  const author =
    asRecord(row.author) ??
    asRecord(row.creator) ??
    asRecord(row.user_info) ??
    asRecord(row.userInfo) ??
    {};
  const stats =
    asRecord(row.statistics) ??
    asRecord(row.stats) ??
    asRecord(row.engagement) ??
    attrs;

  const externalId = pickString(
    row.aweme_id,
    row.awemeId,
    row.video_id,
    row.videoId,
    row.id,
    row.item_id,
  );
  if (!externalId) {
    return null;
  }

  const title = pickString(
    attrs.item_title,
    row.title,
    row.desc,
    row.caption,
    row.description,
  );
  const caption = pickString(row.caption, row.desc, row.description, attrs.item_title, title);
  const authorHandle = pickString(
    author.unique_id,
    author.uniqueId,
    author.short_id,
    author.nickname,
    author.name,
    row.author_handle,
    row.authorHandle,
  );

  const likes =
    asNumber(stats.digg_count) ??
    asNumber(stats.like_count) ??
    asNumber(stats.likes) ??
    asNumber(stats.like_cnt_all) ??
    asNumber(row.like_count) ??
    0;
  const comments =
    asNumber(stats.comment_count) ??
    asNumber(stats.comments) ??
    asNumber(stats.comment_cnt_all) ??
    asNumber(row.comment_count) ??
    0;
  const shares =
    asNumber(stats.share_count) ??
    asNumber(stats.shares) ??
    asNumber(stats.share_cnt_all) ??
    asNumber(row.share_count) ??
    0;

  const coverObj = asRecord(row.video)?.cover ?? row.cover;
  const coverRecord = asRecord(coverObj);
  const coverUrlList = coverRecord?.url_list ?? coverRecord?.urlList;
  const coverFromList =
    Array.isArray(coverUrlList) && typeof coverUrlList[0] === "string"
      ? coverUrlList[0]
      : "";
  const coverUriOrUrl = pickString(
    coverFromList,
    row.cover_url,
    row.coverUrl,
    attrs.cover_image_url,
    attrs.coverImageUrl,
    attrs.cover_url,
    attrs.cover_image_uri,
    attrs.coverImageUri,
    coverRecord?.uri,
  );
  const coverUrl = resolveDouyinMediaUrl(coverUriOrUrl);

  const canonicalUrl = pickString(
    row.share_url,
    row.shareUrl,
    row.url,
    row.canonical_url,
    externalId ? `https://www.douyin.com/video/${externalId}` : "",
  );

  let publishedAt: Date | undefined;
  const createTime =
    asNumber(row.create_time) ??
    asNumber(row.createTime) ??
    asNumber(row.publish_time) ??
    asNumber(attrs.item_create_time);
  if (createTime !== undefined) {
    publishedAt = new Date(createTime > 1_000_000_000_000 ? createTime : createTime * 1000);
  }

  return {
    externalId,
    rankPosition,
    title: title || caption || `Douyin ${externalId}`,
    caption: caption || title,
    authorHandle: authorHandle ? (authorHandle.startsWith("@") ? authorHandle : `@${authorHandle}`) : "@unknown",
    stats: { likes, comments, shares },
    hashtags: extractHashtags(caption, row),
    coverUrl: coverUrl || undefined,
    canonicalUrl: canonicalUrl || undefined,
    publishedAt,
    rawPayload: { boardKey, source: "justoneapi", raw: row },
  };
};

export const mapJustOneResponse = (
  data: unknown,
  boardKey: string,
  limit: number,
): DouyinRankItem[] => {
  const list = extractList(data);
  const items: DouyinRankItem[] = [];

  for (const raw of list) {
    const mapped = mapOneItem(raw, boardKey, items.length + 1);
    if (mapped) {
      items.push(mapped);
    }
    if (items.length >= limit) {
      break;
    }
  }

  return items;
};

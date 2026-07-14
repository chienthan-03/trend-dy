"use client";

import Link from "next/link";
import { Badge, Button, formatGenre, TierBadge } from "@/components/ui";
import type { ViralItem } from "@/lib/api-client";

type ViralCardProps = {
  item: ViralItem;
  remakeId?: string;
  remixPending?: boolean;
  onRemix: () => void;
  onSkip: () => void;
};

const formatStat = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
};

const pickStat = (
  stats: Record<string, number> | null,
  keys: string[],
): number => {
  if (!stats) return 0;
  for (const key of keys) {
    const value = stats[key];
    if (typeof value === "number") return value;
  }
  return 0;
};

export const ViralCard = ({
  item,
  remakeId,
  remixPending = false,
  onRemix,
  onSkip,
}: ViralCardProps) => {
  const isBlocked = item.usagePolicy === "blocked";
  const likes = pickStat(item.stats, ["likes", "like_count", "digg_count"]);
  const comments = pickStat(item.stats, ["comments", "comment_count"]);
  const shares = pickStat(item.stats, ["shares", "share_count"]);
  const primaryGenre = item.genres[0];
  const displayText = item.caption?.trim() || item.title;

  return (
    <article
      className="flex gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
      aria-label={`Viral item: ${item.title}`}
    >
      <div className="h-28 w-20 shrink-0 overflow-hidden rounded-md bg-gray-100">
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-xs text-gray-400"
            aria-hidden="true"
          >
            No cover
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <TierBadge tier={item.tier} />
          <span className="text-xs font-medium text-gray-600">
            {item.trendScore != null ? item.trendScore.toFixed(2) : "—"}
          </span>
          {item.rankPosition != null ? (
            <Badge>#{item.rankPosition}</Badge>
          ) : null}
        </div>

        <p className="line-clamp-2 text-sm font-medium text-gray-900">
          {displayText}
        </p>

        <p className="text-xs text-gray-500">
          {item.authorHandle ? `@${item.authorHandle}` : "Unknown author"}
          {likes > 0 ? ` · ${formatStat(likes)} ♥` : ""}
          {comments > 0 ? ` · ${formatStat(comments)} 💬` : ""}
          {shares > 0 ? ` · ${formatStat(shares)} ↗` : ""}
          {primaryGenre ? (
            <span className="ml-1">
              ·{" "}
              <Badge tone="neutral">{formatGenre(primaryGenre)}</Badge>
            </span>
          ) : null}
        </p>

        {item.hashtags.length > 0 ? (
          <p className="line-clamp-1 text-xs text-gray-500">
            {item.hashtags
              .slice(0, 6)
              .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
              .join(" ")}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            onClick={onRemix}
            disabled={isBlocked || remixPending}
            aria-label={`Chế biến ${item.title}`}
            aria-disabled={isBlocked || remixPending}
          >
            {remixPending ? "Đang chế biến…" : "Chế biến"}
          </Button>
          <Button
            variant="secondary"
            onClick={onSkip}
            aria-label={`Bỏ qua ${item.title}`}
          >
            Bỏ qua
          </Button>
        </div>

        {remakeId ? (
          <p className="text-xs">
            <Link
              href={`/remix/${remakeId}`}
              className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-600"
            >
              Đã chế biến
            </Link>
          </p>
        ) : null}
      </div>
    </article>
  );
};

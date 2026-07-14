"use client";

import Link from "next/link";
import { Badge, formatGenre, TierBadge } from "@/components/ui";

type SourceSnapshot = {
  coverUrl?: string | null;
  caption?: string | null;
  title?: string | null;
  canonicalUrl?: string | null;
  authorHandle?: string | null;
  stats?: Record<string, number> | null;
  tier?: string | null;
  trendScore?: number | null;
};

const asSnapshot = (value: unknown): SourceSnapshot | null => {
  if (!value || typeof value !== "object") return null;
  return value as SourceSnapshot;
};

type RemakeSourcePanelProps = {
  sourceSnapshot: unknown;
  sourceUrl: string | null;
  genre: string | null;
};

export const RemakeSourcePanel = ({
  sourceSnapshot,
  sourceUrl,
  genre,
}: RemakeSourcePanelProps) => {
  const snapshot = asSnapshot(sourceSnapshot);
  const coverUrl = snapshot?.coverUrl ?? null;
  const caption = snapshot?.caption?.trim() || snapshot?.title?.trim() || "—";
  const link = sourceUrl ?? snapshot?.canonicalUrl ?? null;
  const tier = snapshot?.tier ?? null;
  const trendScore = snapshot?.trendScore ?? null;

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="h-40 w-28 shrink-0 overflow-hidden rounded-md bg-gray-100">
        {coverUrl ? (
          <img
            src={coverUrl}
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
          {tier ? <TierBadge tier={tier} /> : null}
          {trendScore != null ? (
            <Badge tone="neutral">Score {trendScore.toFixed(2)}</Badge>
          ) : null}
          {genre ? (
            <Badge tone="neutral">{formatGenre(genre)}</Badge>
          ) : null}
        </div>

        {link ? (
          <p className="text-sm">
            <Link
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-600"
              aria-label="Open source video link"
            >
              {link}
            </Link>
          </p>
        ) : (
          <p className="text-sm text-gray-500">No source link</p>
        )}

        <p className="text-sm text-gray-700">{caption}</p>

        {snapshot?.authorHandle ? (
          <p className="text-xs text-gray-500">@{snapshot.authorHandle}</p>
        ) : null}
      </div>
    </div>
  );
};

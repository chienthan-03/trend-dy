"use client";

import { GENRES, VIRAL_TIERS, type Genre, type ViralTier } from "@factory/shared";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PasteLinkBar } from "@/components/viral/paste-link-bar";
import { ViralCard } from "@/components/viral/viral-card";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  formatGenre,
  Input,
  Label,
  PageHeader,
  Select,
  TierBadge,
} from "@/components/ui";
import {
  api,
  getErrorMessage,
  type Source,
  type ViralBoard,
  type ViralCrawlRun,
  type ViralItem,
  type ViralRemake,
} from "@/lib/api-client";
import { useProject } from "@/lib/project-context";

const DEFAULT_TIERS: ViralTier[] = ["S", "A"];

type SortKey = "trend_score" | "crawled_at" | "rank_position";

const buildRemakeMap = (remakes: ViralRemake[]): Map<string, ViralRemake> => {
  const map = new Map<string, ViralRemake>();
  for (const remake of remakes) {
    if (!remake.viralItemId) continue;
    const existing = map.get(remake.viralItemId);
    if (
      !existing ||
      new Date(remake.createdAt).getTime() > new Date(existing.createdAt).getTime()
    ) {
      map.set(remake.viralItemId, remake);
    }
  }
  return map;
};

const DiscoveryPage = () => {
  const { projectId } = useProject();
  const [genre, setGenre] = useState<Genre>(GENRES[0]);
  const [tiers, setTiers] = useState<ViralTier[]>(DEFAULT_TIERS);
  const [sortBy, setSortBy] = useState<SortKey>("trend_score");
  const [boards, setBoards] = useState<ViralBoard[]>([]);
  const [items, setItems] = useState<ViralItem[]>([]);
  const [remakesByItemId, setRemakesByItemId] = useState<Map<string, ViralRemake>>(
    new Map(),
  );
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [crawlRuns, setCrawlRuns] = useState<ViralCrawlRun[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [crawlPending, setCrawlPending] = useState<string | null>(null);
  const [boardLabel, setBoardLabel] = useState("");
  const [boardPending, setBoardPending] = useState(false);
  const [remixPendingId, setRemixPendingId] = useState<string | null>(null);

  const [sourceName, setSourceName] = useState("");
  const [sourceType, setSourceType] = useState("manual");
  const [sourceUrl, setSourceUrl] = useState("");
  const [licenseStatus, setLicenseStatus] = useState("pending");

  const genreBoards = useMemo(
    () => boards.filter((board) => board.genre === genre),
    [boards, genre],
  );

  const sortedItems = useMemo(() => {
    const visible = items.filter((item) => !skippedIds.has(item.id));
    return [...visible].sort((a, b) => {
      if (sortBy === "trend_score") {
        return (b.trendScore ?? 0) - (a.trendScore ?? 0);
      }
      if (sortBy === "crawled_at") {
        return (
          new Date(b.crawledAt).getTime() - new Date(a.crawledAt).getTime()
        );
      }
      const aRank = a.rankPosition ?? Number.POSITIVE_INFINITY;
      const bRank = b.rankPosition ?? Number.POSITIVE_INFINITY;
      return aRank - bRank;
    });
  }, [items, skippedIds, sortBy]);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    try {
      const [boardList, sourceList, runs, remakeList] = await Promise.all([
        api.viral.listBoards(projectId),
        api.sources.list(projectId),
        api.viral.listCrawlRuns(selectedBoardId || undefined),
        api.remix.list({ projectId }),
      ]);
      setBoards(boardList);
      setSources(sourceList);
      setCrawlRuns(runs);
      setRemakesByItemId(buildRemakeMap(remakeList));

      const tierFetches = tiers.map((tier) =>
        api.viral.listItems({ projectId, genre, tier }),
      );
      const tierResults = await Promise.all(tierFetches);
      const merged = tierResults.flat();
      const seen = new Set<string>();
      setItems(
        merged.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        }),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [projectId, genre, tiers, selectedBoardId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleTierToggle = (tier: ViralTier) => {
    setTiers((current) =>
      current.includes(tier)
        ? current.filter((value) => value !== tier)
        : [...current, tier],
    );
  };

  const handleCrawl = async (boardId: string) => {
    setCrawlPending(boardId);
    setError(null);
    try {
      await api.viral.triggerCrawl(boardId);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCrawlPending(null);
    }
  };

  const handleCreateBoard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId) return;
    setBoardPending(true);
    setError(null);
    try {
      const label = boardLabel.trim() || `${formatGenre(genre)} Douyin`;
      const board = await api.viral.createBoard({
        projectId,
        boardKey: `douyin:hot:${genre}`,
        label,
        genre,
        enabled: true,
      });
      setBoardLabel("");
      setSelectedBoardId(board.id);
      await api.viral.triggerCrawl(board.id);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBoardPending(false);
    }
  };

  const handleSourceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId) return;
    setPending(true);
    setError(null);
    try {
      await api.sources.create({
        projectId,
        name: sourceName,
        type: sourceType,
        licenseStatus,
        ...(sourceUrl ? { baseUrl: sourceUrl } : {}),
      });
      setSourceName("");
      setSourceUrl("");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const handleRemixSuccess = (jobId: string) => {
    setSuccessMessage(`Remix job queued (job ${jobId.slice(0, 8)}…).`);
    setError(null);
    void loadData();
  };

  const handleRemix = async (item: ViralItem) => {
    if (!projectId) return;
    setRemixPendingId(item.id);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await api.remix.triggerFromItem(item.id, projectId);
      handleRemixSuccess(result.jobId);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRemixPendingId(null);
    }
  };

  const handleSkip = (itemId: string) => {
    setSkippedIds((current) => new Set([...current, itemId]));
  };

  const handlePasteLinkSuccess = (result: { jobId: string }) => {
    handleRemixSuccess(result.jobId);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Viral Feed"
        description="Douyin viral boards by genre (default tier S/A) and manual novel sources."
      />

      {error ? <Alert>{error}</Alert> : null}
      {successMessage ? (
        <Alert variant="info">
          {successMessage}{" "}
          <Link
            href="/jobs"
            className="font-medium underline underline-offset-2"
          >
            View jobs
          </Link>
        </Alert>
      ) : null}

      <Card title="Paste link">
        <PasteLinkBar
          projectId={projectId}
          onSuccess={handlePasteLinkSuccess}
          onError={setError}
        />
      </Card>

      <Card title="Genre">
        <div
          role="tablist"
          aria-label="Genres"
          className="flex flex-wrap gap-2"
        >
          {GENRES.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={genre === value}
              onClick={() => setGenre(value)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                genre === value
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {formatGenre(value)}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-600">Tier filter:</span>
          {VIRAL_TIERS.map((tier) => (
            <label key={tier} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={tiers.includes(tier)}
                onChange={() => handleTierToggle(tier)}
                aria-label={`Tier ${tier}`}
              />
              <TierBadge tier={tier} />
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="sort-items" className="text-sm text-gray-600">
            Sort by
          </label>
          <Select
            id="sort-items"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortKey)}
            className="w-auto min-w-[10rem]"
            aria-label="Sort viral items"
          >
            <option value="trend_score">Trend score</option>
            <option value="crawled_at">Crawled at</option>
            <option value="rank_position">Rank position</option>
          </Select>
        </div>
      </Card>

      <Card title={`Viral feed · ${formatGenre(genre)}`}>
        {sortedItems.length === 0 ? (
          <EmptyState>
            No items for this genre and tier filter. Try crawling a board below.
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sortedItems.map((item) => {
              const remake = remakesByItemId.get(item.id);
              return (
                <ViralCard
                  key={item.id}
                  item={item}
                  remakeId={remake?.id}
                  remixPending={remixPendingId === item.id}
                  onRemix={() => void handleRemix(item)}
                  onSkip={() => handleSkip(item.id)}
                />
              );
            })}
          </div>
        )}
      </Card>

      <details className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Boards &amp; crawl controls
        </summary>
        <div className="space-y-6 border-t border-gray-100 p-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Boards">
              <form
                onSubmit={handleCreateBoard}
                className="mb-4 flex flex-wrap items-end gap-3 border-b border-gray-100 pb-4"
                aria-label="Create viral board"
              >
                <div className="min-w-[12rem] flex-1 grid gap-1">
                  <Label htmlFor="board-label">New board label</Label>
                  <Input
                    id="board-label"
                    value={boardLabel}
                    onChange={(e) => setBoardLabel(e.target.value)}
                    placeholder={`${formatGenre(genre)} Douyin`}
                  />
                </div>
                <Button type="submit" disabled={boardPending || !projectId}>
                  {boardPending ? "Creating…" : "Create & crawl"}
                </Button>
              </form>
              <p className="mb-4 text-xs text-gray-500">
                Board key: <code>douyin:hot:{genre}</code> · one board per genre
                per project
              </p>
              {genreBoards.length === 0 ? (
                <EmptyState>
                  No boards for this genre yet. Use Create &amp; crawl above.
                </EmptyState>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {genreBoards.map((board) => (
                    <li
                      key={board.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="font-medium">{board.label}</p>
                        <p className="text-xs text-gray-500">
                          {board.boardKey} ·{" "}
                          {board.enabled ? (
                            <Badge tone="success">enabled</Badge>
                          ) : (
                            <Badge>disabled</Badge>
                          )}
                          {board.lastCrawledAt
                            ? ` · last crawl ${new Date(board.lastCrawledAt).toLocaleString()}`
                            : " · never crawled"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => setSelectedBoardId(board.id)}
                          aria-pressed={selectedBoardId === board.id}
                        >
                          History
                        </Button>
                        <Button
                          onClick={() => void handleCrawl(board.id)}
                          disabled={crawlPending === board.id}
                          aria-label={`Crawl ${board.label}`}
                        >
                          {crawlPending === board.id ? "Crawling…" : "Crawl now"}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Crawl run history">
              {selectedBoardId ? (
                <p className="mb-2 text-xs text-gray-500">
                  Board: {boards.find((b) => b.id === selectedBoardId)?.label}
                </p>
              ) : (
                <p className="mb-2 text-xs text-gray-500">
                  All boards (latest 100)
                </p>
              )}
              {crawlRuns.length === 0 ? (
                <EmptyState>No crawl runs yet.</EmptyState>
              ) : (
                <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                  {crawlRuns.map((run) => (
                    <li
                      key={run.id}
                      className="rounded border border-gray-100 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          tone={
                            run.status === "completed"
                              ? "success"
                              : run.status === "failed"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {run.status}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(run.startedAt).toLocaleString()}
                        </span>
                      </div>
                      {run.itemCount != null ? (
                        <p className="mt-1 text-xs text-gray-600">
                          {run.itemCount} items
                        </p>
                      ) : null}
                      {run.error ? (
                        <p className="mt-1 text-xs text-red-600">{run.error}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title="Manual sources & license">
            <form
              onSubmit={handleSourceSubmit}
              className="mb-6 grid max-w-md gap-3"
              aria-label="Register source"
            >
              <div className="grid gap-1">
                <Label htmlFor="source-name">Name</Label>
                <Input
                  id="source-name"
                  required
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="source-type">Type</Label>
                <Select
                  id="source-type"
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                >
                  <option value="manual">manual</option>
                  <option value="url">url</option>
                  <option value="rss">rss</option>
                  <option value="douyin_board">douyin_board</option>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="source-url">Base URL (optional)</Label>
                <Input
                  id="source-url"
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="license-status">License status</Label>
                <Select
                  id="license-status"
                  value={licenseStatus}
                  onChange={(e) => setLicenseStatus(e.target.value)}
                >
                  <option value="pending">pending</option>
                  <option value="cleared">cleared</option>
                  <option value="rejected">rejected</option>
                  <option value="research_only">research_only</option>
                </Select>
              </div>
              <Button type="submit" disabled={pending || !projectId}>
                {pending ? "Creating…" : "Create source"}
              </Button>
            </form>

            {sources.length === 0 ? (
              <EmptyState>No sources registered.</EmptyState>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {sources.map((source) => (
                  <li key={source.id} className="py-2 first:pt-0">
                    <span className="font-medium">{source.name}</span>
                    <span className="text-gray-500">
                      {" "}
                      · {source.type} · {source.licenseStatus}
                    </span>
                    {source.baseUrl ? (
                      <p className="text-xs text-gray-500">{source.baseUrl}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </details>
    </div>
  );
};

export default DiscoveryPage;

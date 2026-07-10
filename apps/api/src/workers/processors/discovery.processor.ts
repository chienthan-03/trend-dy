import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Job as BullJob } from "bullmq";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { QUEUE_NAMES } from "../../queue/queues";
import { JobsService } from "../../modules/jobs/jobs.service";
import {
  markCompleted,
  markFailed,
  markStarted,
} from "../job-status";
import { createDouyinAdapter } from "../../modules/viral/douyin-ranking.adapter";
import { classifyGenre } from "../../modules/viral/genre-classifier";
import {
  scoreItemsWithinGenre,
  type TierScoreInput,
} from "../../modules/viral/tier-scorer";

const [, , , , DISCOVERY_Q] = QUEUE_NAMES;

type RankCrawlPayload = {
  boardId: string;
  manual?: boolean;
  scheduled?: boolean;
};

type GenreClassifyPayload = {
  boardId: string;
  crawlRunId: string;
  itemIds?: string[];
  previousStatsByItemId?: Record<string, Record<string, number>>;
};

type TierScorePayload = {
  boardId: string;
  crawlRunId: string;
  genre?: string;
  previousStatsByItemId?: Record<string, Record<string, number>>;
};

const asNumberRecord = (value: unknown): Record<string, number> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      record[key] = raw;
    }
  }
  return Object.keys(record).length > 0 ? record : null;
};

@Injectable()
@Processor(DISCOVERY_Q)
export class DiscoveryProcessor extends WorkerHost {
  private readonly logger = new Logger(DiscoveryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
  ) {
    super();
  }

  async process(job: BullJob): Promise<void> {
    const jobId = job.id;
    const isTrackedJob = Boolean(jobId) && !job.data?.scheduled;

    if (isTrackedJob && jobId) {
      await markStarted(this.prisma, jobId);
    }

    try {
      switch (job.name) {
        case "douyin_rank_crawl":
          await this.handleRankCrawl(job, isTrackedJob ? jobId! : undefined);
          break;
        case "douyin_genre_classify":
          await this.handleGenreClassify(job, isTrackedJob ? jobId! : undefined);
          break;
        case "douyin_tier_score":
          await this.handleTierScore(job, isTrackedJob ? jobId! : undefined);
          break;
        default:
          throw new Error(`Unsupported discovery job type: ${job.name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Discovery job ${jobId ?? job.name} failed: ${message}`);
      if (isTrackedJob && jobId) {
        await markFailed(this.prisma, jobId, message);
      }
      throw error;
    }
  }

  private async handleRankCrawl(
    job: BullJob,
    jobId?: string,
  ): Promise<void> {
    const payload = job.data as RankCrawlPayload;
    if (!payload.boardId) {
      throw new Error("douyin_rank_crawl requires boardId");
    }

    const board = await this.prisma.viralBoard.findUnique({
      where: { id: payload.boardId },
    });
    if (!board) {
      throw new Error(`Viral board ${payload.boardId} not found`);
    }

    const crawlRun = await this.prisma.viralCrawlRun.create({
      data: {
        boardId: board.id,
        status: "running",
      },
    });

    try {
      const adapter = await createDouyinAdapter();
      const config =
        board.adapterConfig && typeof board.adapterConfig === "object"
          ? (board.adapterConfig as Record<string, unknown>)
          : {};
      const fetched = await adapter.fetchBoard(board.boardKey, config);

      const upsertedIds: string[] = [];
      const previousStatsByItemId: Record<string, Record<string, number>> = {};

      for (const item of fetched) {
        const existing = await this.prisma.viralItem.findUnique({
          where: {
            boardId_externalId: {
              boardId: board.id,
              externalId: item.externalId,
            },
          },
        });

        if (existing) {
          const previousStats = asNumberRecord(existing.stats);
          if (previousStats) {
            previousStatsByItemId[existing.id] = previousStats;
          }
        }

        const record = await this.prisma.viralItem.upsert({
          where: {
            boardId_externalId: {
              boardId: board.id,
              externalId: item.externalId,
            },
          },
          create: {
            boardId: board.id,
            externalId: item.externalId,
            rankPosition: item.rankPosition,
            title: item.title,
            caption: item.caption,
            authorHandle: item.authorHandle,
            stats: item.stats as Prisma.InputJsonValue,
            hashtags: item.hashtags,
            coverUrl: item.coverUrl ?? null,
            canonicalUrl: item.canonicalUrl ?? null,
            publishedAt: item.publishedAt ?? null,
            crawledAt: new Date(),
            genres: [board.genre, ...board.genresExtra],
            genreSource: "board",
            usagePolicy: "research_only",
            rawPayload: item.rawPayload as Prisma.InputJsonValue,
          },
          update: {
            rankPosition: item.rankPosition,
            title: item.title,
            caption: item.caption,
            authorHandle: item.authorHandle,
            stats: item.stats as Prisma.InputJsonValue,
            hashtags: item.hashtags,
            coverUrl: item.coverUrl ?? null,
            canonicalUrl: item.canonicalUrl ?? null,
            publishedAt: item.publishedAt ?? null,
            crawledAt: new Date(),
            rawPayload: item.rawPayload as Prisma.InputJsonValue,
          },
        });

        upsertedIds.push(record.id);
      }

      await this.prisma.viralCrawlRun.update({
        where: { id: crawlRun.id },
        data: {
          status: "completed",
          finishedAt: new Date(),
          itemCount: upsertedIds.length,
          meta: {
            boardKey: board.boardKey,
            manual: payload.manual ?? false,
            scheduled: payload.scheduled ?? false,
          },
        },
      });

      await this.prisma.viralBoard.update({
        where: { id: board.id },
        data: { lastCrawledAt: new Date() },
      });

      await this.jobsService.enqueue({
        type: "douyin_genre_classify",
        payload: {
          boardId: board.id,
          crawlRunId: crawlRun.id,
          itemIds: upsertedIds,
          previousStatsByItemId,
        },
      });

      if (jobId) {
        await markCompleted(this.prisma, jobId, {
          boardId: board.id,
          crawlRunId: crawlRun.id,
          itemCount: upsertedIds.length,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.viralCrawlRun.update({
        where: { id: crawlRun.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: message,
        },
      });
      throw error;
    }
  }

  private async handleGenreClassify(
    job: BullJob,
    jobId?: string,
  ): Promise<void> {
    const payload = job.data as GenreClassifyPayload;
    if (!payload.boardId || !payload.crawlRunId) {
      throw new Error("douyin_genre_classify requires boardId and crawlRunId");
    }

    const board = await this.prisma.viralBoard.findUnique({
      where: { id: payload.boardId },
    });
    if (!board) {
      throw new Error(`Viral board ${payload.boardId} not found`);
    }

    const items = await this.prisma.viralItem.findMany({
      where: {
        boardId: board.id,
        ...(payload.itemIds?.length ? { id: { in: payload.itemIds } } : {}),
        genreSource: { not: "editor" },
      },
    });

    let updated = 0;
    for (const item of items) {
      const classified = await classifyGenre({
        boardGenre: board.genre,
        caption: item.caption,
        hashtags: item.hashtags,
      });

      await this.prisma.viralItem.update({
        where: { id: item.id },
        data: {
          genres: classified.genres,
          genreConfidence: classified.genreConfidence,
          genreSource: classified.genreSource,
        },
      });
      updated += 1;
    }

    await this.jobsService.enqueue({
      type: "douyin_tier_score",
      payload: {
        boardId: board.id,
        crawlRunId: payload.crawlRunId,
        previousStatsByItemId: payload.previousStatsByItemId,
      },
    });

    if (jobId) {
      await markCompleted(this.prisma, jobId, {
        boardId: board.id,
        updated,
      });
    }
  }

  private async handleTierScore(job: BullJob, jobId?: string): Promise<void> {
    const payload = job.data as TierScorePayload;
    if (!payload.boardId) {
      throw new Error("douyin_tier_score requires boardId");
    }

    const items = await this.prisma.viralItem.findMany({
      where: { boardId: payload.boardId },
      orderBy: [{ trendScore: "desc" }, { crawledAt: "desc" }],
    });

    const scoreInputs: TierScoreInput[] = items.map((item) => ({
      id: item.id,
      genre: item.genres[0] ?? "unknown",
      rankPosition: item.rankPosition,
      caption: item.caption,
      stats: asNumberRecord(item.stats),
      previousStats: payload.previousStatsByItemId?.[item.id] ?? null,
    }));

    const scored = scoreItemsWithinGenre(scoreInputs);
    for (const row of scored) {
      await this.prisma.viralItem.update({
        where: { id: row.id },
        data: {
          trendScore: row.trendScore,
          tier: row.tier,
        },
      });
    }

    if (jobId) {
      await markCompleted(this.prisma, jobId, {
        boardId: payload.boardId,
        scored: scored.length,
      });
    }
  }
}

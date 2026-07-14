import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, ViralBoard, ViralCrawlRun, ViralItem } from "@prisma/client";
import type { Queue } from "bullmq";
import { JobsService } from "../jobs/jobs.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateViralBoardDto } from "./dto/create-viral-board.dto";
import type { UpdateViralBoardDto } from "./dto/update-viral-board.dto";
import type { UpdateViralItemDto } from "./dto/update-viral-item.dto";

const REPEATABLE_JOB_PREFIX = "repeat-crawl";

@Injectable()
export class ViralService {
  private readonly logger = new Logger(ViralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
    @InjectQueue("discovery") private readonly discoveryQueue: Queue,
  ) {}

  async listBoards(projectId?: string): Promise<ViralBoard[]> {
    return this.prisma.viralBoard.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  async findBoardById(id: string): Promise<ViralBoard> {
    const board = await this.prisma.viralBoard.findUnique({ where: { id } });
    if (!board) {
      throw new NotFoundException(`Viral board ${id} not found`);
    }
    return board;
  }

  async createBoard(dto: CreateViralBoardDto): Promise<ViralBoard> {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project ${dto.projectId} not found`);
    }

    const existing = await this.prisma.viralBoard.findUnique({
      where: {
        projectId_boardKey: {
          projectId: dto.projectId,
          boardKey: dto.boardKey,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Board "${dto.boardKey}" already exists for this project`,
      );
    }

    const board = await this.prisma.viralBoard.create({
      data: {
        projectId: dto.projectId,
        boardKey: dto.boardKey,
        label: dto.label,
        genre: dto.genre,
        genresExtra: dto.genresExtra ?? [],
        adapterConfig: (dto.adapterConfig as Prisma.InputJsonValue | undefined) ?? undefined,
        enabled: dto.enabled ?? true,
        crawlIntervalSec: dto.crawlIntervalSec ?? 3600,
      },
    });

    await this.syncBoardSchedule(board);
    return board;
  }

  async updateBoard(id: string, dto: UpdateViralBoardDto): Promise<ViralBoard> {
    await this.findBoardById(id);

    const board = await this.prisma.viralBoard.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.crawlIntervalSec !== undefined
          ? { crawlIntervalSec: dto.crawlIntervalSec }
          : {}),
        ...(dto.genresExtra !== undefined ? { genresExtra: dto.genresExtra } : {}),
        ...(dto.adapterConfig !== undefined
          ? { adapterConfig: dto.adapterConfig as Prisma.InputJsonValue | null }
          : {}),
      },
    });

    await this.syncBoardSchedule(board);
    return board;
  }

  async triggerCrawl(boardId: string): Promise<{ jobId: string; status: string }> {
    await this.findBoardById(boardId);

    return this.jobsService.enqueue({
      type: "douyin_rank_crawl",
      payload: { boardId, manual: true },
      idempotencyKey: `douyin_rank_crawl:${boardId}:manual:${Date.now()}`,
    });
  }

  async listItems(filters: {
    boardId?: string;
    genre?: string;
    tier?: string;
    hashtag?: string;
    projectId?: string;
  }): Promise<ViralItem[]> {
    const where: Prisma.ViralItemWhereInput = {
      ...(filters.boardId ? { boardId: filters.boardId } : {}),
      ...(filters.tier ? { tier: filters.tier } : {}),
      ...(filters.genre ? { genres: { has: filters.genre } } : {}),
      ...(filters.hashtag ? { hashtags: { has: filters.hashtag } } : {}),
      ...(filters.projectId
        ? { board: { projectId: filters.projectId } }
        : {}),
    };

    return this.prisma.viralItem.findMany({
      where,
      orderBy: [{ trendScore: "desc" }, { crawledAt: "desc" }],
    });
  }

  async findItemById(id: string): Promise<ViralItem> {
    const item = await this.prisma.viralItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Viral item ${id} not found`);
    }
    return item;
  }

  async updateItem(id: string, dto: UpdateViralItemDto): Promise<ViralItem> {
    await this.findItemById(id);

    if (dto.genres !== undefined && dto.genres.length === 0) {
      throw new BadRequestException("genres must contain at least one value");
    }

    return this.prisma.viralItem.update({
      where: { id },
      data: {
        ...(dto.usagePolicy !== undefined ? { usagePolicy: dto.usagePolicy } : {}),
        ...(dto.tier !== undefined ? { tier: dto.tier } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.genres !== undefined
          ? {
              genres: dto.genres,
              genreSource: "editor",
              genreConfidence: 1,
            }
          : {}),
      },
    });
  }

  async listCrawlRuns(boardId?: string): Promise<ViralCrawlRun[]> {
    return this.prisma.viralCrawlRun.findMany({
      where: boardId ? { boardId } : undefined,
      orderBy: { startedAt: "desc" },
      take: 100,
    });
  }

  async getTopGenres(projectId?: string): Promise<
    Array<{ genre: string; items: ViralItem[] }>
  > {
    const items = await this.prisma.viralItem.findMany({
      where: {
        tier: { in: ["S", "A"] },
        ...(projectId ? { board: { projectId } } : {}),
      },
      orderBy: [{ trendScore: "desc" }, { crawledAt: "desc" }],
      take: 200,
    });

    const grouped = new Map<string, ViralItem[]>();
    for (const item of items) {
      const primaryGenre = item.genres[0] ?? "unknown";
      const bucket = grouped.get(primaryGenre) ?? [];
      if (bucket.length < 10) {
        bucket.push(item);
        grouped.set(primaryGenre, bucket);
      }
    }

    return [...grouped.entries()]
      .map(([genre, genreItems]) => ({ genre, items: genreItems }))
      .sort((a, b) => a.genre.localeCompare(b.genre));
  }

  async syncBoardSchedule(board: ViralBoard): Promise<void> {
    try {
      const repeatableJobs = await this.discoveryQueue.getRepeatableJobs();
      const repeatKey = `${REPEATABLE_JOB_PREFIX}:${board.id}`;

      for (const job of repeatableJobs) {
        if (job.id === repeatKey || job.name === repeatKey) {
          await this.discoveryQueue.removeRepeatableByKey(job.key);
        }
      }

      if (!board.enabled) {
        return;
      }

      await this.discoveryQueue.add(
        "douyin_rank_crawl",
        { boardId: board.id, scheduled: true },
        {
          jobId: repeatKey,
          repeat: { every: board.crawlIntervalSec * 1000 },
        },
      );
    } catch (error) {
      this.logger.warn(
        `Board schedule sync skipped for ${board.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ARC_SCOPED_TYPES,
  CHAPTER_SCOPED_TYPES,
  type GenerationType,
} from "../../ai/prompts/generation.types";
import type {
  GenerationContext,
  ViralInspireSnippet,
} from "../../ai/prompts/generation.v1";
import { PrismaService } from "../../prisma/prisma.service";
import {
  type InspireFromViralOptions,
  shouldIncludeViralInspire,
} from "./inspire-from-viral";

const MIN_CHUNKS = 4;
const MAX_CHUNKS = 8;
const MAX_EVENTS = 30;
const MAX_VIRAL_INSPIRE = 8;

export type BuildContextInput = {
  type: GenerationType;
  chapterId?: string;
  arcId?: string;
  inspireFromViral?: InspireFromViralOptions;
};

@Injectable()
export class ContextBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    storyId: string,
    input: BuildContextInput,
  ): Promise<GenerationContext> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, projectId: true, title: true, language: true },
    });
    if (!story) {
      throw new NotFoundException(`Story ${storyId} not found`);
    }

    if (CHAPTER_SCOPED_TYPES.includes(input.type) && !input.chapterId) {
      throw new BadRequestException(
        `${input.type} requires chapterId`,
      );
    }
    if (ARC_SCOPED_TYPES.includes(input.type) && !input.arcId) {
      throw new BadRequestException(`${input.type} requires arcId`);
    }

    const chapterIds = await this.resolveChapterIds(storyId, input);

    const includeViralInspire = shouldIncludeViralInspire(
      input.type,
      input.inspireFromViral,
    );

    const [characters, events, arcs, chunks, viralInspire] = await Promise.all([
      this.prisma.character.findMany({
        where: { storyId },
        select: { name: true, role: true, summary: true },
        orderBy: { name: "asc" },
        take: 40,
      }),
      this.prisma.event.findMany({
        where: {
          storyId,
          ...(chapterIds.length > 0 ? { chapterId: { in: chapterIds } } : {}),
          ...(input.arcId ? { arcId: input.arcId } : {}),
        },
        select: {
          summary: true,
          importance: true,
          chapterId: true,
        },
        orderBy: [{ importance: "desc" }, { createdAt: "asc" }],
        take: MAX_EVENTS,
      }),
      this.prisma.arc.findMany({
        where: {
          storyId,
          ...(input.arcId ? { id: input.arcId } : {}),
        },
        select: { name: true, summary: true },
        orderBy: { orderIndex: "asc" },
        take: input.arcId ? 1 : 10,
      }),
      this.loadTopChunks(chapterIds),
      includeViralInspire
        ? this.loadViralInspire(story.projectId, input.inspireFromViral!)
        : Promise.resolve(undefined),
    ]);

    return {
      storyTitle: story.title,
      language: story.language,
      characters,
      events,
      arcs,
      chunks,
      ...(viralInspire && viralInspire.length > 0 ? { viralInspire } : {}),
    };
  }

  private async loadViralInspire(
    projectId: string,
    options: InspireFromViralOptions,
  ): Promise<ViralInspireSnippet[]> {
    const items = await this.prisma.viralItem.findMany({
      where: {
        tier: { in: ["S", "A"] },
        genres: { has: options.inspireGenre },
        usagePolicy: { not: "blocked" },
        caption: { not: null },
        board: { projectId },
      },
      select: { caption: true, tier: true },
      orderBy: [{ trendScore: "desc" }, { crawledAt: "desc" }],
      take: MAX_VIRAL_INSPIRE,
    });

    return items
      .filter(
        (item): item is { caption: string; tier: string } =>
          item.caption !== null && item.tier !== null,
      )
      .map((item) => ({
        caption: item.caption,
        tier: item.tier,
      }));
  }

  private async resolveChapterIds(
    storyId: string,
    input: BuildContextInput,
  ): Promise<string[]> {
    if (input.chapterId) {
      const chapter = await this.prisma.chapter.findFirst({
        where: { id: input.chapterId, storyId },
        select: { id: true },
      });
      if (!chapter) {
        throw new NotFoundException(
          `Chapter ${input.chapterId} not found on story ${storyId}`,
        );
      }
      return [input.chapterId];
    }

    if (!input.arcId) {
      return [];
    }

    const arc = await this.prisma.arc.findFirst({
      where: { id: input.arcId, storyId },
      select: {
        startChapterId: true,
        endChapterId: true,
      },
    });
    if (!arc) {
      throw new NotFoundException(
        `Arc ${input.arcId} not found on story ${storyId}`,
      );
    }

    if (arc.startChapterId && arc.endChapterId) {
      const [start, end] = await Promise.all([
        this.prisma.chapter.findUnique({
          where: { id: arc.startChapterId },
          select: { number: true },
        }),
        this.prisma.chapter.findUnique({
          where: { id: arc.endChapterId },
          select: { number: true },
        }),
      ]);
      if (start && end) {
        const chapters = await this.prisma.chapter.findMany({
          where: {
            storyId,
            number: { gte: start.number, lte: end.number },
          },
          select: { id: true },
          orderBy: { number: "asc" },
        });
        return chapters.map((chapter) => chapter.id);
      }
    }

    const arcChapters = await this.prisma.chapter.findMany({
      where: {
        storyId,
        events: { some: { arcId: input.arcId } },
      },
      select: { id: true },
      orderBy: { number: "asc" },
    });
    return arcChapters.map((chapter) => chapter.id);
  }

  private async loadTopChunks(chapterIds: string[]) {
    if (chapterIds.length === 0) {
      return [];
    }

    const perChapter = Math.max(
      1,
      Math.floor(MAX_CHUNKS / chapterIds.length),
    );
    const chunkGroups = await Promise.all(
      chapterIds.map((chapterId) =>
        this.prisma.storyChunk.findMany({
          where: { chapterId },
          select: { chapterId: true, ordinal: true, text: true },
          orderBy: { ordinal: "asc" },
          take: perChapter,
        }),
      ),
    );

    const merged = chunkGroups.flat();
    const target = Math.min(
      MAX_CHUNKS,
      Math.max(MIN_CHUNKS, merged.length),
    );

    return merged.slice(0, target);
  }
}

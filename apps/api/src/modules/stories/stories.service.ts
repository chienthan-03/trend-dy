import { Injectable, NotFoundException } from "@nestjs/common";
import type { Chapter, Prisma, Story } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateStoryDto } from "./dto/create-story.dto";
import type { UpdateStoryDto } from "./dto/update-story.dto";

const DEFAULT_LANGUAGE = "vi";
const DEFAULT_STATUS = "draft";

@Injectable()
export class StoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId?: string): Promise<Story[]> {
    return this.prisma.story.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string): Promise<Story> {
    const story = await this.prisma.story.findUnique({ where: { id } });
    if (!story) {
      throw new NotFoundException(`Story ${id} not found`);
    }
    return story;
  }

  async create(dto: CreateStoryDto): Promise<Story> {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project ${dto.projectId} not found`);
    }

    if (dto.sourceId) {
      const source = await this.prisma.source.findUnique({
        where: { id: dto.sourceId },
      });
      if (!source) {
        throw new NotFoundException(`Source ${dto.sourceId} not found`);
      }
    }

    return this.prisma.story.create({
      data: {
        projectId: dto.projectId,
        title: dto.title,
        sourceId: dto.sourceId ?? null,
        language: dto.language ?? DEFAULT_LANGUAGE,
        genre: dto.genre ?? [],
        tags: dto.tags ?? [],
        status: dto.status ?? DEFAULT_STATUS,
        metadata:
          (dto.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
  }

  async update(id: string, dto: UpdateStoryDto): Promise<Story> {
    await this.findById(id);

    if (dto.sourceId) {
      const source = await this.prisma.source.findUnique({
        where: { id: dto.sourceId },
      });
      if (!source) {
        throw new NotFoundException(`Source ${dto.sourceId} not found`);
      }
    }

    return this.prisma.story.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.sourceId !== undefined ? { sourceId: dto.sourceId } : {}),
        ...(dto.language !== undefined ? { language: dto.language } : {}),
        ...(dto.genre !== undefined ? { genre: dto.genre } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.metadata !== undefined
          ? { metadata: dto.metadata as Prisma.InputJsonValue | null }
          : {}),
      },
    });
  }

  async remove(id: string): Promise<Story> {
    await this.findById(id);
    return this.prisma.story.delete({ where: { id } });
  }

  async listChapters(storyId: string): Promise<Chapter[]> {
    await this.findById(storyId);
    return this.prisma.chapter.findMany({
      where: { storyId },
      orderBy: { number: "asc" },
    });
  }

  async findChapter(storyId: string, chapterId: string): Promise<Chapter> {
    await this.findById(storyId);

    const chapter = await this.prisma.chapter.findFirst({
      where: { id: chapterId, storyId },
    });
    if (!chapter) {
      throw new NotFoundException(
        `Chapter ${chapterId} not found on story ${storyId}`,
      );
    }
    return chapter;
  }
}

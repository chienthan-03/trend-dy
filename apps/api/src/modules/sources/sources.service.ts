import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, Source } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateSourceDto } from "./dto/create-source.dto";
import type { UpdateSourceDto } from "./dto/update-source.dto";

@Injectable()
export class SourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId?: string): Promise<Source[]> {
    return this.prisma.source.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string): Promise<Source> {
    const source = await this.prisma.source.findUnique({ where: { id } });
    if (!source) {
      throw new NotFoundException(`Source ${id} not found`);
    }
    return source;
  }

  async create(dto: CreateSourceDto): Promise<Source> {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project ${dto.projectId} not found`);
    }

    return this.prisma.source.create({
      data: {
        projectId: dto.projectId,
        name: dto.name,
        type: dto.type,
        baseUrl: dto.baseUrl ?? null,
        licenseStatus: dto.licenseStatus ?? "pending",
        config: (dto.config as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
  }

  async update(id: string, dto: UpdateSourceDto): Promise<Source> {
    await this.findById(id);

    return this.prisma.source.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.baseUrl !== undefined ? { baseUrl: dto.baseUrl } : {}),
        ...(dto.licenseStatus !== undefined
          ? { licenseStatus: dto.licenseStatus }
          : {}),
        ...(dto.config !== undefined
          ? { config: dto.config as Prisma.InputJsonValue | null }
          : {}),
      },
    });
  }

  /**
   * Legal gate: production import/understand requires a cleared source license.
   */
  async assertSourceCleared(sourceId: string): Promise<void> {
    const source = await this.prisma.source.findUnique({
      where: { id: sourceId },
      select: { id: true, licenseStatus: true },
    });

    if (!source) {
      throw new NotFoundException(`Source ${sourceId} not found`);
    }

    if (source.licenseStatus !== "cleared") {
      throw new ForbiddenException(
        `Source ${sourceId} licenseStatus is '${source.licenseStatus}'; import requires 'cleared'`,
      );
    }
  }

  /**
   * Legal gate for a story: must be linked to a cleared source before import.
   */
  async assertStoryImportAllowed(storyId: string): Promise<void> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, sourceId: true },
    });

    if (!story) {
      throw new NotFoundException(`Story ${storyId} not found`);
    }

    if (!story.sourceId) {
      throw new ForbiddenException(
        `Story ${storyId} has no source; import requires a cleared source`,
      );
    }

    await this.assertSourceCleared(story.sourceId);
  }
}

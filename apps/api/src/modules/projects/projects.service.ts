import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, Project } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateProjectDto } from "./dto/create-project.dto";
import type { UpdateProjectDto } from "./dto/update-project.dto";

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || "project";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Project[]> {
    return this.prisma.project.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }

  async create(dto: CreateProjectDto): Promise<Project> {
    const slug = dto.slug ?? slugify(dto.name);

    return this.prisma.project.create({
      data: {
        name: dto.name,
        slug,
        styleGuide:
          (dto.styleGuide as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
  }

  async update(id: string, dto: UpdateProjectDto): Promise<Project> {
    await this.findById(id);

    return this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.styleGuide !== undefined
          ? { styleGuide: dto.styleGuide as Prisma.InputJsonValue | null }
          : {}),
      },
    });
  }

  async remove(id: string): Promise<Project> {
    await this.findById(id);
    return this.prisma.project.delete({ where: { id } });
  }
}

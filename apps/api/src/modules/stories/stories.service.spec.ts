import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service";
import { StoriesService } from "./stories.service";

describe("StoriesService.create", () => {
  let prisma: {
    project: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    story: {
      create: ReturnType<typeof vi.fn>;
    };
  };
  let service: StoriesService;

  beforeEach(() => {
    prisma = {
      project: {
        findUnique: vi.fn(),
      },
      story: {
        create: vi.fn(),
      },
    };
    service = new StoriesService(prisma as unknown as PrismaService);
  });

  it("creates a story under a project and returns id with default language vi", async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: "proj_1",
      name: "Demo",
      slug: "demo",
    });
    prisma.story.create.mockImplementation(async ({ data }) => ({
      id: "story_1",
      projectId: data.projectId,
      sourceId: data.sourceId ?? null,
      title: data.title,
      language: data.language ?? "vi",
      genre: data.genre ?? [],
      tags: data.tags ?? [],
      status: data.status ?? "draft",
      metadata: data.metadata ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await service.create({
      projectId: "proj_1",
      title: "My Story",
    });

    expect(result.id).toBeTruthy();
    expect(result.language).toBe("vi");
    expect(prisma.story.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "proj_1",
        title: "My Story",
        language: "vi",
        status: "draft",
      }),
    });
  });

  it("throws NotFoundException when project is missing", async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    await expect(
      service.create({ projectId: "missing", title: "Orphan" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

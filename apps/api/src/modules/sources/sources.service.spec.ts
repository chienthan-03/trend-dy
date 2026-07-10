import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service";
import { SourcesService } from "./sources.service";

describe("SourcesService.assertSourceCleared", () => {
  let prisma: {
    source: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };
  let service: SourcesService;

  beforeEach(() => {
    prisma = {
      source: {
        findUnique: vi.fn(),
      },
    };
    service = new SourcesService(prisma as unknown as PrismaService);
  });

  it("allows import when licenseStatus is cleared", async () => {
    prisma.source.findUnique.mockResolvedValue({
      id: "src_1",
      licenseStatus: "cleared",
    });

    await expect(service.assertSourceCleared("src_1")).resolves.toBeUndefined();
  });

  it.each(["pending", "rejected", "research_only"] as const)(
    "blocks import when licenseStatus is %s",
    async (licenseStatus) => {
      prisma.source.findUnique.mockResolvedValue({
        id: "src_1",
        licenseStatus,
      });

      await expect(service.assertSourceCleared("src_1")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    },
  );

  it("throws NotFoundException when source is missing", async () => {
    prisma.source.findUnique.mockResolvedValue(null);

    await expect(service.assertSourceCleared("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("SourcesService.assertStoryImportAllowed", () => {
  let prisma: {
    source: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    story: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };
  let service: SourcesService;

  beforeEach(() => {
    prisma = {
      source: {
        findUnique: vi.fn(),
      },
      story: {
        findUnique: vi.fn(),
      },
    };
    service = new SourcesService(prisma as unknown as PrismaService);
  });

  it("allows import when the story source is cleared", async () => {
    prisma.story.findUnique.mockResolvedValue({
      id: "story_1",
      sourceId: "src_1",
    });
    prisma.source.findUnique.mockResolvedValue({
      id: "src_1",
      licenseStatus: "cleared",
    });

    await expect(
      service.assertStoryImportAllowed("story_1"),
    ).resolves.toBeUndefined();
  });

  it("blocks import when the story source is not cleared", async () => {
    prisma.story.findUnique.mockResolvedValue({
      id: "story_1",
      sourceId: "src_1",
    });
    prisma.source.findUnique.mockResolvedValue({
      id: "src_1",
      licenseStatus: "pending",
    });

    await expect(
      service.assertStoryImportAllowed("story_1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks import when the story has no source", async () => {
    prisma.story.findUnique.mockResolvedValue({
      id: "story_1",
      sourceId: null,
    });

    await expect(
      service.assertStoryImportAllowed("story_1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

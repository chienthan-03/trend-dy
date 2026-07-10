import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service";
import { ContextBuilder } from "./context-builder";

const FULL_BOOK_MARKER = "FULL_BOOK_RAW_TEXT_SHOULD_NEVER_APPEAR";

describe("ContextBuilder", () => {
  let prisma: {
    story: { findUnique: ReturnType<typeof vi.fn> };
    chapter: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    character: { findMany: ReturnType<typeof vi.fn> };
    event: { findMany: ReturnType<typeof vi.fn> };
    arc: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    storyChunk: { findMany: ReturnType<typeof vi.fn> };
    viralItem: { findMany: ReturnType<typeof vi.fn> };
  };
  let builder: ContextBuilder;

  const storyId = "story_1";
  const chapter1Id = "ch_1";
  const chapter2Id = "ch_2";
  const chapter3Id = "ch_3";

  beforeEach(() => {
    const longChapterText = `${FULL_BOOK_MARKER} `.repeat(500);

    prisma = {
      story: {
        findUnique: vi.fn().mockResolvedValue({
          id: storyId,
          projectId: "project_1",
          title: "Kiếm Thánh",
          language: "vi",
        }),
      },
      chapter: {
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          const ids = where.id?.in ?? [where.id];
          const all = [
            {
              id: chapter1Id,
              number: 1,
              cleanText: longChapterText,
              rawText: longChapterText,
            },
            {
              id: chapter2Id,
              number: 2,
              cleanText: longChapterText,
              rawText: longChapterText,
            },
            {
              id: chapter3Id,
              number: 3,
              cleanText: longChapterText,
              rawText: longChapterText,
            },
          ];
          if (where.storyId && where.number) {
            return all.filter(
              (c) =>
                c.number >= where.number.gte && c.number <= where.number.lte,
            );
          }
          if (where.id?.in) {
            return all.filter((c) => where.id.in.includes(c.id));
          }
          return all.filter((c) => c.id === where.id);
        }),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      character: {
        findMany: vi.fn().mockResolvedValue([
          { name: "Lâm Phong", role: "protagonist", summary: "Kiếm khách trẻ" },
        ]),
      },
      event: {
        findMany: vi.fn().mockResolvedValue([
          {
            summary: "Lâm Phong gặp sư phụ",
            importance: 3,
            chapterId: chapter1Id,
          },
        ]),
      },
      arc: {
        findMany: vi.fn().mockResolvedValue([
          { name: "Khởi đầu", summary: "Nhập môn kiếm phái" },
        ]),
        findFirst: vi.fn().mockResolvedValue({
          id: "arc_1",
          startChapterId: chapter1Id,
          endChapterId: chapter2Id,
        }),
      },
      storyChunk: {
        findMany: vi.fn().mockImplementation(async ({ where, take }) => {
          const chapterId = where.chapterId?.in?.[0] ?? where.chapterId;
          const ordinals = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
          return ordinals.slice(0, take ?? ordinals.length).map((ordinal) => ({
            chapterId,
            ordinal,
            text: `Chunk ${ordinal} ngắn cho chương.`,
          }));
        }),
      },
      viralItem: {
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          const all = [
            {
              caption: "S-tier cultivation hook",
              tier: "S",
              genres: ["cultivation"],
              usagePolicy: "research_only",
            },
            {
              caption: "A-tier cultivation title",
              tier: "A",
              genres: ["cultivation"],
              usagePolicy: "research_only",
            },
            {
              caption: "B-tier cultivation skip",
              tier: "B",
              genres: ["cultivation"],
              usagePolicy: "research_only",
            },
            {
              caption: "S-tier fantasy skip",
              tier: "S",
              genres: ["fantasy"],
              usagePolicy: "research_only",
            },
            {
              caption: null,
              tier: "S",
              genres: ["cultivation"],
              usagePolicy: "research_only",
            },
          ];

          return all
            .filter((item) => {
              if (where.tier?.in && !where.tier.in.includes(item.tier)) {
                return false;
              }
              if (where.genres?.has && !item.genres.includes(where.genres.has)) {
                return false;
              }
              if (where.usagePolicy?.not === "blocked" && item.usagePolicy === "blocked") {
                return false;
              }
              if (where.caption?.not === null && item.caption === null) {
                return false;
              }
              return true;
            })
            .map(({ caption, tier }) => ({ caption, tier }));
        }),
      },
    };

    prisma.chapter.findFirst.mockImplementation(async ({ where }) => {
      if (where.id === chapter1Id) {
        return { id: chapter1Id };
      }
      return null;
    });

    builder = new ContextBuilder(prisma as unknown as PrismaService);
  });

  it("returns graph slice and top-k chunks for a chapter scope", async () => {
    const context = await builder.build(storyId, {
      type: "summary.chapter",
      chapterId: chapter1Id,
    });

    expect(context.characters).toHaveLength(1);
    expect(context.events).toHaveLength(1);
    expect(context.arcs).toHaveLength(1);
    expect(context.chunks.length).toBeGreaterThanOrEqual(4);
    expect(context.chunks.length).toBeLessThanOrEqual(8);

    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain(FULL_BOOK_MARKER);
    expect(prisma.storyChunk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: expect.any(Number) }),
    );
  });

  it("never includes full raw book text when building arc scope", async () => {
    prisma.arc.findFirst.mockResolvedValue({
      id: "arc_1",
      startChapterId: chapter1Id,
      endChapterId: chapter2Id,
    });
    prisma.arc.findMany.mockResolvedValue([
      {
        id: "arc_1",
        name: "Khởi đầu",
        summary: "Nhập môn",
      },
    ]);
    prisma.chapter.findUnique.mockImplementation(async ({ where }) => {
      if (where.id === chapter1Id) return { number: 1 };
      if (where.id === chapter2Id) return { number: 2 };
      return null;
    });
    prisma.chapter.findMany.mockImplementation(async ({ where }) => {
      if (where.storyId && where.number) {
        return [
          { id: chapter1Id, number: 1 },
          { id: chapter2Id, number: 2 },
        ];
      }
      return [];
    });
    prisma.storyChunk.findMany.mockImplementation(async ({ where, take }) => {
      const chapterIds: string[] = where.chapterId?.in ?? [where.chapterId];
      const chunks = chapterIds.flatMap((chapterId) =>
        [0, 1, 2, 3].map((ordinal) => ({
          chapterId,
          ordinal,
          text: `Đoạn ${ordinal} từ chương ${chapterId}.`,
        })),
      );
      return chunks.slice(0, take ?? chunks.length);
    });

    const context = await builder.build(storyId, {
      type: "summary.arc",
      arcId: "arc_1",
    });

    expect(context.chunks.length).toBeLessThanOrEqual(8);
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain(FULL_BOOK_MARKER);
    expect(serialized.length).toBeLessThan(5_000);
  });

  it("includes only tier S/A viral captions for inspireGenre on packaging types", async () => {
    prisma.arc.findFirst.mockResolvedValue({
      id: "arc_1",
      startChapterId: chapter1Id,
      endChapterId: chapter2Id,
    });
    prisma.chapter.findUnique.mockImplementation(async ({ where }) => {
      if (where.id === chapter1Id) return { number: 1 };
      if (where.id === chapter2Id) return { number: 2 };
      return null;
    });
    prisma.chapter.findMany.mockImplementation(async ({ where }) => {
      if (where.storyId && where.number) {
        return [
          { id: chapter1Id, number: 1 },
          { id: chapter2Id, number: 2 },
        ];
      }
      return [];
    });

    const context = await builder.build(storyId, {
      type: "pack.title",
      arcId: "arc_1",
      inspireFromViral: { inspireGenre: "cultivation" },
    });

    expect(context.viralInspire).toEqual([
      { caption: "S-tier cultivation hook", tier: "S" },
      { caption: "A-tier cultivation title", tier: "A" },
    ]);
    expect(prisma.viralItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tier: { in: ["S", "A"] },
          genres: { has: "cultivation" },
          board: { projectId: "project_1" },
        }),
      }),
    );
  });

  it("omits viral inspire for non-packaging types unless includeScriptNarration", async () => {
    const summaryContext = await builder.build(storyId, {
      type: "summary.chapter",
      chapterId: chapter1Id,
      inspireFromViral: { inspireGenre: "cultivation" },
    });
    expect(summaryContext.viralInspire).toBeUndefined();
    expect(prisma.viralItem.findMany).not.toHaveBeenCalled();

    prisma.viralItem.findMany.mockClear();

    const scriptContext = await builder.build(storyId, {
      type: "script.narration",
      chapterId: chapter1Id,
      inspireFromViral: { inspireGenre: "cultivation" },
    });
    expect(scriptContext.viralInspire).toBeUndefined();
    expect(prisma.viralItem.findMany).not.toHaveBeenCalled();
  });
});

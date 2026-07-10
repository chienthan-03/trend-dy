import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const CHAPTERS_PER_ARC = 5;

@Injectable()
export class ArcRollupService {
  constructor(private readonly prisma: PrismaService) {}

  async rollupArcs(storyId: string): Promise<{ arcCount: number }> {
    const chapters = await this.prisma.chapter.findMany({
      where: { storyId },
      orderBy: { number: "asc" },
      select: { id: true, number: true, title: true },
    });

    if (chapters.length === 0) {
      await this.prisma.arc.deleteMany({ where: { storyId } });
      return { arcCount: 0 };
    }

    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { metadata: true },
    });
    const summaries =
      story?.metadata &&
      typeof story.metadata === "object" &&
      story.metadata !== null &&
      "chapterSummaries" in story.metadata &&
      typeof (story.metadata as { chapterSummaries?: unknown }).chapterSummaries ===
        "object"
        ? ((story.metadata as { chapterSummaries: Record<string, string> })
            .chapterSummaries ?? {})
        : {};

    await this.prisma.arc.deleteMany({ where: { storyId } });

    const groups: (typeof chapters)[] = [];
    for (let i = 0; i < chapters.length; i += CHAPTERS_PER_ARC) {
      groups.push(chapters.slice(i, i + CHAPTERS_PER_ARC));
    }

    for (const [index, group] of groups.entries()) {
      const start = group[0]!;
      const end = group[group.length - 1]!;
      const summaryParts = group
        .map((chapter) => summaries[chapter.id])
        .filter((value): value is string => Boolean(value));
      const summary =
        summaryParts.length > 0
          ? summaryParts.join("\n\n")
          : `Tóm tắt arc ${index + 1} (chương ${start.number}–${end.number}).`;

      await this.prisma.arc.create({
        data: {
          storyId,
          name: `Arc ${index + 1}`,
          orderIndex: index,
          summary,
          startChapterId: start.id,
          endChapterId: end.id,
        },
      });
    }

    return { arcCount: groups.length };
  }
}

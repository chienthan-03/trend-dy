import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const MAX_EVENTS = 100;

@Injectable()
export class GraphService {
  constructor(private readonly prisma: PrismaService) {}

  async getStoryGraph(storyId: string) {
    const [characters, arcs, events, relationships] = await Promise.all([
      this.prisma.character.findMany({
        where: { storyId },
        orderBy: { name: "asc" },
      }),
      this.prisma.arc.findMany({
        where: { storyId },
        orderBy: { orderIndex: "asc" },
      }),
      this.prisma.event.findMany({
        where: { storyId },
        orderBy: [{ importance: "desc" }, { createdAt: "asc" }],
        take: MAX_EVENTS,
        include: {
          characters: {
            include: {
              character: {
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
      this.prisma.relationship.findMany({
        where: { storyId },
        include: {
          fromCharacter: { select: { id: true, name: true } },
          toCharacter: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      characters,
      arcs,
      events: events.map((event) => ({
        id: event.id,
        chapterId: event.chapterId,
        arcId: event.arcId,
        type: event.type,
        summary: event.summary,
        importance: event.importance,
        timelineOrder: event.timelineOrder,
        characters: event.characters.map((link) => ({
          id: link.character.id,
          name: link.character.name,
          role: link.role,
        })),
      })),
      relationships: relationships.map((relationship) => ({
        id: relationship.id,
        type: relationship.type,
        description: relationship.description,
        sinceChapterId: relationship.sinceChapterId,
        from: relationship.fromCharacter,
        to: relationship.toCharacter,
      })),
    };
  }
}

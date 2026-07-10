import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { ExtractChapterV1 } from "../../ai/prompts/extract.chapter.v1";
import { PrismaService } from "../../prisma/prisma.service";
import {
  collectAliases,
  findCharacterByName,
  type CharacterRecord,
} from "./entity-resolver";

type UpsertChapterGraphInput = {
  storyId: string;
  chapterId: string;
  extract: ExtractChapterV1;
};

@Injectable()
export class ExtractService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertChapterGraph(input: UpsertChapterGraphInput): Promise<void> {
    const { storyId, chapterId, extract } = input;

    await this.prisma.$transaction(async (tx) => {
      await tx.event.deleteMany({ where: { chapterId } });
      await tx.plotSignal.deleteMany({ where: { chapterId } });

      const existingCharacters = await tx.character.findMany({
        where: { storyId },
        select: { id: true, name: true, aliases: true },
      });

      const characterMap = await this.resolveCharacters(
        tx,
        storyId,
        extract,
        existingCharacters,
      );

      for (const location of extract.locations) {
        const existing = await tx.location.findFirst({
          where: { storyId, name: location.name },
        });
        if (existing) {
          await tx.location.update({
            where: { id: existing.id },
            data: {
              type: location.type ?? existing.type,
              description: location.description ?? existing.description,
            },
          });
        } else {
          await tx.location.create({
            data: {
              storyId,
              name: location.name,
              type: location.type ?? null,
              description: location.description ?? null,
            },
          });
        }
      }

      for (const ability of extract.abilities) {
        const characterId = ability.character
          ? characterMap.get(ability.character) ?? null
          : null;
        const existing = await tx.ability.findFirst({
          where: { storyId, name: ability.name, characterId },
        });
        if (existing) {
          await tx.ability.update({
            where: { id: existing.id },
            data: {
              type: ability.type ?? existing.type,
              description: ability.description ?? existing.description,
              powerLevel: ability.power_level ?? existing.powerLevel,
            },
          });
        } else {
          await tx.ability.create({
            data: {
              storyId,
              characterId,
              name: ability.name,
              type: ability.type ?? null,
              description: ability.description ?? null,
              powerLevel: ability.power_level ?? null,
            },
          });
        }
      }

      for (const item of extract.items) {
        const ownerCharacterId = item.owner
          ? characterMap.get(item.owner) ?? null
          : null;
        const existing = await tx.item.findFirst({
          where: { storyId, name: item.name },
        });
        if (existing) {
          await tx.item.update({
            where: { id: existing.id },
            data: {
              type: item.type ?? existing.type,
              description: item.description ?? existing.description,
              ownerCharacterId: ownerCharacterId ?? existing.ownerCharacterId,
            },
          });
        } else {
          await tx.item.create({
            data: {
              storyId,
              name: item.name,
              type: item.type ?? null,
              description: item.description ?? null,
              ownerCharacterId,
            },
          });
        }
      }

      for (const relationship of extract.relationships) {
        const fromCharacterId = characterMap.get(relationship.from);
        const toCharacterId = characterMap.get(relationship.to);
        if (!fromCharacterId || !toCharacterId) {
          continue;
        }

        const existing = await tx.relationship.findFirst({
          where: {
            storyId,
            fromCharacterId,
            toCharacterId,
            type: relationship.type,
          },
        });
        if (existing) {
          await tx.relationship.update({
            where: { id: existing.id },
            data: {
              description: relationship.description ?? existing.description,
              sinceChapterId: chapterId,
            },
          });
        } else {
          await tx.relationship.create({
            data: {
              storyId,
              fromCharacterId,
              toCharacterId,
              type: relationship.type,
              description: relationship.description ?? null,
              sinceChapterId: chapterId,
            },
          });
        }
      }

      for (const [index, event] of extract.events.entries()) {
        const created = await tx.event.create({
          data: {
            storyId,
            chapterId,
            type: event.type ?? null,
            summary: event.summary,
            importance: event.importance ?? 0,
            timelineOrder: index + 1,
          },
        });

        for (const participant of event.characters ?? []) {
          const characterId = characterMap.get(participant.name);
          if (!characterId) {
            continue;
          }
          await tx.eventCharacter.create({
            data: {
              eventId: created.id,
              characterId,
              role: participant.role ?? "actor",
            },
          });
        }
      }

      for (const signal of extract.plot_signals) {
        await tx.plotSignal.create({
          data: {
            storyId,
            chapterId,
            kind: signal.kind,
            text: signal.text,
            strength: signal.strength ?? 0,
          },
        });
      }

      const story = await tx.story.findUnique({
        where: { id: storyId },
        select: { metadata: true },
      });
      const metadata =
        story?.metadata && typeof story.metadata === "object"
          ? { ...(story.metadata as Record<string, unknown>) }
          : {};
      const chapterSummaries =
        metadata.chapterSummaries &&
        typeof metadata.chapterSummaries === "object"
          ? {
              ...(metadata.chapterSummaries as Record<string, string>),
            }
          : {};
      chapterSummaries[chapterId] = extract.chapter_summary;
      metadata.chapterSummaries = chapterSummaries;

      await tx.chapter.update({
        where: { id: chapterId },
        data: { status: "understood" },
      });

      await tx.story.update({
        where: { id: storyId },
        data: { metadata: metadata as Prisma.InputJsonValue },
      });
    });
  }

  private async resolveCharacters(
    tx: Prisma.TransactionClient,
    storyId: string,
    extract: ExtractChapterV1,
    existingCharacters: CharacterRecord[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const records = [...existingCharacters];

    const register = (name: string, id: string) => {
      map.set(name, id);
    };

    const allNames = new Set<string>();
    for (const character of extract.characters) {
      allNames.add(character.name);
      for (const alias of character.aliases ?? []) {
        allNames.add(alias);
      }
    }
    for (const event of extract.events) {
      for (const participant of event.characters ?? []) {
        allNames.add(participant.name);
      }
    }
    for (const relationship of extract.relationships) {
      allNames.add(relationship.from);
      allNames.add(relationship.to);
    }
    for (const ability of extract.abilities) {
      if (ability.character) {
        allNames.add(ability.character);
      }
    }
    for (const item of extract.items) {
      if (item.owner) {
        allNames.add(item.owner);
      }
    }

    for (const character of extract.characters) {
      const match = findCharacterByName(character.name, records);
      if (match) {
        const aliases = collectAliases(match, [
          character.name,
          ...(character.aliases ?? []),
        ]);
        if (aliases.length !== match.aliases.length) {
          await tx.character.update({
            where: { id: match.id },
            data: { aliases },
          });
          match.aliases = aliases;
        }
        register(character.name, match.id);
        for (const alias of character.aliases ?? []) {
          register(alias, match.id);
        }
        continue;
      }

      const created = await tx.character.create({
        data: {
          storyId,
          name: character.name,
          aliases: character.aliases ?? [],
          role: character.role ?? null,
          summary: character.summary ?? null,
          attributes:
            (character.attributes as Prisma.InputJsonValue | undefined) ??
            undefined,
        },
      });
      records.push({
        id: created.id,
        name: created.name,
        aliases: created.aliases,
      });
      register(character.name, created.id);
      for (const alias of character.aliases ?? []) {
        register(alias, created.id);
      }
    }

    for (const name of allNames) {
      if (map.has(name)) {
        continue;
      }
      const match = findCharacterByName(name, records);
      if (match) {
        const aliases = collectAliases(match, [name]);
        if (aliases.length !== match.aliases.length) {
          await tx.character.update({
            where: { id: match.id },
            data: { aliases },
          });
          match.aliases = aliases;
        }
        register(name, match.id);
        continue;
      }

      const created = await tx.character.create({
        data: {
          storyId,
          name,
          aliases: [],
        },
      });
      records.push({ id: created.id, name: created.name, aliases: [] });
      register(name, created.id);
    }

    return map;
  }
}

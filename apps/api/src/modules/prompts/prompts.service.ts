import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PROMPT_TEMPLATE_SEEDS } from "../../ai/prompts/generation.v1";
import type { GenerationType } from "../../ai/prompts/generation.types";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class PromptsService implements OnModuleInit {
  private readonly logger = new Logger(PromptsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    for (const seed of PROMPT_TEMPLATE_SEEDS) {
      await this.prisma.promptTemplate.upsert({
        where: {
          key_version: {
            key: seed.key,
            version: seed.version,
          },
        },
        create: {
          key: seed.key,
          version: seed.version,
          locale: seed.locale,
          body: seed.body,
          modelHint: seed.modelHint ?? null,
          active: true,
        },
        update: {
          locale: seed.locale,
          body: seed.body,
          modelHint: seed.modelHint ?? null,
          active: true,
        },
      });
    }
    this.logger.log(
      `Seeded ${PROMPT_TEMPLATE_SEEDS.length} prompt templates (locale vi)`,
    );
  }

  async getActiveTemplate(key: GenerationType, locale = "vi") {
    return this.prisma.promptTemplate.findFirst({
      where: { key, locale, active: true },
      orderBy: { version: "desc" },
    });
  }
}

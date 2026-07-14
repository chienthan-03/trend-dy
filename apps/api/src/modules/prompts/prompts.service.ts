import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PROMPT_TEMPLATE_SEEDS } from "../../ai/prompts/generation.v1";
import type { GenerationType } from "../../ai/prompts/generation.types";
import { REMIX_PACKAGE_V1_SEED } from "../../ai/prompts/remix.package.v1";
import { PrismaService } from "../../prisma/prisma.service";

const PROMPT_TEMPLATE_SEED_ROWS = [
  ...PROMPT_TEMPLATE_SEEDS,
  REMIX_PACKAGE_V1_SEED,
];

@Injectable()
export class PromptsService implements OnModuleInit {
  private readonly logger = new Logger(PromptsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    for (const seed of PROMPT_TEMPLATE_SEED_ROWS) {
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
          outputSchema:
            "outputSchema" in seed && seed.outputSchema
              ? seed.outputSchema
              : undefined,
          active: true,
        },
        update: {
          locale: seed.locale,
          body: seed.body,
          modelHint: seed.modelHint ?? null,
          outputSchema:
            "outputSchema" in seed && seed.outputSchema
              ? seed.outputSchema
              : undefined,
          active: true,
        },
      });
    }
    this.logger.log(
      `Seeded ${PROMPT_TEMPLATE_SEED_ROWS.length} prompt templates (locale vi)`,
    );
  }

  async getActiveTemplate(key: GenerationType, locale = "vi") {
    return this.prisma.promptTemplate.findFirst({
      where: { key, locale, active: true },
      orderBy: { version: "desc" },
    });
  }
}

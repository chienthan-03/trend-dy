import { createHash } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { GenerationOutput } from "@prisma/client";
import {
  GENERATION_TYPE_TO_JOB,
  type GenerationType,
} from "../../ai/prompts/generation.types";
import type { EnqueueResult } from "../jobs/jobs.service";
import { JobsService } from "../jobs/jobs.service";
import { StoriesService } from "../stories/stories.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PromptsService } from "../prompts/prompts.service";
import { ContextBuilder } from "./context-builder";
import type { UpdateOutputDto } from "./dto/update-output.dto";
import type { GenerateDto } from "./dto/generate.dto";

export const computeInputHash = (input: {
  type: GenerationType;
  promptVersion: number;
  chapterId?: string;
  arcId?: string;
  context: unknown;
}): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        type: input.type,
        promptVersion: input.promptVersion,
        chapterId: input.chapterId ?? null,
        arcId: input.arcId ?? null,
        context: input.context,
      }),
    )
    .digest("hex");

@Injectable()
export class GenerateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storiesService: StoriesService,
    private readonly jobsService: JobsService,
    private readonly promptsService: PromptsService,
    private readonly contextBuilder: ContextBuilder,
  ) {}

  async enqueueGenerate(
    storyId: string,
    body: GenerateDto,
  ): Promise<{
    storyId: string;
    job: EnqueueResult;
    outputId?: string;
    deduped?: boolean;
  }> {
    await this.storiesService.findById(storyId);

    const template = await this.promptsService.getActiveTemplate(body.type);
    if (!template) {
      throw new BadRequestException(
        `No active prompt template for type ${body.type}`,
      );
    }

    const context = await this.contextBuilder.build(storyId, {
      type: body.type,
      chapterId: body.chapterId,
      arcId: body.arcId,
    });

    const inputHash = computeInputHash({
      type: body.type,
      promptVersion: template.version,
      chapterId: body.chapterId,
      arcId: body.arcId,
      context,
    });

    const existing = await this.findByDedupeKey({
      storyId,
      type: body.type,
      promptVersion: template.version,
      inputHash,
    });
    if (existing) {
      return {
        storyId,
        job: { jobId: "", status: "completed" },
        outputId: existing.id,
        deduped: true,
      };
    }

    const jobType = GENERATION_TYPE_TO_JOB[body.type];
    const job = await this.jobsService.enqueue({
      type: jobType,
      storyId,
      idempotencyKey: `generate:${storyId}:${body.type}:${inputHash}`,
      payload: {
        storyId,
        type: body.type,
        chapterId: body.chapterId,
        arcId: body.arcId,
        inputHash,
        options: body.options ?? {},
      },
    });

    return { storyId, job };
  }

  async findByDedupeKey(input: {
    storyId: string;
    type: string;
    promptVersion: number;
    inputHash: string;
  }): Promise<GenerationOutput | null> {
    return this.prisma.generationOutput.findFirst({
      where: {
        storyId: input.storyId,
        type: input.type,
        promptVersion: input.promptVersion,
        inputRef: {
          path: ["inputHash"],
          equals: input.inputHash,
        },
      },
    });
  }

  async listOutputs(storyId: string) {
    await this.storiesService.findById(storyId);
    return this.prisma.generationOutput.findMany({
      where: { storyId },
      orderBy: { createdAt: "desc" },
    });
  }

  async getOutput(outputId: string) {
    const output = await this.prisma.generationOutput.findUnique({
      where: { id: outputId },
    });
    if (!output) {
      throw new NotFoundException(`Output ${outputId} not found`);
    }
    return output;
  }

  async updateOutput(outputId: string, body: UpdateOutputDto) {
    await this.getOutput(outputId);
    return this.prisma.generationOutput.update({
      where: { id: outputId },
      data: {
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });
  }
}

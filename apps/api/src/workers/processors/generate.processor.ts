import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Job as BullJob } from "bullmq";
import { completeText } from "../../ai/gateway";
import {
  JOB_TO_GENERATION_TYPE,
  type GenerationType,
} from "../../ai/prompts/generation.types";
import { buildGenerationPrompt } from "../../ai/prompts/generation.v1";
import { ContextBuilder } from "../../modules/generate/context-builder";
import { parseInspireFromViralOptions } from "../../modules/generate/inspire-from-viral";
import { GenerateService } from "../../modules/generate/generate.service";
import { PromptsService } from "../../modules/prompts/prompts.service";
import { estimateLlmCostUsd } from "../../modules/usage/cost";
import { PrismaService } from "../../prisma/prisma.service";
import { QUEUE_NAMES } from "../../queue/queues";
import { markCompleted, markFailed, markStarted } from "../job-status";

const [, , GENERATE_Q] = QUEUE_NAMES;

type GenerateJobPayload = {
  storyId: string;
  type: GenerationType;
  chapterId?: string;
  arcId?: string;
  inputHash: string;
  options?: Record<string, unknown>;
};

const JSON_OUTPUT_TYPES: GenerationType[] = ["pack.tags"];

@Injectable()
@Processor(GENERATE_Q)
export class GenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerateProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly promptsService: PromptsService,
    private readonly contextBuilder: ContextBuilder,
    private readonly generateService: GenerateService,
  ) {
    super();
  }

  async process(job: BullJob): Promise<void> {
    const jobId = job.id;
    if (!jobId) {
      throw new Error("BullMQ job missing id");
    }

    const generationType = JOB_TO_GENERATION_TYPE[job.name];
    if (!generationType) {
      throw new Error(`Unsupported generate job type: ${job.name}`);
    }

    try {
      await markStarted(this.prisma, jobId);
      const payload = job.data as GenerateJobPayload;
      const outputId = await this.handleGenerate(jobId, generationType, payload);
      await markCompleted(this.prisma, jobId, {
        storyId: payload.storyId,
        type: generationType,
        outputId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Generate job ${jobId} failed: ${message}`);
      await markFailed(this.prisma, jobId, message);
      throw error;
    }
  }

  private async handleGenerate(
    jobId: string,
    type: GenerationType,
    payload: GenerateJobPayload,
  ): Promise<string> {
    const { storyId, chapterId, arcId, inputHash } = payload;
    if (!storyId || !inputHash) {
      throw new Error("Generate job requires storyId and inputHash");
    }

    const template = await this.promptsService.getActiveTemplate(type);
    if (!template) {
      throw new Error(`No active prompt template for ${type}`);
    }

    const existing = await this.generateService.findByDedupeKey({
      storyId,
      type,
      promptVersion: template.version,
      inputHash,
    });
    if (existing) {
      return existing.id;
    }

    const inspireFromViral = parseInspireFromViralOptions(payload.options);

    const context = await this.contextBuilder.build(storyId, {
      type,
      chapterId,
      arcId,
      inspireFromViral,
    });

    const prompt = buildGenerationPrompt({
      templateBody: template.body,
      type,
      context,
    });

    const llm = await completeText(prompt, { type });

    const contentJson =
      JSON_OUTPUT_TYPES.includes(type) && llm.text.trim().startsWith("[")
        ? (JSON.parse(llm.text) as unknown)
        : null;

    const output = await this.prisma.generationOutput.create({
      data: {
        storyId,
        chapterId: chapterId ?? null,
        arcId: arcId ?? null,
        type,
        promptTemplateId: template.id,
        promptVersion: template.version,
        inputRef: {
          inputHash,
          chapterId: chapterId ?? null,
          arcId: arcId ?? null,
        },
        content: contentJson ? null : llm.text,
        contentJson: contentJson ?? undefined,
        status: "ready",
        tokensIn: llm.tokensIn,
        tokensOut: llm.tokensOut,
      },
    });

    await this.prisma.usageEvent.create({
      data: {
        jobId,
        provider: llm.provider,
        model: llm.model,
        tokensIn: llm.tokensIn,
        tokensOut: llm.tokensOut,
        costUsd: estimateLlmCostUsd(llm.tokensIn, llm.tokensOut, llm.model),
      },
    });

    return output.id;
  }
}

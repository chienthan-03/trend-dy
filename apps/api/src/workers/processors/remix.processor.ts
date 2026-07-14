import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Job as BullJob } from "bullmq";
import type { Prisma } from "@prisma/client";
import { completeText } from "../../ai/gateway";
import {
  buildRemixPrompt,
  parseRemixPackageJson,
  REMIX_PACKAGE_V1_KEY,
} from "../../ai/prompts/remix.package.v1";
import { createDouyinVideoAdapter } from "../../modules/remix/douyin-video.adapter";
import type { DouyinVideoDetail } from "../../modules/remix/douyin-video.adapter";
import { RemixService } from "../../modules/remix/remix.service";
import { JobsService } from "../../modules/jobs/jobs.service";
import { PromptsService } from "../../modules/prompts/prompts.service";
import { estimateLlmCostUsd } from "../../modules/usage/cost";
import { PrismaService } from "../../prisma/prisma.service";
import { QUEUE_NAMES } from "../../queue/queues";
import { markCompleted, markFailed, markStarted } from "../job-status";

const [, , , , , REMIX_Q] = QUEUE_NAMES;

type RemixResolvePayload = {
  remakeId: string;
  shareUrl: string;
};

type RemixFetchDetailPayload = {
  remakeId: string;
  videoId?: string;
};

type RemixGeneratePayload = {
  remakeId: string;
};

const toSourceSnapshot = (detail: DouyinVideoDetail): Prisma.InputJsonValue => ({
  videoId: detail.videoId,
  title: detail.title,
  caption: detail.caption,
  authorHandle: detail.authorHandle,
  stats: detail.stats,
  coverUrl: detail.coverUrl ?? null,
  canonicalUrl: detail.canonicalUrl ?? null,
  publishedAt: detail.publishedAt?.toISOString() ?? null,
  playUrl: detail.playUrl ?? null,
  rawPayload: detail.rawPayload as Prisma.InputJsonValue,
});

const withRemixLlmModel = async <T>(fn: () => Promise<T>): Promise<T> => {
  const remixModel = process.env.REMIX_LLM_MODEL?.trim();
  if (!remixModel) {
    return fn();
  }

  const previousModel = process.env.LLM_MODEL;
  process.env.LLM_MODEL = remixModel;
  try {
    return await fn();
  } finally {
    if (previousModel !== undefined) {
      process.env.LLM_MODEL = previousModel;
    } else {
      delete process.env.LLM_MODEL;
    }
  }
};

@Injectable()
@Processor(REMIX_Q)
export class RemixProcessor extends WorkerHost {
  private readonly logger = new Logger(RemixProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
    private readonly promptsService: PromptsService,
    private readonly remixService: RemixService,
  ) {
    super();
  }

  async process(job: BullJob): Promise<void> {
    const jobId = job.id;
    if (!jobId) {
      throw new Error("BullMQ job missing id");
    }

    let remakeId: string | undefined;

    try {
      await markStarted(this.prisma, jobId);

      switch (job.name) {
        case "remix_resolve":
          remakeId = (job.data as RemixResolvePayload).remakeId;
          await this.handleResolve(jobId, job.data as RemixResolvePayload);
          break;
        case "remix_fetch_detail":
          remakeId = (job.data as RemixFetchDetailPayload).remakeId;
          await this.handleFetchDetail(jobId, job.data as RemixFetchDetailPayload);
          break;
        case "remix_generate":
          remakeId = (job.data as RemixGeneratePayload).remakeId;
          await this.handleGenerate(jobId, job.data as RemixGeneratePayload);
          break;
        default:
          throw new Error(`Unsupported remix job type: ${job.name}`);
      }

      await markCompleted(this.prisma, jobId, { remakeId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Remix job ${jobId} failed: ${message}`);

      if (remakeId) {
        await this.prisma.viralRemake.update({
          where: { id: remakeId },
          data: { status: "failed" },
        });
      }

      await markFailed(this.prisma, jobId, message);
      throw error;
    }
  }

  private async handleResolve(
    jobId: string,
    payload: RemixResolvePayload,
  ): Promise<void> {
    const { remakeId, shareUrl } = payload;
    if (!remakeId || !shareUrl?.trim()) {
      throw new Error("remix_resolve requires remakeId and shareUrl");
    }

    await this.remixService.getRemake(remakeId);

    const adapter = await createDouyinVideoAdapter();
    const resolved = await adapter.resolveShareUrl(shareUrl.trim());

    await this.prisma.viralRemake.update({
      where: { id: remakeId },
      data: {
        externalVideoId: resolved.videoId,
        sourceUrl: resolved.canonicalUrl ?? shareUrl.trim(),
      },
    });

    await this.jobsService.enqueue({
      type: "remix_fetch_detail",
      payload: {
        remakeId,
        videoId: resolved.videoId,
      },
    });

    this.logger.log(
      `remix_resolve ${jobId}: resolved ${remakeId} → ${resolved.videoId}`,
    );
  }

  private async handleFetchDetail(
    jobId: string,
    payload: RemixFetchDetailPayload,
  ): Promise<void> {
    const { remakeId, videoId } = payload;
    if (!remakeId) {
      throw new Error("remix_fetch_detail requires remakeId");
    }

    const remake = await this.remixService.getRemake(remakeId);
    const targetVideoId = videoId ?? remake.externalVideoId;
    if (!targetVideoId || targetVideoId === "pending") {
      throw new Error("remix_fetch_detail requires a resolved videoId");
    }

    const adapter = await createDouyinVideoAdapter();
    const detail = await adapter.getVideoDetail(targetVideoId);

    await this.prisma.viralRemake.update({
      where: { id: remakeId },
      data: {
        sourceSnapshot: toSourceSnapshot(detail),
        status: "running",
      },
    });

    await this.jobsService.enqueue({
      type: "remix_generate",
      payload: { remakeId },
    });

    this.logger.log(`remix_fetch_detail ${jobId}: snapshot saved for ${remakeId}`);
  }

  private async handleGenerate(
    jobId: string,
    payload: RemixGeneratePayload,
  ): Promise<void> {
    const { remakeId } = payload;
    if (!remakeId) {
      throw new Error("remix_generate requires remakeId");
    }

    const remake = await this.remixService.getRemake(remakeId);
    if (!remake.sourceSnapshot) {
      throw new Error(`Remake ${remakeId} has no sourceSnapshot`);
    }

    const template = await this.promptsService.getActiveTemplate(
      REMIX_PACKAGE_V1_KEY as never,
    );
    if (!template) {
      throw new Error(`No active prompt template for ${REMIX_PACKAGE_V1_KEY}`);
    }

    const snapshot = remake.sourceSnapshot as Record<string, unknown>;
    const locale = process.env.REMIX_DEFAULT_LOCALE?.trim() || "vi";
    const { user } = buildRemixPrompt({
      caption: typeof snapshot.caption === "string" ? snapshot.caption : "",
      title: typeof snapshot.title === "string" ? snapshot.title : "",
      genre: remake.genre ?? "unknown",
      locale,
    });

    const llm = await withRemixLlmModel(() =>
      completeText(user, {
        type: "remix_generate",
        system: template.body,
      }),
    );

    const packageJson = parseRemixPackageJson(llm.text);
    const policyWarnings = this.remixService.computePolicyWarnings({
      sourceSnapshot: remake.sourceSnapshot,
      packageJson,
    });
    const costUsd = estimateLlmCostUsd(llm.tokensIn, llm.tokensOut);

    await this.prisma.viralRemake.update({
      where: { id: remakeId },
      data: {
        packageJson: packageJson as Prisma.InputJsonValue,
        policyWarnings,
        status: "ready",
        tokensIn: llm.tokensIn,
        tokensOut: llm.tokensOut,
        costUsd,
      },
    });

    await this.prisma.usageEvent.create({
      data: {
        jobId,
        provider: llm.provider,
        model: llm.model,
        tokensIn: llm.tokensIn,
        tokensOut: llm.tokensOut,
        costUsd,
      },
    });

    this.logger.log(
      `remix_generate ${jobId}: package ready for ${remakeId} (${llm.tokensIn}+${llm.tokensOut} tokens)`,
    );
  }
}

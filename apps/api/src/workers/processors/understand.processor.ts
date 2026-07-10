import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Job as BullJob } from "bullmq";
import { completeJson } from "../../ai/gateway";
import {
  buildExtractChapterPrompt,
  extractChapterV1Schema,
} from "../../ai/prompts/extract.chapter.v1";
import { ArcRollupService } from "../../modules/understand/arc-rollup.service";
import { ExtractService } from "../../modules/understand/extract.service";
import { PrismaService } from "../../prisma/prisma.service";
import { QUEUE_NAMES } from "../../queue/queues";
import {
  markCompleted,
  markFailed,
  markStarted,
} from "../job-status";

const [, UNDERSTAND_Q] = QUEUE_NAMES;

type ExtractChapterPayload = {
  storyId: string;
  chapterId: string;
};

type RollupArcsPayload = {
  storyId: string;
};

@Injectable()
@Processor(UNDERSTAND_Q)
export class UnderstandProcessor extends WorkerHost {
  private readonly logger = new Logger(UnderstandProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly extractService: ExtractService,
    private readonly arcRollupService: ArcRollupService,
  ) {
    super();
  }

  async process(job: BullJob): Promise<void> {
    const jobId = job.id;
    if (!jobId) {
      throw new Error("BullMQ job missing id");
    }

    try {
      await markStarted(this.prisma, jobId);

      switch (job.name) {
        case "extract_chapter":
          await this.handleExtractChapter(
            jobId,
            job.data as ExtractChapterPayload,
          );
          break;
        case "rollup_arcs":
          await this.handleRollupArcs(jobId, job.data as RollupArcsPayload);
          break;
        default:
          throw new Error(`Unsupported understand job type: ${job.name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Understand job ${jobId} failed: ${message}`);
      await markFailed(this.prisma, jobId, message);
      throw error;
    }
  }

  private async handleExtractChapter(
    jobId: string,
    payload: ExtractChapterPayload,
  ): Promise<void> {
    const { storyId, chapterId } = payload;
    if (!storyId || !chapterId) {
      throw new Error("extract_chapter requires storyId and chapterId");
    }

    const chapter = await this.prisma.chapter.findFirst({
      where: { id: chapterId, storyId },
      include: { story: { select: { title: true } } },
    });
    if (!chapter) {
      throw new Error(`Chapter ${chapterId} not found on story ${storyId}`);
    }

    const chapterText = chapter.cleanText ?? chapter.rawText ?? "";
    if (!chapterText.trim()) {
      throw new Error(`Chapter ${chapterId} has no text to extract`);
    }

    const prompt = buildExtractChapterPrompt({
      storyTitle: chapter.story.title,
      chapterNumber: chapter.number,
      chapterTitle: chapter.title,
      chapterText,
    });

    const llm = await completeJson(prompt, extractChapterV1Schema, {
      system:
        "You extract structured story graph data. Respond with valid JSON only.",
    });

    await this.extractService.upsertChapterGraph({
      storyId,
      chapterId,
      extract: llm.data,
    });

    await this.prisma.usageEvent.create({
      data: {
        jobId,
        provider: llm.provider,
        model: llm.model,
        tokensIn: llm.tokensIn,
        tokensOut: llm.tokensOut,
      },
    });

    await markCompleted(this.prisma, jobId, {
      storyId,
      chapterId,
      characterCount: llm.data.characters.length,
      eventCount: llm.data.events.length,
    });
  }

  private async handleRollupArcs(
    jobId: string,
    payload: RollupArcsPayload,
  ): Promise<void> {
    const { storyId } = payload;
    if (!storyId) {
      throw new Error("rollup_arcs requires storyId");
    }

    const result = await this.arcRollupService.rollupArcs(storyId);

    await markCompleted(this.prisma, jobId, {
      storyId,
      ...result,
    });
  }
}

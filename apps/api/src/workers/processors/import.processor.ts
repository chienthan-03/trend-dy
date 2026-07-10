import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job as BullJob } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { QUEUE_NAMES } from "../../queue/queues";
import {
  markCompleted,
  markFailed,
  markStarted,
} from "../job-status";
import { JobsService } from "../../modules/jobs/jobs.service";
import { parseEpub } from "../../modules/import/parsers/epub.parser";
import { parseTxt } from "../../modules/import/parsers/txt.parser";
import type { ParsedChapter } from "../../modules/import/parsers/types";
import {
  extractMainText,
  fetchUrlText,
} from "../../modules/import/parsers/url-fetch";
import {
  chunkAndEmbedStory,
} from "../../modules/import/chunk-embed.service";
import {
  estimateWordCount,
  hashContent,
} from "../../modules/import/import.service";
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from "../../modules/import/storage/object-storage";

const [IMPORT_Q] = QUEUE_NAMES;

type ParseFilePayload = {
  storyId: string;
  objectKey: string;
  filename?: string;
  contentType?: string;
};

type FetchUrlPayload = {
  storyId: string;
  url: string;
};

type ChunkEmbedPayload = {
  storyId: string;
};

/**
 * Import queue processor.
 *
 * Re-import policy (MVP): **replace-all** — deletes existing chapters for the
 * story, then inserts the newly parsed set with sequential numbers.
 * `chunk_embed` chunks chapter text and stores pgvector embeddings.
 */
@Injectable()
@Processor(IMPORT_Q)
export class ImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
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
        case "parse_file":
          await this.handleParseFile(jobId, job.data as ParseFilePayload);
          break;
        case "fetch_url":
          await this.handleFetchUrl(jobId, job.data as FetchUrlPayload);
          break;
        case "chunk_embed":
          await this.handleChunkEmbed(jobId, job.data as ChunkEmbedPayload);
          break;
        default:
          throw new Error(`Unsupported import job type: ${job.name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Import job ${jobId} failed: ${message}`);
      await markFailed(this.prisma, jobId, message);
      throw error;
    }
  }

  private async handleParseFile(
    jobId: string,
    payload: ParseFilePayload,
  ): Promise<void> {
    const { storyId, objectKey, filename } = payload;
    if (!storyId || !objectKey) {
      throw new Error("parse_file requires storyId and objectKey");
    }

    const buffer = await this.storage.getObject(objectKey);
    const chapters = await this.parseBuffer(buffer, filename ?? objectKey);
    await this.replaceChapters(storyId, chapters);

    await this.jobsService.enqueue({
      type: "chunk_embed",
      storyId,
      payload: { storyId, sourceJobId: jobId },
    });

    await markCompleted(this.prisma, jobId, {
      chapterCount: chapters.length,
      objectKey,
    });
  }

  private async handleFetchUrl(
    jobId: string,
    payload: FetchUrlPayload,
  ): Promise<void> {
    const { storyId, url } = payload;
    if (!storyId || !url) {
      throw new Error("fetch_url requires storyId and url");
    }

    const { text, rawHtml } = await fetchUrlText(url);
    const objectKey = `imports/${storyId}/${jobId}-raw.html`;
    await this.storage.putObject(objectKey, rawHtml, "text/html; charset=utf-8");

    const chapters = parseTxt(text);
    await this.replaceChapters(storyId, chapters);

    await this.jobsService.enqueue({
      type: "chunk_embed",
      storyId,
      payload: { storyId, sourceJobId: jobId, objectKey },
    });

    await markCompleted(this.prisma, jobId, {
      chapterCount: chapters.length,
      objectKey,
      url,
    });
  }

  private async handleChunkEmbed(
    jobId: string,
    payload: ChunkEmbedPayload,
  ): Promise<void> {
    if (!payload.storyId) {
      throw new Error("chunk_embed requires storyId");
    }

    const result = await chunkAndEmbedStory(
      this.prisma,
      payload.storyId,
      jobId,
    );

    await markCompleted(this.prisma, jobId, {
      storyId: payload.storyId,
      ...result,
    });
  }

  private async parseBuffer(
    buffer: Buffer,
    filename: string,
  ): Promise<ParsedChapter[]> {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".epub")) {
      return parseEpub(buffer);
    }
    // Default: treat as UTF-8 text (txt / html / unknown)
    const text = buffer.toString("utf8");
    if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      return parseTxt(extractMainText(text));
    }
    return parseTxt(text);
  }

  /**
   * MVP re-import: delete all chapters for the story, then insert sequential rows.
   */
  private async replaceChapters(
    storyId: string,
    chapters: ParsedChapter[],
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.chapter.deleteMany({ where: { storyId } });
      if (chapters.length === 0) {
        return;
      }
      await tx.chapter.createMany({
        data: chapters.map((ch, index) => {
          const cleanText = ch.text;
          return {
            storyId,
            number: index + 1,
            title: ch.title,
            rawText: cleanText,
            cleanText,
            contentHash: hashContent(cleanText),
            wordCount: estimateWordCount(cleanText),
            status: "imported",
            importedAt: now,
          };
        }),
      });
    });
  }
}

import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { EnqueueResult } from "../jobs/jobs.service";
import { JobsService } from "../jobs/jobs.service";
import { SourcesService } from "../sources/sources.service";
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from "./storage/object-storage";

export type UploadedImportFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

/**
 * Import pipeline entrypoint.
 *
 * Re-import policy (MVP): the worker **replace-all**s existing Chapter rows
 * for the story after a successful parse — it does not append.
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly sourcesService: SourcesService,
    private readonly jobsService: JobsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async importFile(
    storyId: string,
    file: UploadedImportFile,
  ): Promise<EnqueueResult> {
    await this.sourcesService.assertStoryImportAllowed(storyId);

    if (!file?.buffer?.length) {
      throw new BadRequestException("Empty file upload");
    }

    const safeName = file.originalname.replace(/[^\w.\-]+/g, "_");
    const objectKey = `imports/${storyId}/${randomUUID()}-${safeName}`;
    await this.storage.putObject(
      objectKey,
      file.buffer,
      file.mimetype || "application/octet-stream",
    );

    return this.jobsService.enqueue({
      type: "parse_file",
      storyId,
      payload: {
        objectKey,
        filename: file.originalname,
        contentType: file.mimetype,
      },
    });
  }

  async importUrl(storyId: string, url: string): Promise<EnqueueResult> {
    await this.sourcesService.assertStoryImportAllowed(storyId);

    if (!url?.trim()) {
      throw new BadRequestException("url is required");
    }

    return this.jobsService.enqueue({
      type: "fetch_url",
      storyId,
      payload: { url: url.trim() },
    });
  }
}

export const hashContent = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex");

export const estimateWordCount = (text: string): number => {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
};

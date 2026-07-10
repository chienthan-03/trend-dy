import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job as BullJob } from "bullmq";
import type { JobsService } from "../../modules/jobs/jobs.service";
import type { ObjectStorage } from "../../modules/import/storage/object-storage";
import type { PrismaService } from "../../prisma/prisma.service";
import { ImportProcessor } from "./import.processor";

vi.mock("../job-status", () => ({
  markStarted: vi.fn().mockResolvedValue(undefined),
  markCompleted: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
}));

import { markCompleted, markFailed, markStarted } from "../job-status";

describe("ImportProcessor", () => {
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    chapter: {
      deleteMany: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
    };
  };
  let jobsService: { enqueue: ReturnType<typeof vi.fn> };
  let storage: {
    putObject: ReturnType<typeof vi.fn>;
    getObject: ReturnType<typeof vi.fn>;
  };
  let processor: ImportProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = {
      chapter: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          chapter: {
            deleteMany: prisma.chapter.deleteMany,
            createMany: prisma.chapter.createMany,
          },
        }),
      ),
    };
    jobsService = {
      enqueue: vi.fn().mockResolvedValue({ jobId: "job_embed", status: "queued" }),
    };
    storage = {
      putObject: vi.fn().mockResolvedValue(undefined),
      getObject: vi
        .fn()
        .mockResolvedValue(Buffer.from("Chương 1\nA\nChương 2\nB", "utf8")),
    };
    processor = new ImportProcessor(
      prisma as unknown as PrismaService,
      jobsService as unknown as JobsService,
      storage as unknown as ObjectStorage,
    );
  });

  it("parse_file replaces chapters and enqueues chunk_embed", async () => {
    const job = {
      id: "job_parse",
      name: "parse_file",
      data: {
        storyId: "story_1",
        objectKey: "imports/story_1/raw.txt",
        filename: "novel.txt",
      },
    } as BullJob;

    await processor.process(job);

    expect(markStarted).toHaveBeenCalledWith(prisma, "job_parse");
    expect(storage.getObject).toHaveBeenCalledWith("imports/story_1/raw.txt");
    expect(prisma.chapter.deleteMany).toHaveBeenCalledWith({
      where: { storyId: "story_1" },
    });
    expect(prisma.chapter.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          storyId: "story_1",
          number: 1,
          status: "imported",
          contentHash: expect.any(String),
        }),
        expect.objectContaining({
          storyId: "story_1",
          number: 2,
          status: "imported",
        }),
      ]),
    });
    expect(jobsService.enqueue).toHaveBeenCalledWith({
      type: "chunk_embed",
      storyId: "story_1",
      payload: { storyId: "story_1", sourceJobId: "job_parse" },
    });
    expect(markCompleted).toHaveBeenCalledWith(
      prisma,
      "job_parse",
      expect.objectContaining({ chapterCount: 2 }),
    );
  });

  it("chunk_embed is a completed stub", async () => {
    const job = {
      id: "job_embed",
      name: "chunk_embed",
      data: { storyId: "story_1" },
    } as BullJob;

    await processor.process(job);

    expect(markCompleted).toHaveBeenCalledWith(
      prisma,
      "job_embed",
      expect.objectContaining({ stub: true, storyId: "story_1" }),
    );
  });

  it("marks failed when processing throws", async () => {
    storage.getObject.mockRejectedValue(new Error("S3 down"));
    const job = {
      id: "job_bad",
      name: "parse_file",
      data: { storyId: "story_1", objectKey: "missing" },
    } as BullJob;

    await expect(processor.process(job)).rejects.toThrow("S3 down");
    expect(markFailed).toHaveBeenCalledWith(prisma, "job_bad", "S3 down");
  });
});

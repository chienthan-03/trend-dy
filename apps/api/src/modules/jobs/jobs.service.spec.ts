import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import { JobsService } from "./jobs.service";
import type { PrismaService } from "../../prisma/prisma.service";

type MockQueue = {
  add: ReturnType<typeof vi.fn>;
};

const createMockQueue = (): MockQueue => ({
  add: vi.fn().mockResolvedValue({ id: "bull-job" }),
});

describe("JobsService.enqueue", () => {
  let prisma: {
    job: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let importQueue: MockQueue;
  let understandQueue: MockQueue;
  let generateQueue: MockQueue;
  let assetQueue: MockQueue;
  let discoveryQueue: MockQueue;
  let service: JobsService;

  beforeEach(() => {
    prisma = {
      job: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    importQueue = createMockQueue();
    understandQueue = createMockQueue();
    generateQueue = createMockQueue();
    assetQueue = createMockQueue();
    discoveryQueue = createMockQueue();

    service = new JobsService(
      prisma as unknown as PrismaService,
      importQueue as unknown as Queue,
      understandQueue as unknown as Queue,
      generateQueue as unknown as Queue,
      assetQueue as unknown as Queue,
      discoveryQueue as unknown as Queue,
    );
  });

  it("inserts a Job row then adds a BullMQ job with the same id", async () => {
    const created = {
      id: "job_abc",
      type: "parse_file",
      status: "queued",
      storyId: "story_1",
      payload: { path: "/tmp/novel.txt" },
    };
    prisma.job.create.mockResolvedValue(created);

    const result = await service.enqueue({
      type: "parse_file",
      storyId: "story_1",
      payload: { path: "/tmp/novel.txt" },
    });

    expect(prisma.job.create).toHaveBeenCalledWith({
      data: {
        type: "parse_file",
        status: "queued",
        storyId: "story_1",
        payload: { path: "/tmp/novel.txt" },
      },
    });

    expect(importQueue.add).toHaveBeenCalledWith(
      "parse_file",
      { path: "/tmp/novel.txt", storyId: "story_1" },
      { jobId: "job_abc" },
    );

    // Postgres must be written before BullMQ add
    const createOrder = prisma.job.create.mock.invocationCallOrder[0];
    const addOrder = importQueue.add.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(addOrder);

    expect(result).toEqual({ jobId: "job_abc", status: "queued" });
  });

  it("skips enqueue when an active job shares the idempotency key", async () => {
    const existing = {
      id: "job_existing",
      type: "parse_file",
      status: "queued",
      storyId: "story_1",
      payload: { idempotencyKey: "story_1:parse_file:v1" },
    };
    prisma.job.findFirst.mockResolvedValue(existing);

    const result = await service.enqueue({
      type: "parse_file",
      storyId: "story_1",
      payload: {},
      idempotencyKey: "story_1:parse_file:v1",
    });

    expect(prisma.job.create).not.toHaveBeenCalled();
    expect(importQueue.add).not.toHaveBeenCalled();
    expect(result).toEqual({ jobId: "job_existing", status: "queued" });
  });

  it("routes gen_* types to the generate queue", async () => {
    prisma.job.create.mockResolvedValue({
      id: "job_gen",
      type: "gen_narration",
      status: "queued",
      storyId: null,
      payload: {},
    });

    await service.enqueue({ type: "gen_narration", payload: {} });

    expect(generateQueue.add).toHaveBeenCalledWith(
      "gen_narration",
      {},
      { jobId: "job_gen" },
    );
    expect(importQueue.add).not.toHaveBeenCalled();
  });

  it("routes douyin_* types to the discovery queue", async () => {
    prisma.job.create.mockResolvedValue({
      id: "job_crawl",
      type: "douyin_rank_crawl",
      status: "queued",
      storyId: null,
      payload: { boardId: "b1" },
    });

    await service.enqueue({
      type: "douyin_rank_crawl",
      payload: { boardId: "b1" },
    });

    expect(discoveryQueue.add).toHaveBeenCalledWith(
      "douyin_rank_crawl",
      { boardId: "b1" },
      { jobId: "job_crawl" },
    );
  });

  it("marks the job failed and rethrows when BullMQ enqueue fails", async () => {
    prisma.job.create.mockResolvedValue({
      id: "job_orphan",
      type: "parse_file",
      status: "queued",
      storyId: null,
      payload: {},
    });
    const enqueueError = new Error("Redis connection refused");
    importQueue.add.mockRejectedValue(enqueueError);

    await expect(
      service.enqueue({ type: "parse_file", payload: {} }),
    ).rejects.toThrow("Redis connection refused");

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: "job_orphan" },
      data: {
        status: "failed",
        finishedAt: expect.any(Date),
        error: "Redis connection refused",
      },
    });
  });
});

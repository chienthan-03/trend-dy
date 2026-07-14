import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import { JobsService } from "./jobs.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { BudgetGuard } from "../usage/budget.guard";

type MockQueue = {
  add: ReturnType<typeof vi.fn>;
  getJob: ReturnType<typeof vi.fn>;
};

const createMockQueue = (): MockQueue => ({
  add: vi.fn().mockResolvedValue({ id: "bull-job" }),
  getJob: vi.fn().mockResolvedValue(null),
});

const createBudgetGuard = () => ({
  assertWithinDailyBudget: vi.fn().mockResolvedValue(undefined),
  getTodaySpendUsd: vi.fn().mockResolvedValue(0),
});

const createService = (
  prisma: {
    job: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  },
  queues?: {
    importQueue?: MockQueue;
    understandQueue?: MockQueue;
    generateQueue?: MockQueue;
    assetQueue?: MockQueue;
    discoveryQueue?: MockQueue;
    remixQueue?: MockQueue;
  },
  budgetGuard?: ReturnType<typeof createBudgetGuard>,
) => {
  const importQueue = queues?.importQueue ?? createMockQueue();
  const understandQueue = queues?.understandQueue ?? createMockQueue();
  const generateQueue = queues?.generateQueue ?? createMockQueue();
  const assetQueue = queues?.assetQueue ?? createMockQueue();
  const discoveryQueue = queues?.discoveryQueue ?? createMockQueue();
  const remixQueue = queues?.remixQueue ?? createMockQueue();
  const guard = budgetGuard ?? createBudgetGuard();

  const service = new JobsService(
    prisma as unknown as PrismaService,
    guard as unknown as BudgetGuard,
    importQueue as unknown as Queue,
    understandQueue as unknown as Queue,
    generateQueue as unknown as Queue,
    assetQueue as unknown as Queue,
    discoveryQueue as unknown as Queue,
    remixQueue as unknown as Queue,
  );

  return {
    service,
    importQueue,
    understandQueue,
    generateQueue,
    assetQueue,
    discoveryQueue,
    remixQueue,
    budgetGuard: guard,
  };
};

describe("JobsService.enqueue", () => {
  let prisma: {
    job: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
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
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const created = createService(prisma);
    service = created.service;
    importQueue = created.importQueue;
    understandQueue = created.understandQueue;
    generateQueue = created.generateQueue;
    assetQueue = created.assetQueue;
    discoveryQueue = created.discoveryQueue;
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

describe("JobsService.list", () => {
  let prisma: {
    job: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let service: JobsService;

  beforeEach(() => {
    prisma = {
      job: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    service = createService(prisma).service;
  });

  it("filters jobs by storyId and status", async () => {
    const jobs = [{ id: "job_1", status: "queued", storyId: "story_1" }];
    prisma.job.findMany.mockResolvedValue(jobs);

    const result = await service.list({
      storyId: "story_1",
      status: "queued",
    });

    expect(prisma.job.findMany).toHaveBeenCalledWith({
      where: { storyId: "story_1", status: "queued" },
      orderBy: { createdAt: "desc" },
    });
    expect(result).toEqual(jobs);
  });
});

describe("JobsService.findById", () => {
  let prisma: {
    job: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let service: JobsService;

  beforeEach(() => {
    prisma = {
      job: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    service = createService(prisma).service;
  });

  it("throws NotFoundException when the job is missing", async () => {
    prisma.job.findUnique.mockResolvedValue(null);

    await expect(service.findById("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("JobsService.retry", () => {
  let prisma: {
    job: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let importQueue: MockQueue;
  let service: JobsService;

  beforeEach(() => {
    prisma = {
      job: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const created = createService(prisma);
    service = created.service;
    importQueue = created.importQueue;
  });

  it("re-enqueues a failed job from its stored payload", async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: "job_failed",
      type: "parse_file",
      status: "failed",
      storyId: "story_1",
      payload: { path: "/tmp/novel.txt" },
    });

    const result = await service.retry("job_failed");

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: "job_failed" },
      data: {
        status: "queued",
        error: null,
        finishedAt: null,
        result: null,
      },
    });
    expect(importQueue.add).toHaveBeenCalledWith(
      "parse_file",
      { path: "/tmp/novel.txt", storyId: "story_1" },
      { jobId: "job_failed" },
    );
    expect(result).toEqual({ jobId: "job_failed", status: "queued" });
  });

  it("rejects retry when the job is not failed", async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: "job_active",
      type: "parse_file",
      status: "active",
      storyId: null,
      payload: {},
    });

    await expect(service.retry("job_active")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(importQueue.add).not.toHaveBeenCalled();
  });
});

describe("JobsService.cancel", () => {
  let prisma: {
    job: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let importQueue: MockQueue;
  let service: JobsService;

  beforeEach(() => {
    prisma = {
      job: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const created = createService(prisma);
    service = created.service;
    importQueue = created.importQueue;
  });

  it("marks a queued job cancelled and removes it from BullMQ", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    importQueue.getJob.mockResolvedValue({ remove });

    prisma.job.findUnique.mockResolvedValue({
      id: "job_queued",
      type: "parse_file",
      status: "queued",
      storyId: null,
      payload: {},
    });

    const result = await service.cancel("job_queued");

    expect(importQueue.getJob).toHaveBeenCalledWith("job_queued");
    expect(remove).toHaveBeenCalled();
    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: "job_queued" },
      data: {
        status: "cancelled",
        finishedAt: expect.any(Date),
      },
    });
    expect(result).toEqual({ jobId: "job_queued", status: "cancelled" });
  });

  it("rejects cancel when the job is not queued or pending", async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: "job_active",
      type: "parse_file",
      status: "active",
      storyId: null,
      payload: {},
    });

    await expect(service.cancel("job_active")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(importQueue.getJob).not.toHaveBeenCalled();
  });
});

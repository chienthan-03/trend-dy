import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import { JobsService } from "../jobs/jobs.service";
import type { PrismaService } from "../../prisma/prisma.service";
import { BudgetGuard } from "./budget.guard";

describe("BudgetGuard", () => {
  let prisma: {
    usageEvent: {
      aggregate: ReturnType<typeof vi.fn>;
    };
  };
  let guard: BudgetGuard;

  beforeEach(() => {
    prisma = {
      usageEvent: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { costUsd: 0 } }),
      },
    };
    guard = new BudgetGuard(prisma as unknown as PrismaService);
  });

  it("throws 429 when today's spend meets or exceeds AI_DAILY_BUDGET_USD", async () => {
    process.env.AI_DAILY_BUDGET_USD = "10";
    prisma.usageEvent.aggregate.mockResolvedValue({ _sum: { costUsd: 10.5 } });

    await expect(guard.assertWithinDailyBudget()).rejects.toBeInstanceOf(
      HttpException,
    );

    try {
      await guard.assertWithinDailyBudget();
    } catch (error) {
      expect(error).toMatchObject({ status: 429 });
      const response = (error as HttpException).getResponse() as {
        error: { code: string; message: string };
      };
      expect(response.error.code).toBe("daily_budget_exceeded");
      expect(response.error.message).toMatch(/daily ai budget/i);
    }
  });

  it("allows requests when spend is below the daily cap", async () => {
    process.env.AI_DAILY_BUDGET_USD = "10";
    prisma.usageEvent.aggregate.mockResolvedValue({ _sum: { costUsd: 9.99 } });

    await expect(guard.assertWithinDailyBudget()).resolves.toBeUndefined();
  });

  it("skips the budget check when AI_DAILY_BUDGET_USD is unset", async () => {
    delete process.env.AI_DAILY_BUDGET_USD;

    await expect(guard.assertWithinDailyBudget()).resolves.toBeUndefined();
    expect(prisma.usageEvent.aggregate).not.toHaveBeenCalled();
  });
});

describe("JobsService budget guard on enqueue", () => {
  const createMockQueue = () => ({
    add: vi.fn().mockResolvedValue({ id: "bull-job" }),
    getJob: vi.fn().mockResolvedValue(null),
  });

  let prisma: {
    job: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let understandQueue: ReturnType<typeof createMockQueue>;
  let generateQueue: ReturnType<typeof createMockQueue>;
  let importQueue: ReturnType<typeof createMockQueue>;
  let budgetGuard: { assertWithinDailyBudget: ReturnType<typeof vi.fn> };
  let service: JobsService;

  beforeEach(() => {
    process.env.AI_DAILY_BUDGET_USD = "10";
    prisma = {
      job: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    understandQueue = createMockQueue();
    generateQueue = createMockQueue();
    importQueue = createMockQueue();
    budgetGuard = {
      assertWithinDailyBudget: vi
        .fn()
        .mockRejectedValue(
          new HttpException(
            {
              error: {
                code: "daily_budget_exceeded",
                message: "Daily AI budget exceeded.",
              },
            },
            429,
          ),
        ),
    };

    service = new JobsService(
      prisma as unknown as PrismaService,
      budgetGuard as unknown as BudgetGuard,
      importQueue as unknown as Queue,
      understandQueue as unknown as Queue,
      generateQueue as unknown as Queue,
      createMockQueue() as unknown as Queue,
      createMockQueue() as unknown as Queue,
    );
  });

  it("blocks understand jobs when the daily budget is exceeded", async () => {
    await expect(
      service.enqueue({ type: "extract_chapter", storyId: "story_1" }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(budgetGuard.assertWithinDailyBudget).toHaveBeenCalled();
    expect(prisma.job.create).not.toHaveBeenCalled();
    expect(understandQueue.add).not.toHaveBeenCalled();
  });

  it("blocks generate jobs when the daily budget is exceeded", async () => {
    await expect(
      service.enqueue({ type: "gen_narration", storyId: "story_1" }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(budgetGuard.assertWithinDailyBudget).toHaveBeenCalled();
    expect(prisma.job.create).not.toHaveBeenCalled();
    expect(generateQueue.add).not.toHaveBeenCalled();
  });

  it("does not check budget for non-AI job types", async () => {
    budgetGuard.assertWithinDailyBudget.mockResolvedValue(undefined);
    prisma.job.create.mockResolvedValue({
      id: "job_import",
      type: "parse_file",
      status: "queued",
      storyId: null,
      payload: {},
    });

    await service.enqueue({ type: "parse_file", payload: {} });

    expect(budgetGuard.assertWithinDailyBudget).not.toHaveBeenCalled();
    expect(importQueue.add).toHaveBeenCalled();
  });
});

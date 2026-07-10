import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { markCompleted, markFailed, markStarted } from "./job-status";

describe("job-status helpers", () => {
  let prisma: {
    job: {
      update: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    prisma = {
      job: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
  });

  it("markStarted sets status active and startedAt", async () => {
    await markStarted(prisma as unknown as PrismaService, "job_1");

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: "job_1" },
      data: {
        status: "active",
        startedAt: expect.any(Date),
        attempts: { increment: 1 },
      },
    });
  });

  it("markCompleted sets status completed and finishedAt", async () => {
    await markCompleted(prisma as unknown as PrismaService, "job_1", {
      ok: true,
    });

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: "job_1" },
      data: {
        status: "completed",
        finishedAt: expect.any(Date),
        error: null,
        result: { ok: true },
      },
    });
  });

  it("markFailed sets status failed, error, and finishedAt", async () => {
    await markFailed(
      prisma as unknown as PrismaService,
      "job_1",
      "boom",
    );

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: "job_1" },
      data: {
        status: "failed",
        finishedAt: expect.any(Date),
        error: "boom",
      },
    });
  });
});

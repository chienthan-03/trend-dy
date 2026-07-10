import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * Shared helpers for BullMQ processors to keep Postgres Job.status in sync.
 * Processors should call these — not update Job rows ad hoc.
 */

export const markStarted = async (
  prisma: PrismaService,
  jobId: string,
): Promise<void> => {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "active",
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
};

export const markCompleted = async (
  prisma: PrismaService,
  jobId: string,
  result?: Prisma.InputJsonValue,
): Promise<void> => {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "completed",
      finishedAt: new Date(),
      error: null,
      ...(result !== undefined ? { result } : {}),
    },
  });
};

export const markFailed = async (
  prisma: PrismaService,
  jobId: string,
  error: string,
): Promise<void> => {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "failed",
      finishedAt: new Date(),
      error,
    },
  });
};

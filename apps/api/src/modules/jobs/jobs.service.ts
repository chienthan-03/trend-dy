import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  Inject,
  Injectable,
  MessageEvent,
  NotFoundException,
} from "@nestjs/common";
import type { Job, Prisma } from "@prisma/client";
import type { Queue } from "bullmq";
import { Observable, from, interval } from "rxjs";
import { map, startWith, switchMap, takeWhile } from "rxjs/operators";
import { PrismaService } from "../../prisma/prisma.service";
import type { QueueName } from "../../queue/queues";
import { markFailed } from "../../workers/job-status";
import { isAiBudgetedJobType } from "../usage/ai-job-types";
import { BudgetGuard } from "../usage/budget.guard";
import { resolveQueueName } from "./job-type-to-queue";

const TERMINAL_JOB_STATUSES = ["completed", "failed", "cancelled"] as const;

export type ListJobsFilters = {
  storyId?: string;
  status?: string;
};

/** Statuses that count as "in flight" for idempotency checks. */
export const ACTIVE_JOB_STATUSES = [
  "pending",
  "queued",
  "active",
  "running",
] as const;

export type EnqueueInput = {
  type: string;
  storyId?: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
};

export type EnqueueResult = {
  jobId: string;
  status: string;
};

@Injectable()
export class JobsService {
  private readonly queues: Record<QueueName, Queue>;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BudgetGuard) private readonly budgetGuard: BudgetGuard,
    @InjectQueue("import") importQueue: Queue,
    @InjectQueue("understand") understandQueue: Queue,
    @InjectQueue("generate") generateQueue: Queue,
    @InjectQueue("asset") assetQueue: Queue,
    @InjectQueue("discovery") discoveryQueue: Queue,
    @InjectQueue("remix") remixQueue: Queue,
  ) {
    this.queues = {
      import: importQueue,
      understand: understandQueue,
      generate: generateQueue,
      asset: assetQueue,
      discovery: discoveryQueue,
      remix: remixQueue,
    };
  }

  /**
   * Persist a Postgres Job first, then enqueue to BullMQ with the same id.
   * Never call queue.add directly from other modules — always use this method.
   */
  async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    const { type, storyId, idempotencyKey } = input;
    const basePayload = { ...(input.payload ?? {}) };

    if (isAiBudgetedJobType(type)) {
      await this.budgetGuard.assertWithinDailyBudget();
    }

    if (idempotencyKey) {
      const existing = await this.findActiveByIdempotencyKey(idempotencyKey);
      if (existing) {
        return { jobId: existing.id, status: existing.status };
      }
      basePayload.idempotencyKey = idempotencyKey;
    }

    const payload = basePayload as Prisma.InputJsonValue;

    // Always persist Postgres before BullMQ so the Job row is the source of truth.
    const job = await this.prisma.job.create({
      data: {
        type,
        status: "queued",
        storyId: storyId ?? null,
        payload,
      },
    });

    const queueName = resolveQueueName(type);
    const queue = this.queues[queueName];
    const bullPayload = {
      ...basePayload,
      ...(storyId ? { storyId } : {}),
    };

    try {
      await queue.add(type, bullPayload, { jobId: job.id });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "BullMQ enqueue failed";
      await markFailed(this.prisma, job.id, message);
      throw error;
    }

    return { jobId: job.id, status: job.status };
  }

  async list(filters: ListJobsFilters = {}): Promise<Job[]> {
    const where: Prisma.JobWhereInput = {};

    if (filters.storyId) {
      where.storyId = filters.storyId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    return this.prisma.job.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string): Promise<Job> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }
    return job;
  }

  streamEvents(jobId: string): Observable<MessageEvent> {
    return interval(1000).pipe(
      startWith(0),
      switchMap(() => from(this.findById(jobId))),
      map((job) => ({ job, event: this.toJobMessageEvent(job) })),
      takeWhile(({ job }) => !this.isTerminalStatus(job.status), true),
      map(({ event }) => event),
    );
  }

  async retry(id: string): Promise<EnqueueResult> {
    const job = await this.findById(id);

    if (isAiBudgetedJobType(job.type)) {
      await this.budgetGuard.assertWithinDailyBudget();
    }

    if (job.status !== "failed") {
      throw new BadRequestException(
        `Job ${id} is not failed (status: ${job.status})`,
      );
    }

    const basePayload = (job.payload ?? {}) as Record<string, unknown>;
    const queueName = resolveQueueName(job.type);
    const queue = this.queues[queueName];
    const bullPayload = {
      ...basePayload,
      ...(job.storyId ? { storyId: job.storyId } : {}),
    };

    await this.prisma.job.update({
      where: { id },
      data: {
        status: "queued",
        error: null,
        finishedAt: null,
        result: null,
      },
    });

    try {
      await queue.add(job.type, bullPayload, { jobId: job.id });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "BullMQ enqueue failed";
      await markFailed(this.prisma, job.id, message);
      throw error;
    }

    return { jobId: job.id, status: "queued" };
  }

  async cancel(id: string): Promise<EnqueueResult> {
    const job = await this.findById(id);

    if (job.status !== "queued" && job.status !== "pending") {
      throw new BadRequestException(
        `Job ${id} cannot be cancelled (status: ${job.status})`,
      );
    }

    const queueName = resolveQueueName(job.type);
    const queue = this.queues[queueName];

    try {
      const bullJob = await queue.getJob(job.id);
      if (bullJob) {
        await bullJob.remove();
      }
    } catch {
      // Best-effort BullMQ removal; Postgres status is still updated.
    }

    await this.prisma.job.update({
      where: { id },
      data: {
        status: "cancelled",
        finishedAt: new Date(),
      },
    });

    return { jobId: id, status: "cancelled" };
  }

  private toJobMessageEvent(job: Job): MessageEvent {
    return {
      data: {
        id: job.id,
        type: job.type,
        status: job.status,
        storyId: job.storyId,
        error: job.error,
        result: job.result,
        attempts: job.attempts,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString() ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
      },
    };
  }

  private isTerminalStatus(status: string): boolean {
    return (TERMINAL_JOB_STATUSES as readonly string[]).includes(status);
  }

  private async findActiveByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<Job | null> {
    return this.prisma.job.findFirst({
      where: {
        status: { in: [...ACTIVE_JOB_STATUSES] },
        payload: {
          path: ["idempotencyKey"],
          equals: idempotencyKey,
        },
      },
    });
  }
}

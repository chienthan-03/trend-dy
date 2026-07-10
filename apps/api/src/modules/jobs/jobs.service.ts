import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Job, Prisma } from "@prisma/client";
import type { Queue } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import type { QueueName } from "../../queue/queues";
import { resolveQueueName } from "./job-type-to-queue";

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
    private readonly prisma: PrismaService,
    @InjectQueue("import") importQueue: Queue,
    @InjectQueue("understand") understandQueue: Queue,
    @InjectQueue("generate") generateQueue: Queue,
    @InjectQueue("asset") assetQueue: Queue,
    @InjectQueue("discovery") discoveryQueue: Queue,
  ) {
    this.queues = {
      import: importQueue,
      understand: understandQueue,
      generate: generateQueue,
      asset: assetQueue,
      discovery: discoveryQueue,
    };
  }

  /**
   * Persist a Postgres Job first, then enqueue to BullMQ with the same id.
   * Never call queue.add directly from other modules — always use this method.
   */
  async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    const { type, storyId, idempotencyKey } = input;
    const basePayload = { ...(input.payload ?? {}) };

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

    await queue.add(type, bullPayload, { jobId: job.id });

    return { jobId: job.id, status: job.status };
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

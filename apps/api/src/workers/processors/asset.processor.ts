import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job as BullJob } from "bullmq";
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from "../../modules/import/storage/object-storage";
import { GenerateService } from "../../modules/generate/generate.service";
import { buildAssetContent } from "../../modules/assets/asset-builders";
import { JOB_TO_ASSET_TYPE } from "../../modules/assets/asset.types";
import { PrismaService } from "../../prisma/prisma.service";
import { QUEUE_NAMES } from "../../queue/queues";
import { markCompleted, markFailed, markStarted } from "../job-status";

const [, , , ASSET_Q] = QUEUE_NAMES;

type AssetJobPayload = {
  outputId: string;
  assetType: string;
  storyId?: string;
};

@Injectable()
@Processor(ASSET_Q)
export class AssetProcessor extends WorkerHost {
  private readonly logger = new Logger(AssetProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generateService: GenerateService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {
    super();
  }

  async process(job: BullJob): Promise<void> {
    const jobId = job.id;
    if (!jobId) {
      throw new Error("BullMQ job missing id");
    }

    const assetType = JOB_TO_ASSET_TYPE[job.name];
    if (!assetType) {
      throw new Error(`Unsupported asset job type: ${job.name}`);
    }

    try {
      await markStarted(this.prisma, jobId);
      const payload = job.data as AssetJobPayload;
      const assetId = await this.handleAssetJob(payload, assetType);
      await markCompleted(this.prisma, jobId, {
        outputId: payload.outputId,
        assetType,
        assetId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Asset job ${jobId} failed: ${message}`);
      await markFailed(this.prisma, jobId, message);
      throw error;
    }
  }

  private async handleAssetJob(
    payload: AssetJobPayload,
    assetType: string,
  ): Promise<string> {
    const { outputId } = payload;
    if (!outputId) {
      throw new Error("Asset job requires outputId");
    }

    const output = await this.generateService.getOutput(outputId);
    const script = output.content?.trim();
    if (!script) {
      throw new Error(`Output ${outputId} has no script content`);
    }

    const existing = await this.prisma.asset.findFirst({
      where: {
        generationOutputId: outputId,
        type: assetType,
      },
    });
    if (existing) {
      return existing.id;
    }

    const built = buildAssetContent(assetType, script);
    const key = `assets/${output.storyId}/${outputId}/${assetType}.${built.extension}`;
    await this.storage.putObject(key, built.body, built.contentType);

    const asset = await this.prisma.asset.create({
      data: {
        storyId: output.storyId,
        generationOutputId: outputId,
        type: assetType,
        uri: key,
        meta: {
          contentType: built.contentType,
          sourceOutputType: output.type,
        },
      },
    });

    return asset.id;
  }
}

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import JSZip from "jszip";
import type { EnqueueResult } from "../jobs/jobs.service";
import { JobsService } from "../jobs/jobs.service";
import { GenerateService } from "../generate/generate.service";
import { StoriesService } from "../stories/stories.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from "../import/storage/object-storage";
import { ASSET_TYPE_TO_JOB, type AssetType } from "./asset.types";
import type { ExportStoryDto } from "./dto/assets.dto";

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
    private readonly generateService: GenerateService,
    private readonly storiesService: StoriesService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async enqueueAssets(
    outputId: string,
    types: AssetType[],
  ): Promise<{ outputId: string; jobs: EnqueueResult[] }> {
    const output = await this.generateService.getOutput(outputId);
    if (!output.content?.trim()) {
      throw new BadRequestException(
        `Output ${outputId} has no script content for asset generation`,
      );
    }

    const jobs: EnqueueResult[] = [];
    for (const type of types) {
      const jobType = ASSET_TYPE_TO_JOB[type];
      const job = await this.jobsService.enqueue({
        type: jobType,
        storyId: output.storyId,
        idempotencyKey: `asset:${outputId}:${type}`,
        payload: {
          outputId,
          assetType: type,
        },
      });
      jobs.push(job);
    }

    return { outputId, jobs };
  }

  async exportStory(
    storyId: string,
    body: ExportStoryDto,
  ): Promise<{ storyId: string; key: string; downloadUrl: string }> {
    await this.storiesService.findById(storyId);

    const outputs = await this.prisma.generationOutput.findMany({
      where: {
        storyId,
        ...(body.outputIds?.length ? { id: { in: body.outputIds } } : {}),
      },
    });

    const assets = await this.prisma.asset.findMany({
      where: {
        storyId,
        ...(body.assetIds?.length ? { id: { in: body.assetIds } } : {}),
      },
    });

    if (outputs.length === 0 && assets.length === 0) {
      throw new BadRequestException(
        "No outputs or assets found for export selection",
      );
    }

    const zip = new JSZip();

    for (const output of outputs) {
      const filename = `outputs/${output.type}-${output.id}.txt`;
      zip.file(filename, output.content ?? JSON.stringify(output.contentJson));
    }

    for (const asset of assets) {
      const body = await this.storage.getObject(asset.uri);
      const filename = `assets/${asset.type}-${asset.id}.${this.extensionForAsset(asset.uri)}`;
      zip.file(filename, body);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `exports/${storyId}/${timestamp}.zip`;
    await this.storage.putObject(key, zipBuffer, "application/zip");
    const downloadUrl = await this.storage.getSignedDownloadUrl(key);

    return { storyId, key, downloadUrl };
  }

  private extensionForAsset(uri: string): string {
    const parts = uri.split(".");
    return parts.length > 1 ? (parts.at(-1) ?? "bin") : "bin";
  }
}

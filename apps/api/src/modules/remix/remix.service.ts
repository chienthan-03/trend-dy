import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma, ViralRemake } from "@prisma/client";
import {
  defaultRemixPolicyChecklist,
  isPolicyChecklistComplete,
  literalOverlapRatio,
  type RemixPackageV1,
  type RemixPolicyChecklist,
  type RemixTranscriptV1,
} from "@factory/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { JobsService } from "../jobs/jobs.service";
import type { UpdateRemixDto } from "./dto/update-remix.dto";
import { assertFullScriptAllowed, getRemixScriptMode } from "./remix-config";
import { isTranslateEnabled, shouldSkipRemixGenerate } from "./translate-config";

export type TriggerRemixInput = {
  projectId: string;
  viralItemId?: string;
  shareUrl?: string;
};

export type TriggerRemixResult = {
  remakeId: string;
  jobId: string;
};

export type ListRemakesFilters = {
  projectId?: string;
  status?: string;
  viralItemId?: string;
};

export type PolicyWarningInput = {
  sourceSnapshot: unknown;
  packageJson: unknown;
};

const PENDING_EXTERNAL_VIDEO_ID = "pending";
const OVERLAP_WARNING_THRESHOLD = 0.7;

export const isRemixEnabled = (): boolean => {
  const raw = process.env.REMIX_ENABLED?.trim().toLowerCase();
  return raw !== "false" && raw !== "0";
};

const firstCaptionSentence = (caption: string): string => {
  const trimmed = caption.trim();
  if (!trimmed) {
    return "";
  }

  const match = trimmed.match(/^[^.!?。！？\n]+[.!?。！？]?/);
  return (match?.[0] ?? trimmed).trim();
};

const normalizeSentence = (value: string): string =>
  value.trim().replace(/[.!?。！？]+$/u, "").toLowerCase();

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

@Injectable()
export class RemixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
  ) {}

  async triggerRemix(input: TriggerRemixInput): Promise<TriggerRemixResult> {
    if (!isRemixEnabled()) {
      throw new ServiceUnavailableException("Remix is disabled");
    }

    assertFullScriptAllowed();

    const { projectId, viralItemId, shareUrl } = input;
    if (!viralItemId && !shareUrl?.trim()) {
      throw new BadRequestException("viralItemId or shareUrl is required");
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    if (viralItemId) {
      return this.triggerFromViralItem(projectId, viralItemId);
    }

    return this.triggerFromShareUrl(projectId, shareUrl!.trim());
  }

  async listRemakes(filters: ListRemakesFilters = {}): Promise<ViralRemake[]> {
    const where: Prisma.ViralRemakeWhereInput = {};

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.viralItemId) {
      where.viralItemId = filters.viralItemId;
    }

    return this.prisma.viralRemake.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  async getRemake(id: string): Promise<ViralRemake> {
    const remake = await this.prisma.viralRemake.findUnique({ where: { id } });
    if (!remake) {
      throw new NotFoundException(`Remake ${id} not found`);
    }
    return remake;
  }

  async getTranscript(id: string): Promise<{
    transcript: RemixTranscriptV1 | null;
    translatedTranscript: RemixTranscriptV1 | null;
    pipelinePhase: string;
    videoDurationSec: number | null;
    scriptMode: string;
  }> {
    const remake = await this.getRemake(id);

    return {
      transcript: (remake.sourceTranscript as RemixTranscriptV1 | null) ?? null,
      translatedTranscript:
        (remake.sourceTranscriptTranslated as RemixTranscriptV1 | null) ?? null,
      pipelinePhase: remake.pipelinePhase,
      videoDurationSec: remake.videoDurationSec,
      scriptMode: remake.scriptMode,
    };
  }

  async updateRemake(id: string, dto: UpdateRemixDto): Promise<ViralRemake> {
    await this.getRemake(id);

    const data: Prisma.ViralRemakeUpdateInput = {};

    if (dto.packageJson !== undefined) {
      data.packageJson = dto.packageJson as Prisma.InputJsonValue;
    }
    if (dto.policyChecklist !== undefined) {
      data.policyChecklist = dto.policyChecklist as Prisma.InputJsonValue;
    }
    if (dto.editorNotes !== undefined) {
      data.editorNotes = dto.editorNotes;
    }

    return this.prisma.viralRemake.update({ where: { id }, data });
  }

  async regenerate(id: string): Promise<TriggerRemixResult> {
    const remake = await this.getRemake(id);

    if (!isRemixEnabled()) {
      throw new ServiceUnavailableException("Remix is disabled");
    }

    const scriptMode = remake.scriptMode ?? getRemixScriptMode();
    let jobType:
      | "remix_generate"
      | "remix_translate"
      | "remix_stt"
      | "remix_download_media";
    let pipelinePhase: string | undefined;

    if (scriptMode === "full") {
      if (
        remake.sourceTranscript &&
        isTranslateEnabled() &&
        !remake.sourceTranscriptTranslated
      ) {
        jobType = "remix_translate";
        pipelinePhase = "translating";
      } else if (remake.sourceTranscript || remake.sourceTranscriptTranslated) {
        jobType = "remix_generate";
        pipelinePhase = "generating";
      } else if (remake.mediaAudioKey) {
        jobType = "remix_stt";
        pipelinePhase = "transcribing";
      } else {
        jobType = "remix_download_media";
        pipelinePhase = "downloading_media";
      }
    } else {
      jobType = "remix_generate";
    }

    const job = await this.jobsService.enqueue({
      type: jobType,
      payload:
        jobType === "remix_translate"
          ? { remakeId: remake.id, chainGenerate: !shouldSkipRemixGenerate() }
          : { remakeId: remake.id },
      idempotencyKey: `${jobType}:${remake.id}:${Date.now()}`,
    });

    const updateData: Prisma.ViralRemakeUpdateInput = { status: "running" };
    if (pipelinePhase !== undefined) {
      updateData.pipelinePhase = pipelinePhase;
    }

    await this.prisma.viralRemake.update({
      where: { id: remake.id },
      data: updateData,
    });

    return { remakeId: remake.id, jobId: job.jobId };
  }

  async retranscribe(id: string): Promise<TriggerRemixResult> {
    const remake = await this.getRemake(id);

    if (!isRemixEnabled()) {
      throw new ServiceUnavailableException("Remix is disabled");
    }

    if (!remake.mediaAudioKey) {
      throw new BadRequestException(
        "Remake has no stored audio for retranscription",
      );
    }

    const job = await this.jobsService.enqueue({
      type: "remix_stt",
      payload: { remakeId: remake.id },
      idempotencyKey: `remix_stt:${remake.id}:${Date.now()}`,
    });

    await this.prisma.viralRemake.update({
      where: { id: remake.id },
      data: {
        status: "running",
        pipelinePhase: "transcribing",
        sourceTranscriptTranslated: null,
      },
    });

    return { remakeId: remake.id, jobId: job.jobId };
  }

  async retranslate(id: string): Promise<TriggerRemixResult> {
    const remake = await this.getRemake(id);

    if (!isRemixEnabled()) {
      throw new ServiceUnavailableException("Remix is disabled");
    }

    if (!remake.sourceTranscript) {
      throw new BadRequestException(
        "Remake has no source transcript to translate",
      );
    }

    if (!isTranslateEnabled()) {
      throw new BadRequestException("Transcript translation is disabled");
    }

    const job = await this.jobsService.enqueue({
      type: "remix_translate",
      payload: { remakeId: remake.id, chainGenerate: false },
      idempotencyKey: `remix_translate:${remake.id}:${Date.now()}`,
    });

    await this.prisma.viralRemake.update({
      where: { id: remake.id },
      data: {
        status: "running",
        pipelinePhase: "translating",
        sourceTranscriptTranslated: null,
      },
    });

    return { remakeId: remake.id, jobId: job.jobId };
  }

  async reject(id: string): Promise<ViralRemake> {
    await this.getRemake(id);

    return this.prisma.viralRemake.update({
      where: { id },
      data: { status: "archived" },
    });
  }

  async approve(id: string, approvedByUserId: string): Promise<ViralRemake> {
    const remake = await this.getRemake(id);
    const checklist = remake.policyChecklist as RemixPolicyChecklist | null;

    if (!checklist) {
      throw new BadRequestException("Policy checklist is required before approval");
    }

    if (!isPolicyChecklistComplete(checklist)) {
      throw new BadRequestException("Policy checklist is incomplete");
    }

    return this.prisma.viralRemake.update({
      where: { id },
      data: {
        usagePolicy: "approved_for_export",
        approvedAt: new Date(),
        approvedByUserId,
      },
    });
  }

  computePolicyWarnings(input: PolicyWarningInput): string[] {
    const warnings: string[] = [];
    const snapshot = asRecord(input.sourceSnapshot);
    const pkg = input.packageJson as RemixPackageV1 | null;

    if (!snapshot || !pkg) {
      return warnings;
    }

    const caption = typeof snapshot.caption === "string" ? snapshot.caption : "";
    const narration = pkg.script?.narration ?? "";
    const hookSpoken = pkg.hook_3s?.spoken ?? "";
    const watermark = pkg.banners?.watermark ?? "";

    if (
      caption &&
      narration &&
      literalOverlapRatio(caption, narration) > OVERLAP_WARNING_THRESHOLD
    ) {
      warnings.push("Script quá giống caption gốc");
    }

    const firstSentence = firstCaptionSentence(caption);
    if (
      firstSentence &&
      hookSpoken &&
      normalizeSentence(hookSpoken) === normalizeSentence(firstSentence)
    ) {
      warnings.push("Hook chưa được viết mới");
    }

    if (!watermark.trim()) {
      warnings.push("Thiếu branding");
    }

    return warnings;
  }

  private async triggerFromViralItem(
    projectId: string,
    viralItemId: string,
  ): Promise<TriggerRemixResult> {
    const item = await this.prisma.viralItem.findUnique({
      where: { id: viralItemId },
    });
    if (!item) {
      throw new NotFoundException(`Viral item ${viralItemId} not found`);
    }

    if (item.usagePolicy === "blocked") {
      throw new ForbiddenException(
        `Viral item ${viralItemId} is blocked for remix`,
      );
    }

    const remake = await this.prisma.viralRemake.create({
      data: {
        projectId,
        viralItemId: item.id,
        externalVideoId: item.externalId,
        sourceUrl: item.canonicalUrl,
        genre: item.genres[0] ?? null,
        status: "pending",
        scriptMode: getRemixScriptMode(),
        pipelinePhase: "pending",
        usagePolicy: "remix_draft",
        policyChecklist: defaultRemixPolicyChecklist() as Prisma.InputJsonValue,
      },
    });

    const job = await this.jobsService.enqueue({
      type: "remix_fetch_detail",
      payload: {
        remakeId: remake.id,
        videoId: item.externalId,
      },
    });

    return { remakeId: remake.id, jobId: job.jobId };
  }

  private async triggerFromShareUrl(
    projectId: string,
    shareUrl: string,
  ): Promise<TriggerRemixResult> {
    const remake = await this.prisma.viralRemake.create({
      data: {
        projectId,
        externalVideoId: PENDING_EXTERNAL_VIDEO_ID,
        sourceUrl: shareUrl,
        status: "pending",
        scriptMode: getRemixScriptMode(),
        pipelinePhase: "pending",
        usagePolicy: "remix_draft",
        policyChecklist: defaultRemixPolicyChecklist() as Prisma.InputJsonValue,
      },
    });

    const job = await this.jobsService.enqueue({
      type: "remix_resolve",
      payload: {
        remakeId: remake.id,
        shareUrl,
      },
    });

    return { remakeId: remake.id, jobId: job.jobId };
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma, ViralRemake } from "@prisma/client";
import type {
  RemixBannerJson,
  RemixPackageV1,
  RemixSegmentRole,
  RemixTranscriptV1,
} from "@factory/shared";
import { completeJson } from "../../ai/gateway";
import {
  buildRemixBannersPrompt,
  remixBannersV1ResponseSchema,
  toRemixBannerJson,
} from "../../ai/prompts/remix.banners.v1";
import { PrismaService } from "../../prisma/prisma.service";
import { JobsService } from "../jobs/jobs.service";
import type { UpdateRemixDto } from "./dto/update-remix.dto";
import {
  convertContainerAudioToMp3,
  convertWavToMp3,
  probeAudioDurationSec,
} from "./remix-audio.util";
import {
  assertFullScriptAllowed,
  getDubMaxUploadMb,
  getRemixScriptMode,
  isMediaDownloadAllowed,
  resolveEffectiveTtsAudioMode,
  resolveTtsEngine,
} from "./remix-config";
import { RemixStorageService } from "./remix-storage.service";
import {
  classifyTranslatedSegments,
  type ClassifyRolesMode,
} from "./tts/classify-segments";
import { effectiveRole } from "./tts/segment-role";
import { buildRemixCostEstimate } from "./remix-cost-estimate";
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

export type ViralRemakeApi = ViralRemake & {
  effectiveTtsAudioMode: "replace" | "mix";
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

export type UploadDubAudioInput = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

export type UploadDubAudioResult = {
  remakeId: string;
  mediaDubAudioKey: string;
  dubSource: "upload";
  renderPhase: "tts_ready";
  durationMismatch: boolean;
};

export type SegmentRolePatch = {
  index: number;
  role: RemixSegmentRole;
};

/** Clears anything downstream of the translated transcript so a stale dub/render never survives a role or text change. */
export const invalidateDubAndRenderData = {
  mediaDubAudioKey: null,
  renderOutputKey: null,
  renderPhase: "idle",
  dubSource: null,
} as const;

const ALLOWED_DUB_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/x-m4a",
]);

const DURATION_MISMATCH_THRESHOLD = 0.1;

const PENDING_EXTERNAL_VIDEO_ID = "pending";

export const isRemixEnabled = (): boolean => {
  const raw = process.env.REMIX_ENABLED?.trim().toLowerCase();
  return raw !== "false" && raw !== "0";
};

@Injectable()
export class RemixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
    private readonly remixStorage: RemixStorageService,
  ) {}

  enrichRemake(remake: ViralRemake): ViralRemakeApi {
    return {
      ...remake,
      effectiveTtsAudioMode: resolveEffectiveTtsAudioMode(remake.ttsAudioMode),
    };
  }

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

  async getCostEstimate(id: string, opts: { engine?: string } = {}) {
    const remake = await this.getRemake(id);
    return buildRemixCostEstimate({
      remakeId: remake.id,
      videoDurationSec: remake.videoDurationSec,
      sourceTranscript:
        (remake.sourceTranscript as RemixTranscriptV1 | null) ?? null,
      translatedTranscript:
        (remake.sourceTranscriptTranslated as RemixTranscriptV1 | null) ??
        null,
      lastTtsCostUsd: remake.ttsCostUsd,
      ttsEngine: remake.ttsEngine,
      ttsEngineOverride: opts.engine,
    });
  }

  async updateRemake(id: string, dto: UpdateRemixDto): Promise<ViralRemake> {
    const existing = await this.getRemake(id);

    const data: Prisma.ViralRemakeUpdateInput = {};

    if (dto.packageJson !== undefined) {
      data.packageJson = dto.packageJson as Prisma.InputJsonValue;
    }
    if (dto.editorNotes !== undefined) {
      data.editorNotes = dto.editorNotes;
    }
    if (dto.renderMode !== undefined) {
      data.renderMode = dto.renderMode;
    }
    if (dto.ttsVoiceId !== undefined) {
      data.ttsVoiceId = dto.ttsVoiceId;
    }
    if (dto.ttsSpeed !== undefined) {
      data.ttsSpeed = dto.ttsSpeed;
    }
    if (dto.ttsMaxSpeed !== undefined) {
      data.ttsMaxSpeed = dto.ttsMaxSpeed;
    }
    if (dto.ttsAudioMode !== undefined) {
      data.ttsAudioMode = dto.ttsAudioMode;
    }
    if (dto.bannerJson !== undefined) {
      data.bannerJson = dto.bannerJson as Prisma.InputJsonValue;
    }

    const modeChanged =
      dto.ttsAudioMode !== undefined &&
      dto.ttsAudioMode !== existing.ttsAudioMode;

    const invalidatesRender =
      (dto.renderMode !== undefined && dto.renderMode !== existing.renderMode) ||
      dto.bannerJson !== undefined;

    if (modeChanged) {
      Object.assign(data, invalidateDubAndRenderData);
    } else if (invalidatesRender && existing.renderOutputKey) {
      data.renderOutputKey = null;
      data.renderPhase = existing.mediaDubAudioKey ? "tts_ready" : "idle";
      data.renderError = null;
    }

    return this.prisma.viralRemake.update({ where: { id }, data });
  }

  async generateBanners(id: string): Promise<RemixBannerJson> {
    const remake = await this.getRemake(id);
    const transcript =
      remake.sourceTranscriptTranslated as RemixTranscriptV1 | null;

    if (!transcript) {
      throw new BadRequestException(
        "Remake has no translated transcript for banner generation",
      );
    }

    const excerpt =
      transcript.fullText?.trim() ||
      transcript.segments
        .map((segment) => segment.text.trim())
        .filter(Boolean)
        .join(" ");

    if (!excerpt) {
      throw new BadRequestException(
        "Translated transcript has no text for banner generation",
      );
    }

    const snapshot = remake.sourceSnapshot as Record<string, unknown> | null;
    const { system, user } = buildRemixBannersPrompt({
      transcriptExcerpt: excerpt,
      title: typeof snapshot?.title === "string" ? snapshot.title : undefined,
      genre: remake.genre ?? undefined,
    });

    const llm = await completeJson(user, remixBannersV1ResponseSchema, {
      system,
    });
    const bannerJson = toRemixBannerJson(llm.data);

    await this.prisma.viralRemake.update({
      where: { id: remake.id },
      data: {
        bannerJson: bannerJson as unknown as Prisma.InputJsonValue,
        ...(remake.renderOutputKey
          ? {
              renderOutputKey: null,
              renderPhase: remake.mediaDubAudioKey ? "tts_ready" : "idle",
              renderError: null,
            }
          : {}),
      },
    });

    return bannerJson;
  }

  async enqueueTts(
    id: string,
    opts: { voiceId?: string; engine?: "piper" | "live" } = {},
  ): Promise<TriggerRemixResult> {
    const remake = await this.getRemake(id);

    if (!remake.sourceTranscriptTranslated) {
      throw new BadRequestException(
        "Remake has no translated transcript for TTS",
      );
    }

    const engine = resolveTtsEngine({
      payloadEngine: opts.engine,
      remakeEngine: remake.ttsEngine,
    });

    const job = await this.jobsService.enqueue({
      type: "remix_tts",
      payload: opts.voiceId
        ? { remakeId: remake.id, engine, voiceId: opts.voiceId }
        : { remakeId: remake.id, engine },
      idempotencyKey: `remix_tts:${remake.id}:${Date.now()}`,
    });

    await this.prisma.viralRemake.update({
      where: { id: remake.id },
      data: {
        // `fake` is CI/env-only and never persisted as a real choice — keep
        // whatever engine the remake already had (or null) so the UI never
        // flips to a fake value.
        ttsEngine: engine === "fake" ? remake.ttsEngine : engine,
        ttsVoiceId: opts.voiceId ?? remake.ttsVoiceId,
        renderPhase: "tts",
        renderError: null,
        ttsFitFailedIndexes: [],
      },
    });

    return { remakeId: remake.id, jobId: job.jobId };
  }

  async uploadDubAudio(
    id: string,
    input: UploadDubAudioInput,
  ): Promise<UploadDubAudioResult> {
    const remake = await this.getRemake(id);
    const mimetype = input.mimetype?.trim().toLowerCase();

    if (!ALLOWED_DUB_MIME_TYPES.has(mimetype)) {
      throw new BadRequestException(
        "Dub upload must be audio/mpeg, audio/wav, audio/mp4, or audio/x-m4a",
      );
    }

    const maxBytes = getDubMaxUploadMb() * 1024 * 1024;
    if (input.size > maxBytes) {
      throw new BadRequestException(
        `Dub upload exceeds ${getDubMaxUploadMb()} MB limit`,
      );
    }

    const mp3Buffer = await this.prepareDubMp3Buffer(input.buffer, mimetype);
    const mediaDubAudioKey = await this.remixStorage.putDub(
      remake.id,
      mp3Buffer,
      "audio/mpeg",
    );

    const probeExt =
      mimetype === "audio/wav"
        ? "wav"
        : mimetype === "audio/x-m4a"
          ? "m4a"
          : mimetype === "audio/mp4"
            ? "mp4"
            : "mp3";
    const uploadDurationSec = await probeAudioDurationSec(
      input.buffer,
      probeExt,
    );
    const durationMismatch = this.isDubDurationMismatch(
      uploadDurationSec,
      remake.videoDurationSec,
    );

    await this.prisma.viralRemake.update({
      where: { id: remake.id },
      data: {
        mediaDubAudioKey,
        dubSource: "upload",
        renderPhase: "tts_ready",
        ttsFitFailedIndexes: [],
        renderOutputKey: null,
        renderError: null,
      },
    });

    return {
      remakeId: remake.id,
      mediaDubAudioKey,
      dubSource: "upload",
      renderPhase: "tts_ready",
      durationMismatch,
    };
  }

  async enqueueRender(id: string): Promise<TriggerRemixResult> {
    const remake = await this.getRemake(id);

    if (!remake.mediaVideoKey || !remake.mediaDubAudioKey) {
      const missing = [
        !remake.mediaVideoKey ? "mediaVideoKey (video gốc)" : null,
        !remake.mediaDubAudioKey ? "mediaDubAudioKey (audio VI)" : null,
      ]
        .filter(Boolean)
        .join(" và ");
      throw new BadRequestException(
        `Remake thiếu ${missing}. Nếu thiếu video gốc: bấm “Tải lại video” (remake cũ chưa lưu mediaVideoKey). Nếu thiếu audio VI: bấm “Tạo audio VI” hoặc upload dub.`,
      );
    }

    if (remake.renderMode === "banner_audio" && !remake.bannerJson) {
      throw new BadRequestException(
        "Remake requires bannerJson before rendering banner_audio",
      );
    }

    await this.prisma.viralRemake.update({
      where: { id: remake.id },
      data: { renderPhase: "rendering", renderError: null },
    });

    const job = await this.jobsService.enqueue({
      type: "remix_render",
      payload: { remakeId: remake.id },
      idempotencyKey: `remix_render:${remake.id}:${Date.now()}`,
    });

    return { remakeId: remake.id, jobId: job.jobId };
  }

  async redownloadMedia(id: string): Promise<TriggerRemixResult> {
    if (!isRemixEnabled()) {
      throw new ServiceUnavailableException("Remix is disabled");
    }
    if (!isMediaDownloadAllowed()) {
      throw new ServiceUnavailableException(
        "Media download requires REMIX_ALLOW_MEDIA_DOWNLOAD=true",
      );
    }

    const remake = await this.getRemake(id);
    const snapshot = remake.sourceSnapshot as Record<string, unknown> | null;
    const playUrl =
      typeof snapshot?.playUrl === "string" ? snapshot.playUrl.trim() : "";

    if (!playUrl) {
      throw new BadRequestException(
        "Remake has no playUrl in sourceSnapshot — cannot re-download media",
      );
    }

    await this.prisma.viralRemake.update({
      where: { id: remake.id },
      data: {
        status: "running",
        pipelinePhase: "downloading_media",
        renderOutputKey: null,
        renderError: null,
      },
    });

    const job = await this.jobsService.enqueue({
      type: "remix_download_media",
      payload: { remakeId: remake.id },
      idempotencyKey: `remix_download_media:${remake.id}:${Date.now()}`,
    });

    return { remakeId: remake.id, jobId: job.jobId };
  }

  async regenerate(id: string): Promise<TriggerRemixResult> {
    const remake = await this.getRemake(id);

    if (!isRemixEnabled()) {
      throw new ServiceUnavailableException("Remix is disabled");
    }

    if (remake.externalVideoId === PENDING_EXTERNAL_VIDEO_ID) {
      const shareUrl = remake.sourceUrl?.trim();
      if (!shareUrl) {
        throw new BadRequestException("Remake has no share URL to resolve");
      }

      const job = await this.jobsService.enqueue({
        type: "remix_resolve",
        payload: { remakeId: remake.id, shareUrl },
        idempotencyKey: `remix_resolve:${remake.id}:${Date.now()}`,
      });

      await this.prisma.viralRemake.update({
        where: { id: remake.id },
        data: { status: "running", pipelinePhase: "resolving" },
      });

      return { remakeId: remake.id, jobId: job.jobId };
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
        ...invalidateDubAndRenderData,
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
        ...invalidateDubAndRenderData,
      },
    });

    return { remakeId: remake.id, jobId: job.jobId };
  }

  async classifySegments(
    id: string,
    opts: { mode?: ClassifyRolesMode } = {},
  ): Promise<ViralRemake> {
    const remake = await this.getRemake(id);
    const mode: ClassifyRolesMode = opts.mode ?? "reclassify";

    const source = remake.sourceTranscript as RemixTranscriptV1 | null;
    const translated =
      remake.sourceTranscriptTranslated as RemixTranscriptV1 | null;

    if (!source || !translated) {
      throw new BadRequestException(
        "Remake requires both source and translated transcripts to classify segments",
      );
    }

    const result = await classifyTranslatedSegments({ source, translated, mode });

    if (!result.ok) {
      return this.prisma.viralRemake.update({
        where: { id: remake.id },
        data: { classifyWarning: result.warning },
      });
    }

    const rolesChanged = translated.segments.some(
      (segment, index) =>
        effectiveRole(segment) !== effectiveRole(result.segments[index]!),
    );

    const nextTranslated: RemixTranscriptV1 = {
      ...translated,
      segments: result.segments,
    };

    return this.prisma.viralRemake.update({
      where: { id: remake.id },
      data: {
        sourceTranscriptTranslated:
          nextTranslated as unknown as Prisma.InputJsonValue,
        classifyWarning: null,
        ...(rolesChanged ? invalidateDubAndRenderData : {}),
      },
    });
  }

  async updateSegmentRoles(
    id: string,
    roles: SegmentRolePatch[],
  ): Promise<ViralRemake> {
    const remake = await this.getRemake(id);
    const translated =
      remake.sourceTranscriptTranslated as RemixTranscriptV1 | null;

    if (!translated) {
      throw new BadRequestException(
        "Remake has no translated transcript to patch roles on",
      );
    }

    const roleByIndex = new Map(roles.map((entry) => [entry.index, entry.role]));
    const hasOutOfRangeIndex = roles.some(
      (entry) => entry.index < 0 || entry.index >= translated.segments.length,
    );
    if (hasOutOfRangeIndex) {
      throw new BadRequestException("Segment role index out of range");
    }

    const nextSegments = translated.segments.map((segment, index) => {
      const role = roleByIndex.get(index);
      if (role === undefined) {
        return segment;
      }
      return { ...segment, role, roleSource: "manual" as const };
    });

    const nextTranslated: RemixTranscriptV1 = {
      ...translated,
      segments: nextSegments,
    };

    return this.prisma.viralRemake.update({
      where: { id: remake.id },
      data: {
        sourceTranscriptTranslated:
          nextTranslated as unknown as Prisma.InputJsonValue,
        ...invalidateDubAndRenderData,
      },
    });
  }

  async reject(id: string): Promise<ViralRemake> {
    await this.getRemake(id);

    return this.prisma.viralRemake.update({
      where: { id },
      data: { status: "archived" },
    });
  }

  async approve(id: string, approvedByUserId: string): Promise<ViralRemake> {
    await this.getRemake(id);

    return this.prisma.viralRemake.update({
      where: { id },
      data: {
        usagePolicy: "approved_for_export",
        approvedAt: new Date(),
        approvedByUserId,
      },
    });
  }

  computePolicyWarnings(_input: PolicyWarningInput): string[] {
    return [];
  }

  private isDubDurationMismatch(
    uploadDurationSec: number | null,
    videoDurationSec: number | null,
  ): boolean {
    if (
      uploadDurationSec === null ||
      videoDurationSec === null ||
      videoDurationSec <= 0
    ) {
      return false;
    }

    const relativeDiff =
      Math.abs(uploadDurationSec - videoDurationSec) / videoDurationSec;
    return relativeDiff > DURATION_MISMATCH_THRESHOLD;
  }

  private async prepareDubMp3Buffer(
    buffer: Buffer,
    mimetype: string,
  ): Promise<Buffer> {
    if (mimetype === "audio/mpeg") {
      return buffer;
    }

    if (mimetype === "audio/wav") {
      return convertWavToMp3(buffer);
    }

    if (mimetype === "audio/x-m4a") {
      return convertContainerAudioToMp3(buffer, "m4a");
    }

    return convertContainerAudioToMp3(buffer, "mp4");
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

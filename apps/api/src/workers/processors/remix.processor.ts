import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Job as BullJob } from "bullmq";
import type { Prisma } from "@prisma/client";
import { completeText } from "../../ai/gateway";
import {
  buildRemixPrompt,
  parseRemixPackageJson,
  REMIX_PACKAGE_V1_KEY,
} from "../../ai/prompts/remix.package.v1";
import {
  buildRemixPromptV2,
  parseRemixPackageV2Json,
  REMIX_PACKAGE_V2_KEY,
} from "../../ai/prompts/remix.package.v2";
import { transcribeAudio } from "../../ai/stt";
import { translateTranscript } from "../../ai/translate";
import { createDouyinVideoAdapter } from "../../modules/remix/douyin-video.adapter";
import type { DouyinVideoDetail } from "../../modules/remix/douyin-video.adapter";
import { createRemixMediaAdapter } from "../../modules/remix/remix-media.adapter";
import { extractAudioForStt } from "../../modules/remix/remix-audio.util";
import {
  getDefaultTtsVoiceId,
  getHybridBlockGapSec,
  getHybridLockGraceSec,
  getMediaTtlDays,
  getPiperModelStem,
  getRemixScriptMode,
  getRemixLlmModel,
  getSttLanguageHint,
  getTtsModel,
  getTtsTimingMode,
  resolveTtsEngine,
  resolveEffectiveTtsMaxSpeed,
  resolveTtsMaxSpeed,
  resolveTtsSpeed,
} from "../../modules/remix/remix-config";
import { isTranslateEnabled, shouldSkipRemixGenerate } from "../../modules/remix/translate-config";
import { assembleDubTimeline } from "../../modules/remix/tts/assemble-dub";
import {
  batchCuesForTts,
  getPiperTtsBatchMode,
  getTtsBatchMode,
  perCueBatchesForTts,
  type CueForBatch,
} from "../../modules/remix/tts/batch-cues-for-tts";
import { splitBatchAudioToCues } from "../../modules/remix/tts/split-batch-audio";
import {
  markHybridLocks,
  planHybridTimeline,
} from "../../modules/remix/tts/hybrid-timeline";
import {
  smartBatchCuesForTts,
  splitSmartBatchAudioToCues,
} from "../../modules/remix/tts/smart-batch-cues";
import {
  applyBaseTtsSpeed,
  applyFitToTarget,
  planSegmentFit,
} from "../../modules/remix/tts/segment-fit";
import { finalizeDubTimeline } from "../../modules/remix/tts/finalize-dub-timeline";
import { planSequentialTimeline } from "../../modules/remix/tts/sequential-timeline";
import { classifyTranslatedSegments } from "../../modules/remix/tts/classify-segments";
import { effectiveRole } from "../../modules/remix/tts/segment-role";
import { shortenSegmentText } from "../../modules/remix/tts/shorten-segment";
import {
  readTtsBatchCache,
  ttsBatchCacheKey,
  writeTtsBatchCache,
} from "../../modules/remix/tts/tts-batch-cache";
import { createTtsAdapter } from "../../modules/remix/tts/tts.adapter";
import { normalizeVietnameseForTts } from "../../modules/remix/tts/viet-normalize";
import { probeClipDurationSec } from "../../modules/remix/remix-audio.util";

import { RemixMediaCleanupService } from "../../modules/remix/remix-media-cleanup.service";
import { RemixBgmService } from "../../modules/remix/remix-bgm.service";
import { resolveBgmSpeed, resolveBgmStartSec, resolveBgmVolume } from "../../modules/remix/remix-bgm-mix";
import { RemixRenderService, type BgmMixInput } from "../../modules/remix/remix-render.service";
import { RemixStorageService } from "../../modules/remix/remix-storage.service";
import {
  invalidateDubAndRenderData,
  RemixService,
} from "../../modules/remix/remix.service";
import { JobsService } from "../../modules/jobs/jobs.service";
import { PromptsService } from "../../modules/prompts/prompts.service";
import { estimateLlmCostUsd } from "../../modules/usage/cost";
import { PrismaService } from "../../prisma/prisma.service";
import { QUEUE_NAMES } from "../../queue/queues";
import { markCompleted, markFailed, markStarted } from "../job-status";
import type { RemixBannerJson, RemixTranscriptV1 } from "@factory/shared";

const [, , , , , REMIX_Q] = QUEUE_NAMES;

type RemixResolvePayload = {
  remakeId: string;
  shareUrl: string;
};

type RemixFetchDetailPayload = {
  remakeId: string;
  videoId?: string;
};

type RemixDownloadMediaPayload = {
  remakeId: string;
};

type RemixSttPayload = {
  remakeId: string;
};

type RemixTranslatePayload = {
  remakeId: string;
  chainGenerate?: boolean;
};

type RemixGeneratePayload = {
  remakeId: string;
};

type RemixTtsPayload = {
  remakeId: string;
  voiceId?: string;
  engine?: string;
};

type RemixRenderPayload = {
  remakeId: string;
};

/** Job names whose failures should only mark the render pipeline, not the main script pipeline. */
const RENDER_JOB_NAMES = new Set(["remix_tts", "remix_render"]);

const toSourceSnapshot = (detail: DouyinVideoDetail): Prisma.InputJsonValue => ({
  videoId: detail.videoId,
  title: detail.title,
  caption: detail.caption,
  authorHandle: detail.authorHandle,
  stats: detail.stats,
  coverUrl: detail.coverUrl ?? null,
  canonicalUrl: detail.canonicalUrl ?? null,
  publishedAt: detail.publishedAt?.toISOString() ?? null,
  playUrl: detail.playUrl ?? null,
  rawPayload: detail.rawPayload as Prisma.InputJsonValue,
});

/** Piper reads normalized text; fall back to raw text if the normalizer throws. */
const safeNormalizeForPiper = (text: string): string => {
  try {
    return normalizeVietnameseForTts(text);
  } catch {
    return text;
  }
};

const withRemixLlmModel = async <T>(fn: () => Promise<T>): Promise<T> => {
  const remixModel = process.env.REMIX_LLM_MODEL?.trim();
  if (!remixModel) {
    return fn();
  }

  const previousModel = process.env.LLM_MODEL;
  process.env.LLM_MODEL = remixModel;
  try {
    return await fn();
  } finally {
    if (previousModel !== undefined) {
      process.env.LLM_MODEL = previousModel;
    } else {
      delete process.env.LLM_MODEL;
    }
  }
};

@Injectable()
@Processor(REMIX_Q)
export class RemixProcessor extends WorkerHost {
  private readonly logger = new Logger(RemixProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
    private readonly promptsService: PromptsService,
    private readonly remixService: RemixService,
    private readonly remixStorage: RemixStorageService,
    private readonly remixCleanup: RemixMediaCleanupService,
    private readonly remixRender: RemixRenderService,
    private readonly remixBgmService: RemixBgmService,
  ) {
    super();
  }

  async process(job: BullJob): Promise<void> {
    const jobId = job.id;
    if (!jobId) {
      throw new Error("BullMQ job missing id");
    }

    let remakeId: string | undefined;

    try {
      await markStarted(this.prisma, jobId);

      switch (job.name) {
        case "remix_resolve":
          remakeId = (job.data as RemixResolvePayload).remakeId;
          await this.handleResolve(jobId, job.data as RemixResolvePayload);
          break;
        case "remix_fetch_detail":
          remakeId = (job.data as RemixFetchDetailPayload).remakeId;
          await this.handleFetchDetail(jobId, job.data as RemixFetchDetailPayload);
          break;
        case "remix_download_media":
          remakeId = (job.data as RemixDownloadMediaPayload).remakeId;
          await this.handleDownloadMedia(jobId, job.data as RemixDownloadMediaPayload);
          break;
        case "remix_stt":
          remakeId = (job.data as RemixSttPayload).remakeId;
          await this.handleStt(jobId, job.data as RemixSttPayload);
          break;
        case "remix_translate":
          remakeId = (job.data as RemixTranslatePayload).remakeId;
          await this.handleTranslate(jobId, job.data as RemixTranslatePayload);
          break;
        case "remix_generate":
          remakeId = (job.data as RemixGeneratePayload).remakeId;
          await this.handleGenerate(jobId, job.data as RemixGeneratePayload);
          break;
        case "remix_tts":
          remakeId = (job.data as RemixTtsPayload).remakeId;
          await this.handleTts(jobId, job.data as RemixTtsPayload);
          break;
        case "remix_render":
          remakeId = (job.data as RemixRenderPayload).remakeId;
          await this.handleRender(jobId, job.data as RemixRenderPayload);
          break;
        case "remix_cleanup_media":
          await this.handleCleanupMedia(jobId);
          break;
        default:
          throw new Error(`Unsupported remix job type: ${job.name}`);
      }

      await markCompleted(this.prisma, jobId, { remakeId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Remix job ${jobId} failed: ${message}`);

      if (remakeId) {
        if (RENDER_JOB_NAMES.has(job.name)) {
          await this.prisma.viralRemake.update({
            where: { id: remakeId },
            data: { renderPhase: "failed", renderError: message.slice(0, 500) },
          });
        } else {
          await this.prisma.viralRemake.update({
            where: { id: remakeId },
            data: { status: "failed", pipelinePhase: "failed" },
          });
        }
      }

      await markFailed(this.prisma, jobId, message);
      throw error;
    }
  }

  private async handleResolve(
    jobId: string,
    payload: RemixResolvePayload,
  ): Promise<void> {
    const { remakeId, shareUrl } = payload;
    if (!remakeId || !shareUrl?.trim()) {
      throw new Error("remix_resolve requires remakeId and shareUrl");
    }

    await this.remixService.getRemake(remakeId);

    const adapter = await createDouyinVideoAdapter();
    const resolved = await adapter.resolveShareUrl(shareUrl.trim());

    await this.prisma.viralRemake.update({
      where: { id: remakeId },
      data: {
        externalVideoId: resolved.videoId,
        sourceUrl: resolved.canonicalUrl ?? shareUrl.trim(),
      },
    });

    await this.jobsService.enqueue({
      type: "remix_fetch_detail",
      payload: {
        remakeId,
        videoId: resolved.videoId,
      },
    });

    this.logger.log(
      `remix_resolve ${jobId}: resolved ${remakeId} → ${resolved.videoId}`,
    );
  }

  private async handleFetchDetail(
    jobId: string,
    payload: RemixFetchDetailPayload,
  ): Promise<void> {
    const { remakeId, videoId } = payload;
    if (!remakeId) {
      throw new Error("remix_fetch_detail requires remakeId");
    }

    const remake = await this.remixService.getRemake(remakeId);
    const targetVideoId = videoId ?? remake.externalVideoId;
    if (!targetVideoId || targetVideoId === "pending") {
      throw new Error("remix_fetch_detail requires a resolved videoId");
    }

    const adapter = await createDouyinVideoAdapter();
    const detail = await adapter.getVideoDetail(targetVideoId);

    await this.prisma.viralRemake.update({
      where: { id: remakeId },
      data: {
        sourceSnapshot: toSourceSnapshot(detail),
        status: "running",
      },
    });

    const scriptMode = remake.scriptMode || getRemixScriptMode();
    if (scriptMode === "full") {
      await this.prisma.viralRemake.update({
        where: { id: remakeId },
        data: { pipelinePhase: "downloading_media" },
      });
      await this.jobsService.enqueue({
        type: "remix_download_media",
        payload: { remakeId },
      });
    } else {
      await this.jobsService.enqueue({
        type: "remix_generate",
        payload: { remakeId },
      });
      await this.prisma.viralRemake.update({
        where: { id: remakeId },
        data: { pipelinePhase: "generating" },
      });
    }

    this.logger.log(`remix_fetch_detail ${jobId}: snapshot saved for ${remakeId}`);
  }

  private async handleDownloadMedia(
    jobId: string,
    payload: RemixDownloadMediaPayload,
  ): Promise<void> {
    const { remakeId } = payload;
    const remake = await this.remixService.getRemake(remakeId);
    const snapshot = (remake.sourceSnapshot ?? {}) as Record<string, unknown>;

    // CDN playUrl expires quickly — always refresh via video detail when possible.
    let playUrl =
      typeof snapshot.playUrl === "string" ? snapshot.playUrl.trim() : "";
    const videoId = remake.externalVideoId?.trim();
    if (videoId && videoId !== "pending") {
      try {
        const douyin = await createDouyinVideoAdapter();
        const detail = await douyin.getVideoDetail(videoId);
        if (detail.playUrl?.trim()) {
          playUrl = detail.playUrl.trim();
          await this.prisma.viralRemake.update({
            where: { id: remakeId },
            data: { sourceSnapshot: toSourceSnapshot(detail) },
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `remix_download_media ${jobId}: failed to refresh playUrl for ${videoId} (${message}); falling back to snapshot`,
        );
      }
    }

    if (!playUrl) {
      throw new Error(`Remake ${remakeId} missing playUrl in snapshot`);
    }

    const adapter = await createRemixMediaAdapter();
    const downloaded = await adapter.downloadFromPlayUrl(
      playUrl,
      remake.externalVideoId,
    );
    const mediaVideoKey = await this.remixStorage.putVideo(
      remakeId,
      downloaded.buffer,
      downloaded.contentType.startsWith("video/")
        ? downloaded.contentType
        : "video/mp4",
    );

    const ttlDays = getMediaTtlDays();
    const mediaExpiresAt = new Date();
    mediaExpiresAt.setDate(mediaExpiresAt.getDate() + ttlDays);

    // Backfill for remakes that already finished STT/package — only need source video for render.
    const alreadyHasTranscript = Boolean(remake.sourceTranscript);
    if (alreadyHasTranscript) {
      const pipelinePhase = remake.packageJson
        ? "ready"
        : remake.sourceTranscriptTranslated
          ? shouldSkipRemixGenerate()
            ? "ready"
            : "generating"
          : isTranslateEnabled()
            ? "translating"
            : "generating";
      const status =
        pipelinePhase === "ready"
          ? "ready"
          : remake.status === "failed"
            ? "running"
            : remake.status;

      await this.prisma.viralRemake.update({
        where: { id: remakeId },
        data: {
          mediaVideoKey,
          mediaExpiresAt,
          pipelinePhase,
          status,
        },
      });

      if (pipelinePhase === "generating") {
        await this.jobsService.enqueue({
          type: "remix_generate",
          payload: { remakeId },
        });
      } else if (pipelinePhase === "translating") {
        await this.jobsService.enqueue({
          type: "remix_translate",
          payload: { remakeId, chainGenerate: true },
        });
      }

      this.logger.log(
        `remix_download_media ${jobId}: video backfill stored for ${remakeId} (phase=${pipelinePhase})`,
      );
      return;
    }

    const audio = await extractAudioForStt(downloaded.buffer);
    const mediaAudioKey = await this.remixStorage.putAudio(
      remakeId,
      audio.buffer,
      audio.contentType,
    );

    await this.prisma.viralRemake.update({
      where: { id: remakeId },
      data: {
        mediaVideoKey,
        mediaAudioKey,
        mediaExpiresAt,
        pipelinePhase: "transcribing",
      },
    });

    await this.jobsService.enqueue({
      type: "remix_stt",
      payload: { remakeId },
    });

    this.logger.log(
      `remix_download_media ${jobId}: audio extracted and stored for ${remakeId}`,
    );
  }

  private async handleStt(
    jobId: string,
    payload: RemixSttPayload,
  ): Promise<void> {
    const { remakeId } = payload;
    const remake = await this.remixService.getRemake(remakeId);
    if (!remake.mediaAudioKey) {
      throw new Error(`No audio found for remake ${remakeId}`);
    }

    const audioBuffer = await this.remixStorage.getAudio(remake.mediaAudioKey);

    const {
      transcript,
      costUsd: sttCostUsd,
      timingDegraded,
      timingCoarse,
    } = await transcribeAudio(audioBuffer, {
      languageHint: getSttLanguageHint(),
    });

    const timingWarning =
      timingDegraded || timingCoarse
        ? "Timeline cue còn thô hoặc ước lượng — nên Transcribe lại / kiểm tra sync."
        : null;

    await this.prisma.viralRemake.update({
      where: { id: remakeId },
      data: {
        sourceTranscript: transcript as Prisma.InputJsonValue,
        sourceTranscriptTranslated: null,
        timingWarning,
        videoDurationSec: transcript.durationSec,
        sttCostUsd,
        pipelinePhase: isTranslateEnabled() ? "translating" : "generating",
        ...invalidateDubAndRenderData,
      },
    });

    await this.jobsService.enqueue({
      type: isTranslateEnabled() ? "remix_translate" : "remix_generate",
      payload: isTranslateEnabled()
        ? { remakeId, chainGenerate: !shouldSkipRemixGenerate() }
        : { remakeId },
    });

    await this.prisma.usageEvent.create({
      data: {
        jobId,
        provider: transcript.provider,
        model: transcript.model,
        costUsd: sttCostUsd,
      },
    });

    this.logger.log(`remix_stt ${jobId}: transcript saved for ${remakeId}`);
  }

  private async handleTranslate(
    jobId: string,
    payload: RemixTranslatePayload,
  ): Promise<void> {
    const { remakeId, chainGenerate = true } = payload;
    const remake = await this.remixService.getRemake(remakeId);
    const sourceTranscript = remake.sourceTranscript as RemixTranscriptV1 | null;

    if (!sourceTranscript) {
      throw new Error(`No source transcript found for remake ${remakeId}`);
    }

    const { transcript: translated, tokensIn, tokensOut } =
      await translateTranscript(sourceTranscript);

    if (translated.segments.length !== sourceTranscript.segments.length) {
      throw new Error(
        `Translate segment count mismatch: source=${sourceTranscript.segments.length} translated=${translated.segments.length}`,
      );
    }

    // Timing must stay 1:1 with source cues — copy-forward any drift from providers.
    for (let i = 0; i < sourceTranscript.segments.length; i += 1) {
      const sourceSeg = sourceTranscript.segments[i]!;
      const translatedSeg = translated.segments[i]!;
      translatedSeg.startSec = sourceSeg.startSec;
      translatedSeg.endSec = sourceSeg.endSec;
    }

    await this.prisma.viralRemake.update({
      where: { id: remakeId },
      data: {
        sourceTranscriptTranslated: translated as Prisma.InputJsonValue,
        pipelinePhase: chainGenerate ? "generating" : "ready",
        status: chainGenerate ? remake.status : "ready",
      },
    });

    if (tokensIn !== undefined && tokensOut !== undefined) {
      await this.prisma.usageEvent.create({
        data: {
          jobId,
          provider: translated.provider,
          model: translated.model,
          tokensIn,
          tokensOut,
          costUsd: estimateLlmCostUsd(tokensIn, tokensOut, translated.model),
        },
      });
    }

    if (chainGenerate) {
      await this.jobsService.enqueue({
        type: "remix_generate",
        payload: { remakeId },
      });
    }

    this.logger.log(
      `remix_translate ${jobId}: translated ${translated.segments.length} segments for ${remakeId}`,
    );
  }

  private async handleGenerate(
    jobId: string,
    payload: RemixGeneratePayload,
  ): Promise<void> {
    const { remakeId } = payload;
    if (!remakeId) {
      throw new Error("remix_generate requires remakeId");
    }

    const remake = await this.remixService.getRemake(remakeId);
    if (!remake.sourceSnapshot) {
      throw new Error(`Remake ${remakeId} has no sourceSnapshot`);
    }

    const scriptMode = remake.scriptMode || getRemixScriptMode();
    const transcript =
      (remake.sourceTranscriptTranslated as RemixTranscriptV1 | null) ??
      (remake.sourceTranscript as RemixTranscriptV1 | null);

    let system: string;
    let user: string;
    let key: string;

    if (scriptMode === "full" && transcript) {
      const template = await this.promptsService.getActiveTemplate(
        REMIX_PACKAGE_V2_KEY as never,
      );
      if (!template) {
        throw new Error(`No active prompt template for ${REMIX_PACKAGE_V2_KEY}`);
      }

      const snapshot = remake.sourceSnapshot as Record<string, unknown>;
      const locale = process.env.REMIX_DEFAULT_LOCALE?.trim() || "vi";
      const prompt = buildRemixPromptV2({
        caption: typeof snapshot.caption === "string" ? snapshot.caption : "",
        title: typeof snapshot.title === "string" ? snapshot.title : "",
        genre: remake.genre ?? "unknown",
        locale,
        transcript,
      });
      system = template.body;
      user = prompt.user;
      key = REMIX_PACKAGE_V2_KEY;
    } else {
      const template = await this.promptsService.getActiveTemplate(
        REMIX_PACKAGE_V1_KEY as never,
      );
      if (!template) {
        throw new Error(`No active prompt template for ${REMIX_PACKAGE_V1_KEY}`);
      }

      const snapshot = remake.sourceSnapshot as Record<string, unknown>;
      const locale = process.env.REMIX_DEFAULT_LOCALE?.trim() || "vi";
      const prompt = buildRemixPrompt({
        caption: typeof snapshot.caption === "string" ? snapshot.caption : "",
        title: typeof snapshot.title === "string" ? snapshot.title : "",
        genre: remake.genre ?? "unknown",
        locale,
      });
      system = template.body;
      user = prompt.user;
      key = REMIX_PACKAGE_V1_KEY;
    }

    const llm = await withRemixLlmModel(() =>
      completeText(user, {
        type: "remix_generate",
        system,
      }),
    );

    const packageJson =
      key === REMIX_PACKAGE_V2_KEY
        ? parseRemixPackageV2Json(llm.text)
        : parseRemixPackageJson(llm.text);

    const policyWarnings = this.remixService.computePolicyWarnings({
      sourceSnapshot: remake.sourceSnapshot,
      packageJson,
    });
    const costUsd = estimateLlmCostUsd(
      llm.tokensIn,
      llm.tokensOut,
      getRemixLlmModel(),
    );

    await this.prisma.viralRemake.update({
      where: { id: remakeId },
      data: {
        packageJson: packageJson as Prisma.InputJsonValue,
        policyWarnings,
        status: "ready",
        pipelinePhase: "ready",
        tokensIn: llm.tokensIn,
        tokensOut: llm.tokensOut,
        costUsd,
      },
    });

    await this.prisma.usageEvent.create({
      data: {
        jobId,
        provider: llm.provider,
        model: llm.model,
        tokensIn: llm.tokensIn,
        tokensOut: llm.tokensOut,
        costUsd,
      },
    });

    this.logger.log(
      `remix_generate ${jobId}: package ready for ${remakeId} (${llm.tokensIn}+${llm.tokensOut} tokens)`,
    );
  }

  private async handleTts(
    jobId: string,
    payload: RemixTtsPayload,
  ): Promise<void> {
    const { remakeId, voiceId: voiceIdOverride } = payload;
    if (!remakeId) {
      throw new Error("remix_tts requires remakeId");
    }

    const remake = await this.remixService.getRemake(remakeId);

    const engine = resolveTtsEngine({
      payloadEngine: typeof payload.engine === "string" ? payload.engine : null,
      remakeEngine: remake.ttsEngine,
    });
    const adapter = await createTtsAdapter(engine);
    const isPiper = engine === "piper";

    let translated =
      remake.sourceTranscriptTranslated as RemixTranscriptV1 | null;
    if (!translated) {
      throw new Error(
        `Remake ${remakeId} has no translated transcript for TTS`,
      );
    }

    if (remake.dubSource === "upload" && remake.mediaDubAudioKey) {
      await this.prisma.viralRemake.update({
        where: { id: remakeId },
        data: { renderPhase: "tts_ready" },
      });
      this.logger.log(
        `remix_tts ${jobId}: using uploaded dub audio for ${remakeId}`,
      );
      return;
    }

    if (translated.segments.some((segment) => segment.role == null)) {
      const source = remake.sourceTranscript as RemixTranscriptV1 | null;
      const result = source
        ? await classifyTranslatedSegments({ source, translated, mode: "lazy" })
        : { ok: false as const, warning: `Remake ${remakeId} has no source transcript to classify against` };

      if (result.ok) {
        translated = { ...translated, segments: result.segments };
        await this.prisma.viralRemake.update({
          where: { id: remakeId },
          data: {
            sourceTranscriptTranslated: translated as unknown as Prisma.InputJsonValue,
            classifyWarning: null,
          },
        });
      } else {
        await this.prisma.viralRemake.update({
          where: { id: remakeId },
          data: { classifyWarning: result.warning },
        });
      }
    }

    const voiceId =
      voiceIdOverride || remake.ttsVoiceId || getDefaultTtsVoiceId();
    // Piper ignores the OpenRouter voice selection entirely — it always speaks
    // through the fixed Ngọc Huyền model files, so cache/synthesize use the
    // model stem instead of the user-facing voiceId.
    const engineVoiceId = isPiper ? getPiperModelStem() : voiceId;
    const baseSpeed = resolveTtsSpeed(remake.ttsSpeed);
    const maxSpeed = resolveEffectiveTtsMaxSpeed(remake.ttsSpeed, remake.ttsMaxSpeed);

    const fitFailedIndexes: number[] = [];
    const timelineByIndex = new Map<
      number,
      { startSec: number; endSec: number; fittedMp3Buffer: Buffer }
    >();
    let ttsCostUsd = 0;

    const timingMode = getTtsTimingMode();
    const useSequential = timingMode === "sequential";
    const useHybrid = timingMode === "hybrid";
    const hybridOptions = useHybrid
      ? {
          blockGapSec: getHybridBlockGapSec(),
          lockGraceSec: getHybridLockGraceSec(),
          maxSpeed,
          videoEndSec: remake.videoDurationSec ?? undefined,
        }
      : null;

    type RawClip = {
      buffer: Buffer;
      audioDurationSec: number;
      zhStartSec: number;
      zhEndSec: number;
      role: ReturnType<typeof effectiveRole>;
    };
    const rawByIndex = new Map<number, RawClip>();

    const cues: CueForBatch[] = translated.segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => Boolean(segment.text.trim()))
      .map(({ segment, index }) => ({
        index,
        text: segment.text,
        startSec: segment.startSec,
        endSec: segment.endSec,
      }));

    // Which cues will be lock-anchored to their ZH window — decides whether
    // the per_cue legacy path is allowed to LLM-shorten during collect
    // (hybrid unlocked narration retimes instead, so shortening it during
    // collect would be wasted work). Depends only on timing/role, so this
    // can run before TTS synthesis (and before `planHybridTimeline`, which
    // additionally needs audio durations to place unlocked cues).
    const hybridLockedIndexes = useHybrid
      ? markHybridLocks(
          cues.map((cue) => ({
            index: cue.index,
            startSec: cue.startSec,
            endSec: cue.endSec,
            role: effectiveRole(translated.segments[cue.index]!),
          })),
          { blockGapSec: hybridOptions!.blockGapSec },
        )
      : null;

    // Piper: default per_cue (full sentence per synthesis). Smart-batch merges
    // cues then ratio-splits MP3 — fast but cuts mid-phrase ("mất chữ").
    const batchMode = isPiper ? getPiperTtsBatchMode() : getTtsBatchMode();
    const batches =
      isPiper && batchMode === "smart"
        ? smartBatchCuesForTts(cues)
        : batchMode === "per_cue"
          ? perCueBatchesForTts(cues)
          : batchCuesForTts(cues);

    // Batch TTS: few TTS calls, then cut audio back onto Phân đoạn windows.
    // Timeline positions always come from segment startSec/endSec (not from TTS pacing).
    this.logger.log(
      `remix_tts ${jobId}: ${engine} engine, ${batchMode} mode — ${batches.length} TTS batches for ${translated.segments.length} cues`,
    );

    const ttsModel = isPiper ? `piper:${getPiperModelStem()}` : getTtsModel();

    for (const batch of batches) {
      if (!batch.text) continue;

      // Piper reads/caches the normalized text (numbers, Latin loanwords, %) —
      // falls back to raw text if the normalizer throws on unexpected input.
      const synthesizeText = isPiper
        ? safeNormalizeForPiper(batch.text)
        : batch.text;

      const cacheKey = ttsBatchCacheKey({
        engine,
        model: ttsModel,
        voiceId: engineVoiceId,
        text: synthesizeText,
      });
      const cached = await readTtsBatchCache(cacheKey);
      let synth: {
        buffer: Buffer;
        durationSec: number;
        costUsd: number;
        contentType: "audio/mpeg";
      };
      if (cached) {
        synth = {
          buffer: cached.buffer,
          durationSec: cached.durationSec,
          costUsd: 0,
          contentType: "audio/mpeg",
        };
        this.logger.log(
          `remix_tts ${jobId}: cache hit for batch [${batch.segmentIndexes[0]}..${batch.segmentIndexes[batch.segmentIndexes.length - 1]}]`,
        );
      } else {
        synth = await adapter.synthesize({
          text: synthesizeText,
          voiceId: engineVoiceId,
        });
        await writeTtsBatchCache(cacheKey, {
          buffer: synth.buffer,
          durationSec: synth.durationSec,
        });
      }
      ttsCostUsd += synth.costUsd;

      // Single-cue legacy path: optional local/LLM shorten + re-TTS, then
      // collect (fit happens once every cue has been synthesized, once we
      // know the full hybrid timeline).
      if (batchMode === "per_cue" && batch.cues.length === 1) {
        const segment = batch.cues[0]!;
        const targetDurationSec = Math.max(
          segment.endSec - segment.startSec,
          0.1,
        );
        // Strict always pins to the ZH window and may shorten to fit it;
        // hybrid only shortens cues that stay lock-anchored to that window
        // (unlocked narration retimes instead of losing words to a shorten).
        const isLocked =
          timingMode === "strict" ||
          (useHybrid && hybridLockedIndexes!.has(segment.index));

        let clipBuffer = synth.buffer;
        let clipDuration = synth.durationSec;
        ({ buffer: clipBuffer, durationSec: clipDuration } =
          await applyBaseTtsSpeed(clipBuffer, clipDuration, baseSpeed));

        if (isLocked) {
          const plan = planSegmentFit({
            audioDurationSec: clipDuration,
            targetDurationSec,
            maxSpeed,
          });

          if (plan.action === "shorten") {
            const shortened = await shortenSegmentText({
              text: segment.text,
              targetDurationSec,
            });
            if (shortened.text && shortened.text !== segment.text) {
              synth = await adapter.synthesize({
                text: shortened.text,
                voiceId,
              });
              ttsCostUsd += synth.costUsd;
              clipBuffer = synth.buffer;
              clipDuration = synth.durationSec;
              ({ buffer: clipBuffer, durationSec: clipDuration } =
                await applyBaseTtsSpeed(clipBuffer, clipDuration, baseSpeed));
            }
          }
        }

        rawByIndex.set(segment.index, {
          buffer: clipBuffer,
          audioDurationSec: clipDuration,
          zhStartSec: segment.startSec,
          zhEndSec: segment.endSec,
          role: effectiveRole(translated.segments[segment.index]!),
        });
        continue;
      }

      const slices = isPiper
        ? await splitSmartBatchAudioToCues({
            cues: batch.cues,
            batchMp3: synth.buffer,
            batchAudioDurationSec: synth.durationSec,
          })
        : await splitBatchAudioToCues({
            cues: batch.cues,
            batchMp3: synth.buffer,
            batchAudioDurationSec: synth.durationSec,
          });

      for (const slice of slices) {
        const adjusted = await applyBaseTtsSpeed(
          slice.buffer,
          slice.sliceDurationSec,
          baseSpeed,
        );
        rawByIndex.set(slice.index, {
          buffer: adjusted.buffer,
          audioDurationSec: adjusted.durationSec,
          zhStartSec: slice.startSec,
          zhEndSec: slice.endSec,
          role: effectiveRole(translated.segments[slice.index]!),
        });
      }
    }

    // Piper smart-batch splits allocate duration by text ratio — probe each
    // clip so hybrid chaining and segment-fit use real MP3 length, not estimates.
    await Promise.all(
      [...rawByIndex.entries()].map(async ([index, raw]) => {
        const audioDurationSec = await probeClipDurationSec(
          raw.buffer,
          raw.audioDurationSec,
        );
        rawByIndex.set(index, { ...raw, audioDurationSec });
      }),
    );

    const hybridOutByIndex = hybridOptions
      ? new Map(
          planHybridTimeline(
            [...rawByIndex.entries()].map(([index, raw]) => ({
              index,
              startSec: raw.zhStartSec,
              endSec: raw.zhEndSec,
              role: raw.role,
              audioDurationSec: raw.audioDurationSec,
            })),
            hybridOptions,
          ).map((out) => [out.index, out] as const),
        )
      : null;

    if (useHybrid) {
      this.logger.log(
        `remix_tts ${jobId}: hybrid timeline planned for ${rawByIndex.size} cues`,
      );
    }

    // Sequential still chains cues globally, but each clip is fitted to its ZH
    // window first so ttsSpeed + ttsMaxSpeed can keep pace with the video.
    if (useSequential) {
      for (const [index, raw] of rawByIndex) {
        const fitTargetSec = Math.max(raw.zhEndSec - raw.zhStartSec, 0.1);
        const plan = planSegmentFit({
          audioDurationSec: raw.audioDurationSec,
          targetDurationSec: fitTargetSec,
          maxSpeed,
        });
        const fitted = await applyFitToTarget(raw.buffer, plan, fitTargetSec);
        if (fitted.truncated || plan.action === "shorten") {
          fitFailedIndexes.push(index);
        }
        const fittedDurationSec = await probeClipDurationSec(
          fitted.buffer,
          fitTargetSec,
        );
        rawByIndex.set(index, {
          ...raw,
          buffer: fitted.buffer,
          audioDurationSec: fittedDurationSec,
        });
      }
    }

    if (useSequential) {
      const sequentialOut = planSequentialTimeline(
        [...rawByIndex.entries()].map(([index, raw]) => ({
          index,
          zhStartSec: raw.zhStartSec,
          zhEndSec: raw.zhEndSec,
          audioDurationSec: raw.audioDurationSec,
        })),
        { blockGapSec: getHybridBlockGapSec() },
      );

      const finalized = await finalizeDubTimeline(
        sequentialOut.map((entry) => {
          const raw = rawByIndex.get(entry.index)!;
          return {
            index: entry.index,
            plannedStartSec: entry.startSec,
            fitTargetSec: raw.audioDurationSec,
            locked: false,
            buffer: raw.buffer,
          };
        }),
      );

      let deferredCount = 0;
      for (const entry of finalized) {
        const raw = rawByIndex.get(entry.index)!;
        if (entry.deferred || entry.startSec > raw.zhStartSec + 0.1) {
          deferredCount += 1;
        }
        if (entry.truncated && !fitFailedIndexes.includes(entry.index)) {
          fitFailedIndexes.push(entry.index);
        }
        timelineByIndex.set(entry.index, {
          startSec: entry.startSec,
          endSec: entry.endSec,
          fittedMp3Buffer: entry.buffer,
        });
      }

      this.logger.log(
        `remix_tts ${jobId}: sequential timeline planned for ${sequentialOut.length} cues` +
          (deferredCount > 0 ? ` (${deferredCount} deferred to prevent overlap)` : ""),
      );
    } else {
      for (const [index, raw] of rawByIndex) {
        const planned = hybridOutByIndex?.get(index);
        const startSec = planned?.startSec ?? raw.zhStartSec;
        const fitTargetSec =
          planned?.fitTargetSec ?? Math.max(raw.zhEndSec - raw.zhStartSec, 0.1);
        const plan = planSegmentFit({
          audioDurationSec: raw.audioDurationSec,
          targetDurationSec: fitTargetSec,
          maxSpeed,
        });
        const fitted = await applyFitToTarget(raw.buffer, plan, fitTargetSec);
        if (fitted.truncated || plan.action === "shorten") {
          fitFailedIndexes.push(index);
        }
        timelineByIndex.set(index, {
          startSec,
          endSec: planned?.endSec ?? startSec + fitTargetSec,
          fittedMp3Buffer: fitted.buffer,
        });
      }

      const finalized = await finalizeDubTimeline(
        [...timelineByIndex.entries()].map(([index, entry]) => {
          const planned = hybridOutByIndex?.get(index);
          const raw = rawByIndex.get(index);
          return {
            index,
            plannedStartSec: entry.startSec,
            fitTargetSec:
              planned?.fitTargetSec ??
              Math.max(
                (raw?.zhEndSec ?? entry.endSec) -
                  (raw?.zhStartSec ?? entry.startSec),
                0.1,
              ),
            locked: planned?.locked ?? !useHybrid,
            buffer: entry.fittedMp3Buffer,
          };
        }),
      );

      let deferredCount = 0;
      for (const entry of finalized) {
        if (entry.deferred) deferredCount += 1;
        if (entry.truncated && !fitFailedIndexes.includes(entry.index)) {
          fitFailedIndexes.push(entry.index);
        }
        timelineByIndex.set(entry.index, {
          startSec: entry.startSec,
          endSec: entry.endSec,
          fittedMp3Buffer: entry.buffer,
        });
      }

      if (deferredCount > 0) {
        this.logger.log(
          `remix_tts ${jobId}: deferred ${deferredCount} cues to prevent overlap`,
        );
      }
    }

    // Empty-text cues are omitted; assemble fills gaps with silence between clips.
    const timelineSegments = translated.segments
      .map((_, index) => timelineByIndex.get(index))
      .filter(
        (segment): segment is NonNullable<typeof segment> =>
          segment != null && segment.fittedMp3Buffer.length > 0,
      );

    const lastSegment = translated.segments[translated.segments.length - 1];
    const placedEndSec =
      timelineSegments.length > 0
        ? Math.max(...timelineSegments.map((segment) => segment.endSec))
        : 0;
    const totalDurationSec = Math.max(
      remake.videoDurationSec ?? 0,
      lastSegment?.endSec ?? 0,
      translated.durationSec,
      placedEndSec,
    );

    const dubBuffer = await assembleDubTimeline({
      segments: timelineSegments,
      totalDurationSec,
    });

    const mediaDubAudioKey = await this.remixStorage.putDub(
      remakeId,
      dubBuffer,
    );

    await this.prisma.viralRemake.update({
      where: { id: remakeId },
      data: {
        mediaDubAudioKey,
        dubSource: "tts",
        ttsCostUsd,
        ttsFitFailedIndexes: fitFailedIndexes,
        renderPhase: "tts_ready",
        // `fake` is CI/env-only and never persisted as a real choice — keep
        // whatever engine the remake already had (or null) so the UI never
        // flips to a fake value.
        ttsEngine: engine === "fake" ? remake.ttsEngine : engine,
      },
    });

    await this.prisma.usageEvent.create({
      data: {
        jobId,
        provider: "tts",
        model: ttsModel,
        costUsd: ttsCostUsd,
      },
    });

    this.logger.log(
      `remix_tts ${jobId}: dub assembled for ${remakeId} (${timelineSegments.length} clips from ${translated.segments.length} cues via ${batches.length} TTS batches, ${fitFailedIndexes.length} fit failures)`,
    );
  }

  private async handleRender(
    jobId: string,
    payload: RemixRenderPayload,
  ): Promise<void> {
    const { remakeId } = payload;
    if (!remakeId) {
      throw new Error("remix_render requires remakeId");
    }

    const remake = await this.remixService.getRemake(remakeId);

    if (!remake.mediaVideoKey || !remake.mediaDubAudioKey) {
      throw new Error(
        `Remake ${remakeId} requires mediaVideoKey and mediaDubAudioKey for render`,
      );
    }

    if (remake.renderMode === "banner_audio" && !remake.bannerJson) {
      throw new Error(
        `Remake ${remakeId} requires bannerJson for banner_audio render`,
      );
    }

    const [videoBuffer, dubBuffer] = await Promise.all([
      this.remixStorage.getVideo(remake.mediaVideoKey),
      this.remixStorage.getDub(remake.mediaDubAudioKey),
    ]);

    let bgm: BgmMixInput | undefined;
    if (remake.bgmTrackId) {
      const trackId = this.remixBgmService.assertTrackId(remake.bgmTrackId);
      const buffer = await this.remixBgmService.readTrackBuffer(trackId);
      const durationSec = await this.remixBgmService.getTrackDurationSec(trackId);
      bgm = {
        buffer,
        volume: resolveBgmVolume(remake.bgmVolume),
        speed: resolveBgmSpeed(remake.bgmSpeed),
        startSec: resolveBgmStartSec(remake.bgmStartSec, durationSec),
      };
    }

    const renderedBuffer =
      remake.renderMode === "banner_audio"
        ? await this.remixRender.renderBannerAudio(
            videoBuffer,
            dubBuffer,
            remake.bannerJson as RemixBannerJson,
            bgm,
          )
        : await this.remixRender.renderAudioOnly(videoBuffer, dubBuffer, bgm);

    const renderOutputKey = await this.remixStorage.putRender(
      remakeId,
      renderedBuffer,
    );

    await this.prisma.viralRemake.update({
      where: { id: remakeId },
      data: {
        renderOutputKey,
        renderPhase: "render_ready",
        renderError: null,
      },
    });

    this.logger.log(`remix_render ${jobId}: render ready for ${remakeId}`);
  }

  private async handleCleanupMedia(jobId: string): Promise<void> {
    const { deletedCount } = await this.remixCleanup.cleanupExpiredMedia();
    this.logger.log(
      `remix_cleanup_media ${jobId}: cleaned up ${deletedCount} items`,
    );
  }
}

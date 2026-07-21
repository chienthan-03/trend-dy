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
  getMediaTtlDays,
  getRemixScriptMode,
  getTtsMaxSpeed,
  getTtsModel,
} from "../../modules/remix/remix-config";
import { isTranslateEnabled, shouldSkipRemixGenerate } from "../../modules/remix/translate-config";
import { assembleDubTimeline } from "../../modules/remix/tts/assemble-dub";
import {
  applyPad,
  applyTempo,
  planSegmentFit,
  type SegmentFitPlan,
} from "../../modules/remix/tts/segment-fit";
import { classifyTranslatedSegments } from "../../modules/remix/tts/classify-segments";
import { effectiveRole, mergeNarrationIntervals } from "../../modules/remix/tts/segment-role";
import { shortenSegmentText } from "../../modules/remix/tts/shorten-segment";
import { splitSegmentsForTts } from "../../modules/remix/tts/split-segments-for-tts";
import { createTtsAdapter } from "../../modules/remix/tts/tts.adapter";
import { RemixMediaCleanupService } from "../../modules/remix/remix-media-cleanup.service";
import { RemixRenderService } from "../../modules/remix/remix-render.service";
import { RemixStorageService } from "../../modules/remix/remix-storage.service";
import { RemixService } from "../../modules/remix/remix.service";
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

    const { transcript, costUsd: sttCostUsd } = await transcribeAudio(audioBuffer);

    await this.prisma.viralRemake.update({
      where: { id: remakeId },
      data: {
        sourceTranscript: transcript as Prisma.InputJsonValue,
        sourceTranscriptTranslated: null,
        videoDurationSec: transcript.durationSec,
        sttCostUsd,
        pipelinePhase: isTranslateEnabled() ? "translating" : "generating",
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
          costUsd: estimateLlmCostUsd(tokensIn, tokensOut),
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
    const costUsd = estimateLlmCostUsd(llm.tokensIn, llm.tokensOut);

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

    const adapter = await createTtsAdapter();
    const voiceId =
      voiceIdOverride || remake.ttsVoiceId || getDefaultTtsVoiceId();
    const maxSpeed = getTtsMaxSpeed();

    const fitFailedIndexes: number[] = [];
    const timelineSegments: {
      startSec: number;
      endSec: number;
      fittedMp3Buffer: Buffer;
    }[] = [];
    let ttsCostUsd = 0;

    for (let index = 0; index < translated.segments.length; index += 1) {
      const segment = translated.segments[index]!;
      if (effectiveRole(segment) === "source") continue;

      // Sentence-split long narration only — never source (film dialogue).
      // Keeps TTS pacing sane when STT returns mega-cues (multi-minute windows).
      const pieces = splitSegmentsForTts([
        {
          startSec: segment.startSec,
          endSec: segment.endSec,
          text: segment.text,
        },
      ]);

      let parentFitFailed = false;

      for (const piece of pieces) {
        const targetDurationSec = Math.max(piece.endSec - piece.startSec, 0.1);

        let synth = await adapter.synthesize({ text: piece.text, voiceId });
        ttsCostUsd += synth.costUsd;
        let plan = planSegmentFit({
          audioDurationSec: synth.durationSec,
          targetDurationSec,
          maxSpeed,
        });

        if (plan.action === "shorten") {
          const shortened = await shortenSegmentText({
            text: piece.text,
            targetDurationSec,
          });

          if (shortened.text && shortened.text !== piece.text) {
            synth = await adapter.synthesize({ text: shortened.text, voiceId });
            ttsCostUsd += synth.costUsd;
            plan = planSegmentFit({
              audioDurationSec: synth.durationSec,
              targetDurationSec,
              maxSpeed,
            });
          }

          if (plan.action === "shorten") {
            // Still doesn't fit after one shorten pass — record the failure but
            // keep a best-effort clip (tempo capped at maxSpeed) for this window
            // rather than dropping the line entirely.
            parentFitFailed = true;
          }
        }

        const fittedBuffer = await this.applyFitPlan(synth.buffer, plan);
        timelineSegments.push({
          startSec: piece.startSec,
          endSec: piece.endSec,
          fittedMp3Buffer: fittedBuffer,
        });
      }

      if (parentFitFailed) {
        fitFailedIndexes.push(index);
      }
    }

    const lastSegment = translated.segments[translated.segments.length - 1];
    const totalDurationSec =
      remake.videoDurationSec ?? lastSegment?.endSec ?? translated.durationSec;

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
      },
    });

    await this.prisma.usageEvent.create({
      data: {
        jobId,
        provider: "tts",
        model: getTtsModel(),
        costUsd: ttsCostUsd,
      },
    });

    this.logger.log(
      `remix_tts ${jobId}: dub assembled for ${remakeId} (${timelineSegments.length} clips from ${translated.segments.length} cues, ${fitFailedIndexes.length} fit failures)`,
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

    let renderedBuffer: Buffer;
    if (remake.dubSource === "tts") {
      // TTS dub only covers narration windows — mix it under the original
      // audio and duck the original during those windows.
      const translated =
        remake.sourceTranscriptTranslated as RemixTranscriptV1 | null;
      const narrationIntervals = mergeNarrationIntervals(
        translated?.segments ?? [],
      );

      renderedBuffer =
        remake.renderMode === "banner_audio"
          ? await this.remixRender.renderBannerAudioMix(
              videoBuffer,
              dubBuffer,
              remake.bannerJson as RemixBannerJson,
              narrationIntervals,
            )
          : await this.remixRender.renderAudioMix(
              videoBuffer,
              dubBuffer,
              narrationIntervals,
            );
    } else {
      // Upload dub, or legacy rows with null dubSource — full replace.
      renderedBuffer =
        remake.renderMode === "banner_audio"
          ? await this.remixRender.renderBannerAudio(
              videoBuffer,
              dubBuffer,
              remake.bannerJson as RemixBannerJson,
            )
          : await this.remixRender.renderAudioOnly(videoBuffer, dubBuffer);
    }

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

  private async applyFitPlan(
    buffer: Buffer,
    plan: SegmentFitPlan,
  ): Promise<Buffer> {
    if (plan.action === "pad" && plan.padSec) {
      return applyPad(buffer, plan.padSec);
    }
    if (plan.action === "speed" || plan.action === "shorten") {
      return applyTempo(buffer, plan.speed);
    }
    return buffer;
  }

  private async handleCleanupMedia(jobId: string): Promise<void> {
    const { deletedCount } = await this.remixCleanup.cleanupExpiredMedia();
    this.logger.log(
      `remix_cleanup_media ${jobId}: cleaned up ${deletedCount} items`,
    );
  }
}

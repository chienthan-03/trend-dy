import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job as BullJob } from "bullmq";
import type { JobsService } from "../../modules/jobs/jobs.service";
import type { PromptsService } from "../../modules/prompts/prompts.service";
import type { RemixStorageService } from "../../modules/remix/remix-storage.service";
import type { RemixService } from "../../modules/remix/remix.service";
import type { PrismaService } from "../../prisma/prisma.service";
import { RemixProcessor } from "./remix.processor";
import { markCompleted, markStarted } from "../job-status";
import { completeText } from "../../ai/gateway";
import { transcribeAudio } from "../../ai/stt";
import { translateTranscript } from "../../ai/translate";
import { extractAudioForStt } from "../../modules/remix/remix-audio.util";
import { createRemixMediaAdapter } from "../../modules/remix/remix-media.adapter";
import * as assembleDub from "../../modules/remix/tts/assemble-dub";
import * as batchCuesForTtsModule from "../../modules/remix/tts/batch-cues-for-tts";
import * as smartBatchCuesModule from "../../modules/remix/tts/smart-batch-cues";
import * as segmentFit from "../../modules/remix/tts/segment-fit";
import { FakeTtsAdapter } from "../../modules/remix/tts/fake-tts.adapter";
import { shortenSegmentText } from "../../modules/remix/tts/shorten-segment";

vi.mock("../job-status", () => ({
  markStarted: vi.fn().mockResolvedValue(undefined),
  markCompleted: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../ai/gateway", () => ({
  completeText: vi.fn().mockResolvedValue({
    text: JSON.stringify({
      locale: "vi",
      packaging: { titles: ["T1", "T2", "T3"], description: "D", hashtags: ["#H"] },
      transform_notes: {
        source_language: "zh",
        rewrite_strategy: "packaging_only",
        risks: [],
        input_mode: "transcript_full",
        source_duration_sec: 10,
      },
    }),
    model: "fake",
    tokensIn: 100,
    tokensOut: 200,
    provider: "fake",
  }),
}));

vi.mock("../../ai/stt", () => ({
  transcribeAudio: vi.fn().mockResolvedValue({
    transcript: {
      version: 1,
      language: "zh",
      durationSec: 10,
      segments: [{ startSec: 0, endSec: 10, text: "你好" }],
      fullText: "你好",
      provider: "fake",
      model: "whisper-1",
    },
    costUsd: 0.01,
    timingDegraded: false,
    timingCoarse: false,
  }),
}));

vi.mock("../../ai/translate", () => ({
  translateTranscript: vi.fn().mockResolvedValue({
    transcript: {
      version: 1,
      language: "vi",
      durationSec: 10,
      segments: [{ startSec: 0, endSec: 10, text: "Xin chào" }],
      fullText: "Xin chào",
      provider: "fake",
      model: "Helsinki-NLP/opus-mt-zh-vi",
    },
  }),
}));

const { probeClipDurationSecMock } = vi.hoisted(() => ({
  probeClipDurationSecMock: vi.fn(
    async (_buffer: Buffer, fallbackSec: number) => fallbackSec,
  ),
}));

vi.mock("../../modules/remix/remix-audio.util", () => ({
  extractAudioForStt: vi.fn().mockResolvedValue({
    buffer: Buffer.from("audio"),
    contentType: "audio/mpeg",
    fileName: "audio.mp3",
  }),
  probeClipDurationSec: probeClipDurationSecMock,
}));

vi.mock("../../modules/remix/remix-media.adapter", () => ({
  createRemixMediaAdapter: vi.fn().mockReturnValue({
    downloadFromPlayUrl: vi.fn().mockResolvedValue({
      buffer: Buffer.from("video"),
      contentType: "video/mp4",
    }),
  }),
}));

const { mockGetVideoDetail } = vi.hoisted(() => ({
  mockGetVideoDetail: vi.fn(),
}));

vi.mock("../../modules/remix/douyin-video.adapter", () => ({
  createDouyinVideoAdapter: vi.fn().mockResolvedValue({
    resolveShareUrl: vi.fn(),
    getVideoDetail: mockGetVideoDetail,
  }),
}));

const { shortenSegmentTextMock } = vi.hoisted(() => ({
  shortenSegmentTextMock: vi.fn(
    async (input: { text: string; targetDurationSec: number }) => {
      if (input.text.startsWith("B")) {
        return { text: "s".repeat(4) };
      }
      if (input.text.startsWith("D")) {
        return { text: "d".repeat(199) };
      }
      return { text: input.text };
    },
  ),
}));

vi.mock("../../modules/remix/tts/shorten-segment", () => ({
  shortenSegmentText: shortenSegmentTextMock,
}));

const { classifyTranslatedSegmentsMock } = vi.hoisted(() => ({
  classifyTranslatedSegmentsMock: vi.fn(),
}));

vi.mock("../../modules/remix/tts/classify-segments", () => ({
  classifyTranslatedSegments: classifyTranslatedSegmentsMock,
}));

// Piper/live engine tests stub the CLI/HTTP adapters (never invoked for the
// default `fake` engine tests) so no real subprocess/network call happens.
const { httpCtorSpy, httpSynthesizeMock } = vi.hoisted(() => ({
  httpCtorSpy: vi.fn(),
  httpSynthesizeMock: vi.fn(async (input: { text: string; voiceId: string }) => ({
    buffer: Buffer.from(`http:${input.text}`),
    contentType: "audio/mpeg" as const,
    durationSec: 2,
    costUsd: 0.01,
  })),
}));

vi.mock("../../modules/remix/tts/http-tts.adapter", () => ({
  HttpTtsAdapter: class {
    constructor() {
      httpCtorSpy();
    }
    synthesize(input: { text: string; voiceId: string }) {
      return httpSynthesizeMock(input);
    }
  },
}));

const { piperCtorSpy, piperSynthesizeMock } = vi.hoisted(() => ({
  piperCtorSpy: vi.fn(),
  piperSynthesizeMock: vi.fn(async (input: { text: string; voiceId: string }) => ({
    buffer: Buffer.from(`piper:${input.text}`),
    contentType: "audio/mpeg" as const,
    durationSec: 2,
    costUsd: 0,
  })),
}));

vi.mock("../../modules/remix/tts/piper-tts.adapter", () => ({
  PiperTtsAdapter: class {
    constructor() {
      piperCtorSpy();
    }
    synthesize(input: { text: string; voiceId: string }) {
      return piperSynthesizeMock(input);
    }
  },
}));

describe("RemixProcessor (Full Script Mode)", () => {
  let prisma: any;
  let jobsService: any;
  let promptsService: any;
  let remixService: any;
  let remixStorage: any;
  let remixRender: any;
  let processor: RemixProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    classifyTranslatedSegmentsMock.mockReset();
    process.env.REMIX_SKIP_GENERATE = "false";
    process.env.REMIX_TTS_MODE = "fake";
    process.env.REMIX_TTS_CACHE = "off";
    delete process.env.REMIX_TTS_MAX_SPEED;
    delete process.env.REMIX_TTS_BATCH_MODE;
    delete process.env.REMIX_PIPER_TTS_BATCH_MODE;
    delete process.env.REMIX_TTS_TIMING_MODE;
    mockGetVideoDetail.mockResolvedValue({
      videoId: "vid_1",
      title: "t",
      caption: "c",
      authorHandle: "@a",
      stats: {},
      playUrl: "https://play.url/fresh",
      rawPayload: {},
    });

    prisma = {
      viralRemake: {
        update: vi.fn().mockResolvedValue({}),
      },
      usageEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    jobsService = {
      enqueue: vi.fn().mockResolvedValue({ jobId: "next", status: "queued" }),
    };
    promptsService = {
      getActiveTemplate: vi.fn().mockImplementation((key) => {
        return Promise.resolve({
          id: `tpl_${key}`,
          key,
          version: 1,
          body: `system rules for ${key}`,
        });
      }),
    };
    remixService = {
      getRemake: vi.fn(),
      computePolicyWarnings: vi.fn().mockReturnValue([]),
    };
    remixStorage = {
      putVideo: vi.fn().mockResolvedValue("remix/remake_1/source-video.mp4"),
      putAudio: vi.fn().mockResolvedValue("remix/remake_1/source-audio.mp3"),
      getAudio: vi.fn().mockResolvedValue(Buffer.from("audio")),
      getVideo: vi.fn().mockResolvedValue(Buffer.from("video")),
      getDub: vi.fn().mockResolvedValue(Buffer.from("dub")),
      putDub: vi.fn().mockResolvedValue("remix/remake_1/dub-audio.mp3"),
      putRender: vi.fn().mockResolvedValue("remix/remake_1/render.mp4"),
    };
    remixRender = {
      renderAudioOnly: vi.fn().mockResolvedValue(Buffer.from("render-replace")),
      renderBannerAudio: vi.fn().mockResolvedValue(Buffer.from("render-banner-replace")),
    };

    processor = new RemixProcessor(
      prisma as unknown as PrismaService,
      jobsService as unknown as JobsService,
      promptsService as unknown as PromptsService,
      remixService as unknown as RemixService,
      remixStorage as unknown as RemixStorageService,
      {} as never,
      remixRender as never,
      {} as never,
    );
  });

  it("handleFetchDetail enqueues remix_download_media when scriptMode is full", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      externalVideoId: "vid_1",
      scriptMode: "full",
    });

    const job = {
      id: "job_fetch",
      name: "remix_fetch_detail",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(mockGetVideoDetail).toHaveBeenCalledWith("vid_1");
    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "remake_1" },
        data: expect.objectContaining({
          pipelinePhase: "downloading_media",
        }),
      }),
    );
    expect(jobsService.enqueue).toHaveBeenCalledWith({
      type: "remix_download_media",
      payload: { remakeId: "remake_1" },
    });
  });

  it("handleDownloadMedia downloads, extracts and enqueues stt", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      externalVideoId: "vid_1",
      sourceSnapshot: { playUrl: "https://play.url/stale" },
    });

    const { createRemixMediaAdapter } = await import(
      "../../modules/remix/remix-media.adapter"
    );
    const mediaAdapter = await createRemixMediaAdapter();

    const job = {
      id: "job_download",
      name: "remix_download_media",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(mockGetVideoDetail).toHaveBeenCalledWith("vid_1");
    expect(mediaAdapter.downloadFromPlayUrl).toHaveBeenCalledWith(
      "https://play.url/fresh",
      "vid_1",
    );
    expect(remixStorage.putVideo).toHaveBeenCalledWith(
      "remake_1",
      expect.any(Buffer),
      "video/mp4",
    );
    expect(remixStorage.putVideo.mock.invocationCallOrder[0]).toBeLessThan(
      extractAudioForStt.mock.invocationCallOrder[0],
    );
    expect(extractAudioForStt).toHaveBeenCalled();
    expect(remixStorage.putAudio).toHaveBeenCalledWith(
      "remake_1",
      expect.any(Buffer),
      "audio/mpeg",
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "remake_1" },
        data: expect.objectContaining({
          mediaVideoKey: "remix/remake_1/source-video.mp4",
          mediaAudioKey: "remix/remake_1/source-audio.mp3",
          pipelinePhase: "transcribing",
        }),
      }),
    );
    expect(jobsService.enqueue).toHaveBeenCalledWith({
      type: "remix_stt",
      payload: { remakeId: "remake_1" },
    });
  });

  it("handleDownloadMedia backfills video only when transcript already exists", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      externalVideoId: "vid_1",
      status: "ready",
      sourceSnapshot: { playUrl: "https://play.url/stale" },
      sourceTranscript: { version: 1, segments: [] },
      sourceTranscriptTranslated: { version: 1, segments: [] },
      packageJson: { packaging: { titles: ["a"] } },
      mediaAudioKey: "remix/remake_1/source-audio.mp3",
    });

    const { createRemixMediaAdapter } = await import(
      "../../modules/remix/remix-media.adapter"
    );
    const mediaAdapter = await createRemixMediaAdapter();

    const job = {
      id: "job_download_backfill",
      name: "remix_download_media",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(mediaAdapter.downloadFromPlayUrl).toHaveBeenCalledWith(
      "https://play.url/fresh",
      "vid_1",
    );
    expect(extractAudioForStt).not.toHaveBeenCalled();
    expect(remixStorage.putAudio).not.toHaveBeenCalled();
    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "remake_1" },
        data: expect.objectContaining({
          mediaVideoKey: "remix/remake_1/source-video.mp4",
          pipelinePhase: "ready",
          status: "ready",
        }),
      }),
    );
    expect(jobsService.enqueue).not.toHaveBeenCalled();
  });

  it("handleStt transcribes and enqueues translate", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      mediaAudioKey: "remix/remake_1/source-audio.mp3",
    });

    const job = {
      id: "job_stt",
      name: "remix_stt",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(transcribeAudio).toHaveBeenCalled();
    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "remake_1" },
        data: expect.objectContaining({
          pipelinePhase: "translating",
          videoDurationSec: 10,
          sourceTranscriptTranslated: null,
          timingWarning: null,
          mediaDubAudioKey: null,
          renderOutputKey: null,
          renderPhase: "idle",
          dubSource: null,
        }),
      }),
    );
    expect(jobsService.enqueue).toHaveBeenCalledWith({
      type: "remix_translate",
      payload: { remakeId: "remake_1", chainGenerate: true },
    });
  });

  it("handleTranslate saves Vietnamese transcript and enqueues generate", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      sourceTranscript: {
        version: 1,
        language: "zh",
        durationSec: 10,
        segments: [{ startSec: 0, endSec: 10, text: "你好" }],
        fullText: "你好",
        provider: "fake",
        model: "whisper-1",
      },
    });

    const job = {
      id: "job_translate",
      name: "remix_translate",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(translateTranscript).toHaveBeenCalled();
    expect(jobsService.enqueue).toHaveBeenCalledWith({
      type: "remix_generate",
      payload: { remakeId: "remake_1" },
    });
    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "remake_1" },
        data: expect.objectContaining({
          pipelinePhase: "generating",
        }),
      }),
    );
  });

  it("handleGenerate uses v2 prompt when scriptMode is full and transcript exists", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      scriptMode: "full",
      sourceTranscript: { segments: [], fullText: "T", durationSec: 10 },
      sourceSnapshot: { caption: "C", title: "T" },
    });

    const job = {
      id: "job_gen",
      name: "remix_generate",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(promptsService.getActiveTemplate).toHaveBeenCalledWith("remix.package.v2");
    expect(completeText).toHaveBeenCalled();
    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "remake_1" },
        data: expect.objectContaining({
          pipelinePhase: "ready",
          status: "ready",
        }),
      }),
    );
  });

  it("handleTts fits each segment, retries a shorten once, and assembles the dub", async () => {
    process.env.REMIX_TTS_BATCH_MODE = "per_cue";
    // ZH-pin + shorten/fit-fail behavior is the strict-timing contract; hybrid
    // is the default now and retimes unlocked narration instead of shortening.
    process.env.REMIX_TTS_TIMING_MODE = "strict";
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      ttsVoiceId: null,
      videoDurationSec: 12,
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 10,
        segments: [
          { startSec: 0, endSec: 2, text: "a".repeat(20), role: "narration", roleSource: "manual" },
          { startSec: 2, endSec: 6, text: "B".repeat(200), role: "narration", roleSource: "manual" },
          { startSec: 6, endSec: 10, text: "D".repeat(200), role: "narration", roleSource: "manual" },
        ],
        fullText: "full text",
        provider: "fake",
        model: "fake",
      },
    });

    const job = {
      id: "job_tts",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    // All roles are already set — lazy classify must not be invoked.
    expect(classifyTranslatedSegmentsMock).not.toHaveBeenCalled();

    // Segment 0 fits immediately; segments 1 and 2 needed a shorten pass.
    expect(shortenSegmentText).toHaveBeenCalledTimes(2);
    expect(shortenSegmentText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "B".repeat(200), targetDurationSec: 4 }),
    );
    expect(shortenSegmentText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "D".repeat(200), targetDurationSec: 4 }),
    );

    expect(remixStorage.putDub).toHaveBeenCalledWith(
      "remake_1",
      expect.any(Buffer),
    );

    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "remake_1" },
        data: expect.objectContaining({
          mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
          dubSource: "tts",
          ttsCostUsd: 0,
          // Segment 1 fits after one shorten pass; segment 2 still doesn't.
          ttsFitFailedIndexes: [2],
          renderPhase: "tts_ready",
        }),
      }),
    );
    // Success path must never touch the main script pipeline fields.
    expect(prisma.viralRemake.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pipelinePhase: expect.anything() }),
      }),
    );

    expect(prisma.usageEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobId: "job_tts", provider: "tts" }),
      }),
    );
    expect(markCompleted).toHaveBeenCalledWith(prisma, "job_tts", {
      remakeId: "remake_1",
    });
  });

  it("handleTts applies per-remake base speed from remake.ttsSpeed", async () => {
    const applyBaseSpy = vi.spyOn(segmentFit, "applyBaseTtsSpeed");
    process.env.REMIX_TTS_BATCH_MODE = "per_cue";
    process.env.REMIX_TTS_TIMING_MODE = "sequential";

    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      ttsVoiceId: null,
      ttsSpeed: 1.15,
      ttsMaxSpeed: null,
      videoDurationSec: 6,
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 6,
        segments: [
          { startSec: 0, endSec: 3, text: "Xin chào", role: "narration", roleSource: "manual" },
          { startSec: 3, endSec: 6, text: "Tạm biệt", role: "narration", roleSource: "manual" },
        ],
        fullText: "Xin chào Tạm biệt",
        provider: "fake",
        model: "fake",
      },
    });

    const job = {
      id: "job_tts_speed",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(applyBaseSpy).toHaveBeenCalled();
    expect(applyBaseSpy.mock.calls.every((call) => call[2] === 1.15)).toBe(true);
    applyBaseSpy.mockRestore();
  });

  it("handleTts skips synthesis when dubSource is upload with existing dub audio", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: "upload",
      mediaDubAudioKey: "remix/remake_1/uploaded-dub.mp3",
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 10,
        segments: [{ startSec: 0, endSec: 10, text: "Xin chào" }],
        fullText: "Xin chào",
        provider: "fake",
        model: "fake",
      },
    });

    const job = {
      id: "job_tts_upload",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(remixStorage.putDub).not.toHaveBeenCalled();
    expect(shortenSegmentText).not.toHaveBeenCalled();
    // Upload early-return must happen before any lazy classify call.
    expect(classifyTranslatedSegmentsMock).not.toHaveBeenCalled();
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { renderPhase: "tts_ready" },
    });
  });

  it("handleTts synthesizes all cues including source-role segments under replace mode", async () => {
    process.env.REMIX_TTS_BATCH_MODE = "per_cue";
    const synthSpy = vi.spyOn(FakeTtsAdapter.prototype, "synthesize");

    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      ttsVoiceId: null,
      videoDurationSec: 9,
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 9,
        segments: [
          { startSec: 0, endSec: 3, text: "Xin chào", role: "narration", roleSource: "manual" },
          { startSec: 3, endSec: 6, text: "Ố", role: "source", roleSource: "manual" },
          { startSec: 6, endSec: 9, text: "Tạm biệt", role: "narration", roleSource: "manual" },
        ],
        fullText: "Xin chào Ố Tạm biệt",
        provider: "fake",
        model: "fake",
      },
    });

    const job = {
      id: "job_tts_source",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    // TTS speaks every cue for continuous VI.
    expect(synthSpy).toHaveBeenCalledTimes(3);
    expect(synthSpy.mock.calls.map((call) => call[0]?.text)).toEqual([
      "Xin chào",
      "Ố",
      "Tạm biệt",
    ]);
    expect(classifyTranslatedSegmentsMock).not.toHaveBeenCalled();
    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dubSource: "tts",
          ttsFitFailedIndexes: [],
        }),
      }),
    );
  });

  it("handleTts trusts fine cue windows without sentence-split or speech align", async () => {
    process.env.REMIX_TTS_TIMING_MODE = "strict";
    const synthSpy = vi.spyOn(FakeTtsAdapter.prototype, "synthesize");
    const assembleSpy = vi.spyOn(assembleDub, "assembleDubTimeline");

    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      mediaAudioKey: "remix/remake_1/source-audio.mp3",
      ttsVoiceId: null,
      videoDurationSec: 30,
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 30,
        segments: [
          {
            startSec: 0,
            endSec: 4,
            text: "Câu một khá dài để buộc tách. Câu hai cũng dài tương tự thôi.",
            role: "narration",
            roleSource: "manual",
          },
          {
            startSec: 10,
            endSec: 14,
            text: "Thoại nhân vật. Câu hai của nhân vật cũng dài.",
            role: "source",
            roleSource: "manual",
          },
          {
            startSec: 20,
            endSec: 24,
            text: "Câu ba ngắn.",
            role: "narration",
            roleSource: "manual",
          },
        ],
        fullText: "…",
        provider: "fake",
        model: "fake",
      },
    });

    const job = {
      id: "job_tts_trust_cues",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(synthSpy).toHaveBeenCalledTimes(3);
    expect(synthSpy.mock.calls.map((call) => call[0].text)).toEqual([
      "Câu một khá dài để buộc tách. Câu hai cũng dài tương tự thôi.",
      "Thoại nhân vật. Câu hai của nhân vật cũng dài.",
      "Câu ba ngắn.",
    ]);
    expect(assembleSpy).toHaveBeenCalled();
    const timeline = assembleSpy.mock.calls[0]![0]!.segments;
    expect(timeline).toHaveLength(3);
    expect(timeline.map((clip) => [clip.startSec, clip.endSec])).toEqual([
      [0, 4],
      [10, 14],
      [20, 24],
    ]);

    assembleSpy.mockRestore();
  });

  it("handleTts records ttsFitFailedIndexes using persisted segment indexes across a source segment", async () => {
    process.env.REMIX_TTS_BATCH_MODE = "per_cue";
    // ZH-pin + shorten/fit-fail behavior is the strict-timing contract; hybrid
    // is the default now and retimes unlocked narration instead of shortening.
    process.env.REMIX_TTS_TIMING_MODE = "strict";
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      ttsVoiceId: null,
      videoDurationSec: 12,
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 12,
        segments: [
          { startSec: 0, endSec: 2, text: "a".repeat(20), role: "narration", roleSource: "manual" },
          { startSec: 2, endSec: 3, text: "Ố", role: "source", roleSource: "manual" },
          { startSec: 3, endSec: 7, text: "B".repeat(200), role: "narration", roleSource: "manual" },
          { startSec: 7, endSec: 11, text: "D".repeat(200), role: "narration", roleSource: "manual" },
        ],
        fullText: "full text",
        provider: "fake",
        model: "fake",
      },
    });

    const job = {
      id: "job_tts_indexes",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    // Source cue (index 1) is skipped. Segment 2 fits after shorten; segment 3 still fails.
    expect(shortenSegmentText).toHaveBeenCalledTimes(2);
    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ttsFitFailedIndexes: [3],
        }),
      }),
    );
  });

  it("handleTts hybrid retimes long narration before a source lock", async () => {
    process.env.REMIX_TTS_MODE = "fake";
    process.env.REMIX_TTS_TIMING_MODE = "hybrid";
    process.env.REMIX_TTS_BATCH_MODE = "per_cue";

    const assembleSpy = vi.spyOn(assembleDub, "assembleDubTimeline");

    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      ttsVoiceId: null,
      ttsEngine: null,
      videoDurationSec: 12,
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 12,
        segments: [
          { startSec: 0, endSec: 0.5, text: "A", role: "narration", roleSource: "manual" },
          {
            startSec: 0.5,
            endSec: 2,
            text: "B".repeat(200),
            role: "narration",
            roleSource: "manual",
          },
          { startSec: 5, endSec: 6, text: "C", role: "source", roleSource: "manual" },
        ],
        fullText: "…",
      },
    });

    await processor.process({
      id: "job_hybrid",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as never);

    expect(assembleSpy).toHaveBeenCalled();
    const segs = assembleSpy.mock.calls[0]![0].segments as Array<{
      startSec: number;
      endSec: number;
    }>;
    const narrB = segs[1]!;
    expect(narrB.endSec).toBeGreaterThan(2);

    // Unlocked narration retimes instead of losing words to an LLM shorten —
    // segment B would trigger `plan.action === "shorten"` against its ZH
    // window (1.5s) if it were pinned, but hybrid must skip shorten for it.
    expect(shortenSegmentText).not.toHaveBeenCalled();
  });

  it("handleTts hybrid defers next cue when probed audio exceeds slice estimate", async () => {
    process.env.REMIX_TTS_MODE = "fake";
    process.env.REMIX_TTS_TIMING_MODE = "hybrid";
    process.env.REMIX_TTS_BATCH_MODE = "per_cue";

    probeClipDurationSecMock.mockImplementation(async (_buffer, fallbackSec) => {
      if (Math.abs(fallbackSec - 2) < 0.01) {
        return 3.5;
      }
      return fallbackSec;
    });

    const assembleSpy = vi.spyOn(assembleDub, "assembleDubTimeline");

    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      ttsVoiceId: null,
      ttsEngine: null,
      videoDurationSec: 10,
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 10,
        segments: [
          { startSec: 0, endSec: 1, text: "Hi", role: "narration", roleSource: "manual" },
          {
            startSec: 1,
            endSec: 3,
            text: "B".repeat(40),
            role: "narration",
            roleSource: "manual",
          },
          { startSec: 2, endSec: 4, text: "End", role: "narration", roleSource: "manual" },
        ],
        fullText: "…",
      },
    });

    await processor.process({
      id: "job_hybrid_probe",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as never);

    const segs = assembleSpy.mock.calls[0]![0].segments as Array<{ startSec: number }>;
    expect(segs[2]!.startSec).toBeGreaterThanOrEqual(4.45);
  });

  it("handleTts replace defers overlapping cues after fit", async () => {
    process.env.REMIX_TTS_MODE = "fake";
    process.env.REMIX_TTS_TIMING_MODE = "hybrid";
    process.env.REMIX_TTS_BATCH_MODE = "per_cue";

    probeClipDurationSecMock.mockImplementation(async (_buffer, fallbackSec) => {
      if (Math.abs(fallbackSec - 2) < 0.01) {
        return 3.2;
      }
      return fallbackSec;
    });

    const assembleSpy = vi.spyOn(assembleDub, "assembleDubTimeline");

    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      ttsVoiceId: null,
      ttsEngine: null,
      videoDurationSec: 10,
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 10,
        segments: [
          { startSec: 0, endSec: 1, text: "Hi", role: "narration", roleSource: "manual" },
          {
            startSec: 1,
            endSec: 3,
            text: "B".repeat(40),
            role: "narration",
            roleSource: "manual",
          },
          { startSec: 2, endSec: 4, text: "End", role: "narration", roleSource: "manual" },
        ],
        fullText: "…",
      },
    });

    await processor.process({
      id: "job_finalize_overlap",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as never);

    const segs = assembleSpy.mock.calls[0]![0].segments as Array<{ startSec: number }>;
    expect(segs[2]!.startSec).toBeGreaterThanOrEqual(4.15);
  });

  it("handleTts sequential defers next cue when probed audio exceeds estimate", async () => {
    process.env.REMIX_TTS_MODE = "fake";
    process.env.REMIX_TTS_TIMING_MODE = "sequential";
    process.env.REMIX_TTS_BATCH_MODE = "per_cue";

    probeClipDurationSecMock.mockImplementation(async (_buffer, fallbackSec) => {
      if (Math.abs(fallbackSec - 2) < 0.01) {
        return 3.5;
      }
      return fallbackSec;
    });

    const assembleSpy = vi.spyOn(assembleDub, "assembleDubTimeline");

    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      ttsVoiceId: null,
      ttsEngine: null,
      videoDurationSec: 10,
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 10,
        segments: [
          { startSec: 0, endSec: 1, text: "Hi", role: "narration", roleSource: "manual" },
          {
            startSec: 1,
            endSec: 3,
            text: "B".repeat(40),
            role: "narration",
            roleSource: "manual",
          },
          { startSec: 2, endSec: 4, text: "End", role: "narration", roleSource: "manual" },
        ],
        fullText: "…",
      },
    });

    await processor.process({
      id: "job_sequential_overlap",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as never);

    const segs = assembleSpy.mock.calls[0]![0].segments as Array<{ startSec: number }>;
    expect(segs[2]!.startSec).toBeGreaterThanOrEqual(4.45);
  });

  it("handleTts strict keeps ZH startSec for narration", async () => {
    process.env.REMIX_TTS_MODE = "fake";
    process.env.REMIX_TTS_TIMING_MODE = "strict";
    process.env.REMIX_TTS_BATCH_MODE = "per_cue";

    const assembleSpy = vi.spyOn(assembleDub, "assembleDubTimeline");

    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      ttsVoiceId: null,
      ttsEngine: null,
      videoDurationSec: 10,
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 10,
        segments: [
          { startSec: 0, endSec: 2, text: "A".repeat(80), role: "narration", roleSource: "manual" },
          { startSec: 2, endSec: 4, text: "B", role: "narration", roleSource: "manual" },
        ],
        fullText: "…",
      },
    });

    await processor.process({
      id: "job_strict",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as never);

    const segs = assembleSpy.mock.calls[0]![0].segments as Array<{ startSec: number }>;
    expect(segs[0]!.startSec).toBe(0);
    expect(segs[1]!.startSec).toBe(2);
  });

  it("handleTts invokes lazy classify when any segment role is unset", async () => {
    classifyTranslatedSegmentsMock.mockResolvedValue({
      ok: true,
      segments: [
        { startSec: 0, endSec: 3, text: "Xin chào", role: "narration", roleSource: "auto" },
        { startSec: 3, endSec: 6, text: "Ố", role: "source", roleSource: "auto" },
      ],
    });

    const sourceTranscript = {
      version: 1,
      language: "zh",
      durationSec: 6,
      segments: [
        { startSec: 0, endSec: 3, text: "你好" },
        { startSec: 3, endSec: 6, text: "啊" },
      ],
      fullText: "你好啊",
      provider: "fake",
      model: "whisper-1",
    };
    const translatedTranscript = {
      version: 1,
      language: "vi",
      durationSec: 6,
      segments: [
        { startSec: 0, endSec: 3, text: "Xin chào" },
        { startSec: 3, endSec: 6, text: "Ố" },
      ],
      fullText: "Xin chào Ố",
      provider: "fake",
      model: "fake",
    };

    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      ttsVoiceId: null,
      videoDurationSec: 6,
      sourceTranscript,
      sourceTranscriptTranslated: translatedTranscript,
    });

    const job = {
      id: "job_tts_lazy_classify",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(classifyTranslatedSegmentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: sourceTranscript,
        translated: translatedTranscript,
        mode: "lazy",
      }),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceTranscriptTranslated: expect.objectContaining({
            segments: [
              expect.objectContaining({ role: "narration" }),
              expect.objectContaining({ role: "source" }),
            ],
          }),
          classifyWarning: null,
        }),
      }),
    );
  });

  it("handleTts proceeds with default narration roles when lazy classify fails", async () => {
    classifyTranslatedSegmentsMock.mockResolvedValue({
      ok: false,
      warning: "classify failed",
    });
    const synthSpy = vi.spyOn(FakeTtsAdapter.prototype, "synthesize");

    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      ttsVoiceId: null,
      videoDurationSec: 6,
      sourceTranscript: {
        version: 1,
        language: "zh",
        durationSec: 6,
        segments: [
          { startSec: 0, endSec: 3, text: "你好" },
          { startSec: 3, endSec: 6, text: "啊" },
        ],
        fullText: "你好啊",
        provider: "fake",
        model: "whisper-1",
      },
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 6,
        segments: [
          { startSec: 0, endSec: 3, text: "Xin chào" },
          { startSec: 3, endSec: 6, text: "Ố" },
        ],
        fullText: "Xin chào Ố",
        provider: "fake",
        model: "fake",
      },
    });

    const job = {
      id: "job_tts_classify_fail",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    // effectiveRole defaults unset roles to "narration"; batch mode may merge
    // adjacent cues into one synthesize call.
    expect(synthSpy).toHaveBeenCalledTimes(1);
    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { classifyWarning: "classify failed" },
      }),
    );
  });

  it("handleTts resolves engine=piper from remake.ttsEngine, per-cue batches by default, normalizes text", async () => {
    const smartSpy = vi.spyOn(smartBatchCuesModule, "smartBatchCuesForTts");
    const ratioSpy = vi.spyOn(batchCuesForTtsModule, "batchCuesForTts");

    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      ttsVoiceId: null,
      ttsEngine: "piper",
      videoDurationSec: 6,
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 6,
        segments: [
          { startSec: 0, endSec: 3, text: "Xin chào 50%", role: "narration", roleSource: "manual" },
          { startSec: 3, endSec: 6, text: "Tạm biệt", role: "narration", roleSource: "manual" },
        ],
        fullText: "Xin chào 50% Tạm biệt",
        provider: "fake",
        model: "fake",
      },
    });

    const job = {
      id: "job_tts_piper",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(smartSpy).not.toHaveBeenCalled();
    expect(ratioSpy).not.toHaveBeenCalled();
    expect(httpCtorSpy).not.toHaveBeenCalled();
    expect(piperCtorSpy).toHaveBeenCalledTimes(1);
    expect(piperSynthesizeMock).toHaveBeenCalledTimes(2);

    // Text sent to Piper is normalized (digits/percent spelled out for VI TTS).
    const synthesizeCall = piperSynthesizeMock.mock.calls[0]![0] as {
      text: string;
      voiceId: string;
    };
    expect(synthesizeCall.text).toContain("phần trăm");
    expect(synthesizeCall.text).not.toMatch(/\d/);
    // Piper ignores the OpenRouter voiceId — cache/synthesize key off the model stem.
    expect(synthesizeCall.voiceId).toBe("ngoc-huyen");

    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dubSource: "tts",
          renderPhase: "tts_ready",
          ttsEngine: "piper",
        }),
      }),
    );

    smartSpy.mockRestore();
    ratioSpy.mockRestore();
  });

  it("handleTts piper smart-batch when REMIX_PIPER_TTS_BATCH_MODE=smart", async () => {
    process.env.REMIX_PIPER_TTS_BATCH_MODE = "smart";
    const smartSpy = vi.spyOn(smartBatchCuesModule, "smartBatchCuesForTts");

    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      ttsVoiceId: null,
      ttsEngine: "piper",
      videoDurationSec: 6,
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 6,
        segments: [
          { startSec: 0, endSec: 3, text: "Xin chào", role: "narration", roleSource: "manual" },
          { startSec: 3, endSec: 6, text: "Tạm biệt", role: "narration", roleSource: "manual" },
        ],
        fullText: "Xin chào Tạm biệt",
      },
    });

    await processor.process({
      id: "job_tts_piper_smart",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as never);

    expect(smartSpy).toHaveBeenCalled();
    expect(piperSynthesizeMock).toHaveBeenCalledTimes(1);

    smartSpy.mockRestore();
  });

  it("handleTts resolves engine=live from payload.engine (overriding remake.ttsEngine), uses ratio batch, and never constructs PiperTtsAdapter", async () => {
    const smartSpy = vi.spyOn(smartBatchCuesModule, "smartBatchCuesForTts");
    const ratioSpy = vi.spyOn(batchCuesForTtsModule, "batchCuesForTts");

    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: null,
      mediaDubAudioKey: null,
      ttsVoiceId: null,
      // Remake was last run with piper — payload.engine must win for this job.
      ttsEngine: "piper",
      videoDurationSec: 6,
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 6,
        segments: [
          { startSec: 0, endSec: 3, text: "Xin chào", role: "narration", roleSource: "manual" },
          { startSec: 3, endSec: 6, text: "Tạm biệt", role: "narration", roleSource: "manual" },
        ],
        fullText: "Xin chào Tạm biệt",
        provider: "fake",
        model: "fake",
      },
    });

    const job = {
      id: "job_tts_live",
      name: "remix_tts",
      data: { remakeId: "remake_1", engine: "live" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(ratioSpy).toHaveBeenCalled();
    expect(smartSpy).not.toHaveBeenCalled();
    expect(piperCtorSpy).not.toHaveBeenCalled();
    expect(httpCtorSpy).toHaveBeenCalledTimes(1);
    expect(httpSynthesizeMock).toHaveBeenCalled();

    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dubSource: "tts",
          renderPhase: "tts_ready",
          ttsEngine: "live",
        }),
      }),
    );

    smartSpy.mockRestore();
    ratioSpy.mockRestore();
  });

  it("remix_tts failure only marks renderPhase/renderError, not the script pipeline", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      sourceTranscriptTranslated: null,
    });

    const job = {
      id: "job_tts_missing",
      name: "remix_tts",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await expect(processor.process(job)).rejects.toThrow(/translated transcript/);

    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        renderPhase: "failed",
        renderError: expect.stringContaining("translated transcript"),
      },
    });
  });

  it("handleRender uses full audio replace for TTS dub under default replace mode", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      dubSource: "tts",
      renderMode: "audio_only",
      mediaVideoKey: "remix/remake_1/source-video.mp4",
      mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
      sourceTranscriptTranslated: {
        version: 1,
        language: "vi",
        durationSec: 6,
        segments: [
          { startSec: 0, endSec: 3, text: "A", role: "narration" },
          { startSec: 3, endSec: 6, text: "B", role: "source" },
        ],
      },
    });

    const job = {
      id: "job_render_replace",
      name: "remix_render",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(remixRender.renderAudioOnly).toHaveBeenCalledWith(
      Buffer.from("video"),
      Buffer.from("dub"),
      undefined,
    );
    expect(remixStorage.putRender).toHaveBeenCalled();
    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          renderPhase: "render_ready",
          renderOutputKey: "remix/remake_1/render.mp4",
        }),
      }),
    );
  });
});

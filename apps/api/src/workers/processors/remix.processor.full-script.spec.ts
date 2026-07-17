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

vi.mock("../../modules/remix/remix-audio.util", () => ({
  extractAudioForStt: vi.fn().mockResolvedValue({
    buffer: Buffer.from("audio"),
    contentType: "audio/mpeg",
    fileName: "audio.mp3",
  }),
}));

vi.mock("../../modules/remix/remix-media.adapter", () => ({
  createRemixMediaAdapter: vi.fn().mockReturnValue({
    downloadFromPlayUrl: vi.fn().mockResolvedValue({
      buffer: Buffer.from("video"),
      contentType: "video/mp4",
    }),
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

describe("RemixProcessor (Full Script Mode)", () => {
  let prisma: any;
  let jobsService: any;
  let promptsService: any;
  let remixService: any;
  let remixStorage: any;
  let processor: RemixProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REMIX_SKIP_GENERATE = "false";
    process.env.REMIX_TTS_MODE = "fake";
    delete process.env.REMIX_TTS_MAX_SPEED;

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
      putDub: vi.fn().mockResolvedValue("remix/remake_1/dub-audio.mp3"),
    };

    processor = new RemixProcessor(
      prisma as unknown as PrismaService,
      jobsService as unknown as JobsService,
      promptsService as unknown as PromptsService,
      remixService as unknown as RemixService,
      remixStorage as unknown as RemixStorageService,
      {} as never,
      {} as never,
    );
  });

  it("handleFetchDetail enqueues remix_download_media when scriptMode is full", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      externalVideoId: "vid_1",
      scriptMode: "full",
    });

    // Mock Douyin adapter
    const { createDouyinVideoAdapter } = await import("../../modules/remix/douyin-video.adapter");
    vi.mock("../../modules/remix/douyin-video.adapter", () => ({
      createDouyinVideoAdapter: vi.fn().mockResolvedValue({
        getVideoDetail: vi.fn().mockResolvedValue({
          videoId: "vid_1",
          playUrl: "https://play.url",
          rawPayload: {},
        }),
      }),
    }));

    const job = {
      id: "job_fetch",
      name: "remix_fetch_detail",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

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
      sourceSnapshot: { playUrl: "https://play.url" },
    });

    const job = {
      id: "job_download",
      name: "remix_download_media",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

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
          { startSec: 0, endSec: 2, text: "a".repeat(20) },
          { startSec: 2, endSec: 6, text: "B".repeat(200) },
          { startSec: 6, endSec: 10, text: "D".repeat(200) },
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
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { renderPhase: "tts_ready" },
    });
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
});

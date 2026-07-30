import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job as BullJob } from "bullmq";
import type { JobsService } from "../../modules/jobs/jobs.service";
import type { PromptsService } from "../../modules/prompts/prompts.service";
import type { RemixMediaCleanupService } from "../../modules/remix/remix-media-cleanup.service";
import type { RemixRenderService } from "../../modules/remix/remix-render.service";
import type { RemixStorageService } from "../../modules/remix/remix-storage.service";
import type { RemixService } from "../../modules/remix/remix.service";
import type { PrismaService } from "../../prisma/prisma.service";
import { RemixProcessor } from "./remix.processor";

vi.mock("../job-status", () => ({
  markStarted: vi.fn().mockResolvedValue(undefined),
  markCompleted: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
}));

const { mockResolveShareUrl, mockGetVideoDetail } = vi.hoisted(() => ({
  mockResolveShareUrl: vi.fn(),
  mockGetVideoDetail: vi.fn(),
}));

vi.mock("../../ai/gateway", () => ({
  completeText: vi.fn().mockResolvedValue({
    text: JSON.stringify({
      locale: "vi",
      banners: {
        top: "RECAP",
        bottom: "Follow",
        watermark: "STUDIO ALPHA",
      },
      packaging: {
        titles: ["A"],
        description: "Desc",
        hashtags: ["recap"],
      },
      subtitles: {
        format: "srt",
        cues: [
          {
            start: "00:00:00,000",
            end: "00:00:01,000",
            text: "Cue",
          },
        ],
      },
      transform_notes: {
        source_language: "zh",
        rewrite_strategy: "recap",
        risks: [],
      },
    }),
    model: "fake",
    tokensIn: 100,
    tokensOut: 200,
    provider: "fake",
  }),
}));

vi.mock("../../modules/remix/douyin-video.adapter", () => ({
  createDouyinVideoAdapter: vi.fn().mockResolvedValue({
    resolveShareUrl: mockResolveShareUrl,
    getVideoDetail: mockGetVideoDetail,
  }),
}));

import { markCompleted, markFailed, markStarted } from "../job-status";
import { completeText } from "../../ai/gateway";

describe("RemixProcessor", () => {
  let prisma: {
    viralRemake: {
      update: ReturnType<typeof vi.fn>;
    };
    usageEvent: {
      create: ReturnType<typeof vi.fn>;
    };
  };
  let jobsService: { enqueue: ReturnType<typeof vi.fn> };
  let promptsService: { getActiveTemplate: ReturnType<typeof vi.fn> };
  let remixService: {
    getRemake: ReturnType<typeof vi.fn>;
    computePolicyWarnings: ReturnType<typeof vi.fn>;
  };
  let remixStorage: {
    putAudio: ReturnType<typeof vi.fn>;
    getAudio: ReturnType<typeof vi.fn>;
    getVideo: ReturnType<typeof vi.fn>;
    getDub: ReturnType<typeof vi.fn>;
    putRender: ReturnType<typeof vi.fn>;
  };
  let remixRender: {
    renderAudioOnly: ReturnType<typeof vi.fn>;
    renderBannerAudio: ReturnType<typeof vi.fn>;
  };
  let processor: RemixProcessor;

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      viralRemake: {
        update: vi.fn().mockResolvedValue({}),
      },
      usageEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    jobsService = {
      enqueue: vi.fn().mockResolvedValue({ jobId: "next_job", status: "queued" }),
    };
    promptsService = {
      getActiveTemplate: vi.fn().mockResolvedValue({
        id: "tpl_1",
        key: "remix.package.v1",
        version: 1,
        body: "system rules",
      }),
    };
    remixService = {
      getRemake: vi.fn(),
      computePolicyWarnings: vi.fn().mockReturnValue([]),
    };
    remixStorage = {
      putAudio: vi.fn().mockResolvedValue(undefined),
      getAudio: vi.fn().mockResolvedValue(Buffer.from("audio")),
      getVideo: vi.fn().mockResolvedValue(Buffer.from("video")),
      getDub: vi.fn().mockResolvedValue(Buffer.from("dub")),
      putRender: vi.fn().mockResolvedValue("remix/remake_1/render.mp4"),
    };
    remixRender = {
      renderAudioOnly: vi.fn().mockResolvedValue(Buffer.from("rendered-mp4")),
      renderBannerAudio: vi
        .fn()
        .mockResolvedValue(Buffer.from("rendered-banner-mp4")),
    };
    const remixBgmService = {
      assertTrackId: vi.fn((id: string) => id),
      readTrackBuffer: vi.fn().mockResolvedValue(Buffer.from("bgm-audio")),
      getTrackDurationSec: vi.fn().mockResolvedValue(180),
    };

    mockResolveShareUrl.mockResolvedValue({
      videoId: "fake-video-001",
      canonicalUrl: "https://example.test/fake/fake-video-001",
    });
    mockGetVideoDetail.mockResolvedValue({
      videoId: "fake-video-001",
      title: "Title",
      caption: "Caption gốc",
      authorHandle: "@user",
      stats: { likes: 1 },
      rawPayload: { source: "test" },
    });

    processor = new RemixProcessor(
      prisma as unknown as PrismaService,
      jobsService as unknown as JobsService,
      promptsService as unknown as PromptsService,
      remixService as unknown as RemixService,
      remixStorage as unknown as RemixStorageService,
      {} as RemixMediaCleanupService,
      remixRender as unknown as RemixRenderService,
      remixBgmService as unknown as import("../../modules/remix/remix-bgm.service").RemixBgmService,
    );
  });

  it("remix_resolve updates remake and chains remix_fetch_detail", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      externalVideoId: "pending",
    });

    const job = {
      id: "job_resolve",
      name: "remix_resolve",
      data: {
        remakeId: "remake_1",
        shareUrl: "https://v.douyin.com/abc/",
      },
    } as unknown as BullJob;

    await processor.process(job);

    expect(markStarted).toHaveBeenCalledWith(prisma, "job_resolve");
    expect(mockResolveShareUrl).toHaveBeenCalledWith("https://v.douyin.com/abc/");
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        externalVideoId: "fake-video-001",
        sourceUrl: "https://example.test/fake/fake-video-001",
      },
    });
    expect(jobsService.enqueue).toHaveBeenCalledWith({
      type: "remix_fetch_detail",
      payload: {
        remakeId: "remake_1",
        videoId: "fake-video-001",
      },
    });
    expect(markCompleted).toHaveBeenCalledWith(prisma, "job_resolve", {
      remakeId: "remake_1",
    });
  });

  it("remix_fetch_detail persists snapshot and chains remix_generate", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      externalVideoId: "fake-video-001",
      scriptMode: "caption",
    });

    const job = {
      id: "job_fetch",
      name: "remix_fetch_detail",
      data: {
        remakeId: "remake_1",
        videoId: "fake-video-001",
      },
    } as unknown as BullJob;

    await processor.process(job);

    expect(mockGetVideoDetail).toHaveBeenCalledWith("fake-video-001");
    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "remake_1" },
        data: expect.objectContaining({
          status: "running",
          sourceSnapshot: expect.objectContaining({
            videoId: "fake-video-001",
            caption: "Caption gốc",
          }),
        }),
      }),
    );
    expect(jobsService.enqueue).toHaveBeenCalledWith({
      type: "remix_generate",
      payload: { remakeId: "remake_1" },
    });
    expect(markCompleted).toHaveBeenCalledWith(prisma, "job_fetch", {
      remakeId: "remake_1",
    });
  });

  it("remix_generate writes package, usage event, and marks ready", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      genre: "cultivation",
      sourceSnapshot: {
        caption: "Caption gốc",
        title: "Title",
      },
    });

    const job = {
      id: "job_generate",
      name: "remix_generate",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(promptsService.getActiveTemplate).toHaveBeenCalledWith("remix.package.v1");
    expect(completeText).toHaveBeenCalled();
    expect(remixService.computePolicyWarnings).toHaveBeenCalled();
    expect(prisma.viralRemake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "remake_1" },
        data: expect.objectContaining({
          status: "ready",
          tokensIn: 100,
          tokensOut: 200,
        }),
      }),
    );
    expect(prisma.usageEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobId: "job_generate",
          tokensIn: 100,
          tokensOut: 200,
        }),
      }),
    );
    expect(markCompleted).toHaveBeenCalledWith(prisma, "job_generate", {
      remakeId: "remake_1",
    });
  });

  it("remix_render (dubSource=upload) renders audio_only with no mix and marks render_ready", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      mediaVideoKey: "remix/remake_1/source-video.mp4",
      mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
      renderMode: "audio_only",
      dubSource: "upload",
    });

    const job = {
      id: "job_render",
      name: "remix_render",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(remixStorage.getVideo).toHaveBeenCalledWith(
      "remix/remake_1/source-video.mp4",
    );
    expect(remixStorage.getDub).toHaveBeenCalledWith(
      "remix/remake_1/dub-audio.mp3",
    );
    expect(remixRender.renderAudioOnly).toHaveBeenCalledWith(
      Buffer.from("video"),
      Buffer.from("dub"),
      undefined,
    );
    expect(remixStorage.putRender).toHaveBeenCalledWith(
      "remake_1",
      Buffer.from("rendered-mp4"),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        renderOutputKey: "remix/remake_1/render.mp4",
        renderPhase: "render_ready",
        renderError: null,
      },
    });
    expect(markCompleted).toHaveBeenCalledWith(prisma, "job_render", {
      remakeId: "remake_1",
    });
  });

  it("remix_render (dubSource=null) uses full replace for legacy remakes", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      mediaVideoKey: "remix/remake_1/source-video.mp4",
      mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
      renderMode: "audio_only",
      dubSource: null,
    });

    const job = {
      id: "job_render_legacy",
      name: "remix_render",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(remixRender.renderAudioOnly).toHaveBeenCalledWith(
      Buffer.from("video"),
      Buffer.from("dub"),
      undefined,
    );
  });

  it("remix_render fails clearly when mediaVideoKey or mediaDubAudioKey is missing", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      mediaVideoKey: null,
      mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
    });

    const job = {
      id: "job_render_missing",
      name: "remix_render",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await expect(processor.process(job)).rejects.toThrow(/mediaVideoKey/);

    expect(remixRender.renderAudioOnly).not.toHaveBeenCalled();
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        renderPhase: "failed",
        renderError: expect.stringContaining("mediaVideoKey"),
      },
    });
  });

  it("remix_render (dubSource=upload) renders banner_audio with no mix and marks render_ready", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      mediaVideoKey: "remix/remake_1/source-video.mp4",
      mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
      renderMode: "banner_audio",
      dubSource: "upload",
      bannerJson: { header: "Header", bottom: "Bottom" },
    });

    const job = {
      id: "job_render_banner",
      name: "remix_render",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await processor.process(job);

    expect(remixRender.renderBannerAudio).toHaveBeenCalledWith(
      Buffer.from("video"),
      Buffer.from("dub"),
      { header: "Header", bottom: "Bottom" },
      undefined,
    );
    expect(remixRender.renderAudioOnly).not.toHaveBeenCalled();
    expect(remixStorage.putRender).toHaveBeenCalledWith(
      "remake_1",
      Buffer.from("rendered-banner-mp4"),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        renderOutputKey: "remix/remake_1/render.mp4",
        renderPhase: "render_ready",
        renderError: null,
      },
    });
  });

  it("remix_render fails clearly when banner_audio is missing bannerJson", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      mediaVideoKey: "remix/remake_1/source-video.mp4",
      mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
      renderMode: "banner_audio",
      bannerJson: null,
    });

    const job = {
      id: "job_render_banner_missing",
      name: "remix_render",
      data: { remakeId: "remake_1" },
    } as unknown as BullJob;

    await expect(processor.process(job)).rejects.toThrow(/bannerJson/);

    expect(remixRender.renderBannerAudio).not.toHaveBeenCalled();
    expect(remixRender.renderAudioOnly).not.toHaveBeenCalled();
  });

  it("marks remake failed and job failed on error", async () => {
    remixService.getRemake.mockRejectedValue(new Error("not found"));

    const job = {
      id: "job_fail",
      name: "remix_generate",
      data: { remakeId: "missing" },
    } as unknown as BullJob;

    await expect(processor.process(job)).rejects.toThrow("not found");

    expect(markFailed).toHaveBeenCalledWith(prisma, "job_fail", "not found");
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "missing" },
      data: { status: "failed", pipelinePhase: "failed" },
    });
  });
});

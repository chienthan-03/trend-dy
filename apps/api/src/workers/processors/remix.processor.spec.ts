import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job as BullJob } from "bullmq";
import type { JobsService } from "../../modules/jobs/jobs.service";
import type { PromptsService } from "../../modules/prompts/prompts.service";
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
      script: {
        narration: "Kịch bản recap mới hoàn toàn khác caption gốc.",
        duration_estimate_sec: 90,
        sections: [{ label: "body", text: "Nội dung recap." }],
      },
      hook_3s: {
        spoken: "Điều gì khiến anh chàng này bức bối?",
        on_screen: "BẤT NGỜ",
        visual_hint: "zoom in",
      },
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

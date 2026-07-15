import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobsService } from "../jobs/jobs.service";
import type { PrismaService } from "../../prisma/prisma.service";
import { RemixService } from "./remix.service";

describe("RemixService.triggerRemix", () => {
  let prisma: {
    project: { findUnique: ReturnType<typeof vi.fn> };
    viralItem: { findUnique: ReturnType<typeof vi.fn> };
    viralRemake: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
  let jobsService: { enqueue: ReturnType<typeof vi.fn> };
  let service: RemixService;
  let previousRemixEnabled: string | undefined;

  beforeEach(() => {
    previousRemixEnabled = process.env.REMIX_ENABLED;
    process.env.REMIX_ENABLED = "true";

    prisma = {
      project: { findUnique: vi.fn() },
      viralItem: { findUnique: vi.fn() },
      viralRemake: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    jobsService = {
      enqueue: vi.fn().mockResolvedValue({ jobId: "job_1", status: "queued" }),
    };
    service = new RemixService(
      prisma as unknown as PrismaService,
      jobsService as unknown as JobsService,
    );
  });

  afterEach(() => {
    if (previousRemixEnabled === undefined) {
      delete process.env.REMIX_ENABLED;
    } else {
      process.env.REMIX_ENABLED = previousRemixEnabled;
    }
  });

  it("throws ServiceUnavailableException when REMIX_ENABLED is false", async () => {
    process.env.REMIX_ENABLED = "false";

    await expect(
      service.triggerRemix({ projectId: "proj_1", viralItemId: "item_1" }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(jobsService.enqueue).not.toHaveBeenCalled();
  });

  it("throws ForbiddenException when viral item usagePolicy is blocked", async () => {
    prisma.project.findUnique.mockResolvedValue({ id: "proj_1" });
    prisma.viralItem.findUnique.mockResolvedValue({
      id: "item_1",
      externalId: "ext_1",
      usagePolicy: "blocked",
      canonicalUrl: "https://douyin.com/video/1",
      caption: "blocked caption",
      genres: [],
    });

    await expect(
      service.triggerRemix({ projectId: "proj_1", viralItemId: "item_1" }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.viralRemake.create).not.toHaveBeenCalled();
    expect(jobsService.enqueue).not.toHaveBeenCalled();
  });

  it("triggerRemix enqueues remix_fetch_detail when viralItemId provided", async () => {
    prisma.project.findUnique.mockResolvedValue({ id: "proj_1" });
    prisma.viralItem.findUnique.mockResolvedValue({
      id: "item_1",
      externalId: "ext_1",
      usagePolicy: "research_only",
      canonicalUrl: "https://douyin.com/video/1",
      caption: "test caption",
      genres: ["cultivation"],
    });
    prisma.viralRemake.create.mockImplementation(async ({ data }) => ({
      id: "remake_1",
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await service.triggerRemix({
      projectId: "proj_1",
      viralItemId: "item_1",
    });

    expect(result.remakeId).toBeTruthy();
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remix_fetch_detail",
        payload: expect.objectContaining({
          remakeId: "remake_1",
          videoId: "ext_1",
        }),
      }),
    );
  });

  it("enqueues remix_resolve when only shareUrl is provided", async () => {
    prisma.project.findUnique.mockResolvedValue({ id: "proj_1" });
    prisma.viralRemake.create.mockImplementation(async ({ data }) => ({
      id: "remake_2",
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await service.triggerRemix({
      projectId: "proj_1",
      shareUrl: "https://v.douyin.com/abc",
    });

    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remix_resolve",
        payload: expect.objectContaining({
          remakeId: "remake_2",
          shareUrl: "https://v.douyin.com/abc",
        }),
      }),
    );
  });

  it("throws BadRequestException when neither viralItemId nor shareUrl is provided", async () => {
    prisma.project.findUnique.mockResolvedValue({ id: "proj_1" });

    await expect(
      service.triggerRemix({ projectId: "proj_1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws NotFoundException when viral item is missing", async () => {
    prisma.project.findUnique.mockResolvedValue({ id: "proj_1" });
    prisma.viralItem.findUnique.mockResolvedValue(null);

    await expect(
      service.triggerRemix({ projectId: "proj_1", viralItemId: "missing" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("RemixService.computePolicyWarnings", () => {
  let service: RemixService;

  beforeEach(() => {
    service = new RemixService(
      {} as PrismaService,
      { enqueue: vi.fn() } as unknown as JobsService,
    );
  });

  it("warns when script overlaps caption heavily", () => {
    const caption = "alpha beta gamma delta epsilon zeta";
    const narration = "alpha beta gamma delta epsilon zeta eta theta";

    const warnings = service.computePolicyWarnings({
      sourceSnapshot: { caption },
      packageJson: {
        script: { narration, duration_estimate_sec: 30, sections: [] },
        hook_3s: { spoken: "new hook", on_screen: "", visual_hint: "" },
        banners: { top: "", bottom: "", watermark: "STUDIO" },
      },
    });

    expect(warnings).toContain("Script quá giống caption gốc");
  });

  it("warns when hook matches first caption sentence", () => {
    const warnings = service.computePolicyWarnings({
      sourceSnapshot: { caption: "First sentence here. Second sentence." },
      packageJson: {
        script: { narration: "completely different text", duration_estimate_sec: 30, sections: [] },
        hook_3s: { spoken: "First sentence here", on_screen: "", visual_hint: "" },
        banners: { top: "", bottom: "", watermark: "STUDIO" },
      },
    });

    expect(warnings).toContain("Hook chưa được viết mới");
  });

  it("warns when watermark is empty", () => {
    const warnings = service.computePolicyWarnings({
      sourceSnapshot: { caption: "some caption" },
      packageJson: {
        script: { narration: "unique narration", duration_estimate_sec: 30, sections: [] },
        hook_3s: { spoken: "fresh hook", on_screen: "", visual_hint: "" },
        banners: { top: "", bottom: "", watermark: "" },
      },
    });

    expect(warnings).toContain("Thiếu branding");
  });
});

describe("RemixService.regenerate", () => {
  let prisma: {
    viralRemake: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let jobsService: { enqueue: ReturnType<typeof vi.fn> };
  let service: RemixService;
  let previousRemixEnabled: string | undefined;

  beforeEach(() => {
    previousRemixEnabled = process.env.REMIX_ENABLED;
    process.env.REMIX_ENABLED = "true";

    prisma = {
      viralRemake: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    jobsService = {
      enqueue: vi.fn().mockResolvedValue({ jobId: "job_regen", status: "queued" }),
    };
    service = new RemixService(
      prisma as unknown as PrismaService,
      jobsService as unknown as JobsService,
    );
  });

  afterEach(() => {
    if (previousRemixEnabled === undefined) {
      delete process.env.REMIX_ENABLED;
    } else {
      process.env.REMIX_ENABLED = previousRemixEnabled;
    }
  });

  const mockRemake = (overrides: Record<string, unknown> = {}) => ({
    id: "remake_1",
    scriptMode: "caption",
    sourceTranscript: null,
    mediaAudioKey: null,
    ...overrides,
  });

  it("enqueues remix_generate for caption mode", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue(mockRemake());

    const result = await service.regenerate("remake_1");

    expect(result).toEqual({ remakeId: "remake_1", jobId: "job_regen" });
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remix_generate",
        payload: { remakeId: "remake_1" },
      }),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { status: "running" },
    });
  });

  it("enqueues remix_translate when full mode has transcript but no translation", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue(
      mockRemake({
        scriptMode: "full",
        sourceTranscript: { fullText: "hello", segments: [] },
        sourceTranscriptTranslated: null,
      }),
    );

    await service.regenerate("remake_1");

    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "remix_translate" }),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { status: "running", pipelinePhase: "translating" },
    });
  });

  it("enqueues remix_generate with generating phase when full mode has translated transcript", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue(
      mockRemake({
        scriptMode: "full",
        sourceTranscript: { fullText: "hello", segments: [] },
        sourceTranscriptTranslated: { fullText: "xin chao", segments: [] },
      }),
    );

    await service.regenerate("remake_1");

    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "remix_generate" }),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { status: "running", pipelinePhase: "generating" },
    });
  });

  it("enqueues remix_stt when full mode has audio but no transcript", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue(
      mockRemake({
        scriptMode: "full",
        mediaAudioKey: "remix/remake_1/source-audio.wav",
      }),
    );

    await service.regenerate("remake_1");

    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "remix_stt" }),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { status: "running", pipelinePhase: "transcribing" },
    });
  });

  it("enqueues remix_download_media when full mode lacks transcript and audio", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue(
      mockRemake({ scriptMode: "full" }),
    );

    await service.regenerate("remake_1");

    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "remix_download_media" }),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { status: "running", pipelinePhase: "downloading_media" },
    });
  });

  it("throws ServiceUnavailableException when remix is disabled", async () => {
    process.env.REMIX_ENABLED = "false";
    prisma.viralRemake.findUnique.mockResolvedValue(mockRemake());

    await expect(service.regenerate("remake_1")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(jobsService.enqueue).not.toHaveBeenCalled();
  });
});

describe("RemixService.retranscribe", () => {
  let prisma: {
    viralRemake: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let jobsService: { enqueue: ReturnType<typeof vi.fn> };
  let service: RemixService;
  let previousRemixEnabled: string | undefined;

  beforeEach(() => {
    previousRemixEnabled = process.env.REMIX_ENABLED;
    process.env.REMIX_ENABLED = "true";

    prisma = {
      viralRemake: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    jobsService = {
      enqueue: vi.fn().mockResolvedValue({ jobId: "job_stt", status: "queued" }),
    };
    service = new RemixService(
      prisma as unknown as PrismaService,
      jobsService as unknown as JobsService,
    );
  });

  afterEach(() => {
    if (previousRemixEnabled === undefined) {
      delete process.env.REMIX_ENABLED;
    } else {
      process.env.REMIX_ENABLED = previousRemixEnabled;
    }
  });

  it("enqueues remix_stt when mediaAudioKey exists", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      mediaAudioKey: "remix/remake_1/source-audio.wav",
    });

    const result = await service.retranscribe("remake_1");

    expect(result).toEqual({ remakeId: "remake_1", jobId: "job_stt" });
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remix_stt",
        payload: { remakeId: "remake_1" },
      }),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        status: "running",
        pipelinePhase: "transcribing",
        sourceTranscriptTranslated: null,
      },
    });
  });

  it("throws BadRequestException when mediaAudioKey is missing", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      mediaAudioKey: null,
    });

    await expect(service.retranscribe("remake_1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(jobsService.enqueue).not.toHaveBeenCalled();
  });
});

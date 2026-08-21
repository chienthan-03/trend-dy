import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobsService } from "../jobs/jobs.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RemixStorageService } from "./remix-storage.service";
import { invalidateDubAndRenderData, RemixService } from "./remix.service";

const { classifyTranslatedSegmentsMock } = vi.hoisted(() => ({
  classifyTranslatedSegmentsMock: vi.fn(),
}));

vi.mock("./tts/classify-segments", () => ({
  classifyTranslatedSegments: classifyTranslatedSegmentsMock,
}));

const INVALIDATE_DUB_AND_RENDER_DATA = {
  mediaDubAudioKey: null,
  renderOutputKey: null,
  renderPhase: "idle",
  dubSource: null,
};

const createRemixStorageMock = () => ({
  putDub: vi.fn().mockResolvedValue("remix/remake_1/dub-audio.mp3"),
});

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
  let remixStorage: ReturnType<typeof createRemixStorageMock>;
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
      createRemixStorageMock() as unknown as RemixStorageService,
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
      createRemixStorageMock() as unknown as RemixStorageService,
    );
  });

  it("returns no warnings for packaging-only packages", () => {
    const warnings = service.computePolicyWarnings({
      sourceSnapshot: { caption: "some caption" },
      packageJson: {
        locale: "vi",
        banners: { top: "", bottom: "", watermark: "" },
        packaging: { titles: ["Title"], description: "Desc", hashtags: [] },
        subtitles: { format: "srt", cues: [] },
        transform_notes: {
          source_language: "zh",
          rewrite_strategy: "packaging_only",
          risks: [],
        },
      },
    });

    expect(warnings).toEqual([]);
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
  let remixStorage: ReturnType<typeof createRemixStorageMock>;
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
      createRemixStorageMock() as unknown as RemixStorageService,
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
    externalVideoId: "7123456789012345678",
    sourceUrl: "https://www.douyin.com/video/7123456789012345678",
    ...overrides,
  });

  it("enqueues remix_resolve when external video id is still pending", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue(
      mockRemake({
        externalVideoId: "pending",
        sourceUrl: "https://v.douyin.com/abc123/",
      }),
    );

    const result = await service.regenerate("remake_1");

    expect(result).toEqual({ remakeId: "remake_1", jobId: "job_regen" });
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remix_resolve",
        payload: {
          remakeId: "remake_1",
          shareUrl: "https://v.douyin.com/abc123/",
        },
      }),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { status: "running", pipelinePhase: "resolving" },
    });
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
  let remixStorage: ReturnType<typeof createRemixStorageMock>;
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
      createRemixStorageMock() as unknown as RemixStorageService,
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
        ...INVALIDATE_DUB_AND_RENDER_DATA,
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

describe("RemixService.redownloadMedia", () => {
  let prisma: {
    viralRemake: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let jobsService: { enqueue: ReturnType<typeof vi.fn> };
  let service: RemixService;
  let previousRemixEnabled: string | undefined;
  let previousAllowDownload: string | undefined;
  let previousScriptMode: string | undefined;
  let previousAdapter: string | undefined;
  let previousVideoProvider: string | undefined;

  beforeEach(() => {
    previousRemixEnabled = process.env.REMIX_ENABLED;
    previousAllowDownload = process.env.REMIX_ALLOW_MEDIA_DOWNLOAD;
    previousScriptMode = process.env.REMIX_SCRIPT_MODE;
    previousAdapter = process.env.DOUYIN_ADAPTER;
    previousVideoProvider = process.env.DOUYIN_VIDEO_PROVIDER;
    process.env.REMIX_ENABLED = "true";
    process.env.REMIX_ALLOW_MEDIA_DOWNLOAD = "true";
    process.env.REMIX_SCRIPT_MODE = "full";
    process.env.DOUYIN_ADAPTER = "live";
    delete process.env.DOUYIN_VIDEO_PROVIDER;

    prisma = {
      viralRemake: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    jobsService = {
      enqueue: vi.fn().mockResolvedValue({ jobId: "job_dl", status: "queued" }),
    };
    service = new RemixService(
      prisma as unknown as PrismaService,
      jobsService as unknown as JobsService,
      createRemixStorageMock() as unknown as RemixStorageService,
    );
  });

  afterEach(() => {
    if (previousRemixEnabled === undefined) {
      delete process.env.REMIX_ENABLED;
    } else {
      process.env.REMIX_ENABLED = previousRemixEnabled;
    }
    if (previousAllowDownload === undefined) {
      delete process.env.REMIX_ALLOW_MEDIA_DOWNLOAD;
    } else {
      process.env.REMIX_ALLOW_MEDIA_DOWNLOAD = previousAllowDownload;
    }
    if (previousScriptMode === undefined) {
      delete process.env.REMIX_SCRIPT_MODE;
    } else {
      process.env.REMIX_SCRIPT_MODE = previousScriptMode;
    }
    if (previousAdapter === undefined) {
      delete process.env.DOUYIN_ADAPTER;
    } else {
      process.env.DOUYIN_ADAPTER = previousAdapter;
    }
    if (previousVideoProvider === undefined) {
      delete process.env.DOUYIN_VIDEO_PROVIDER;
    } else {
      process.env.DOUYIN_VIDEO_PROVIDER = previousVideoProvider;
    }
  });

  it("enqueues download from sourceUrl when yt-dlp provider has no playUrl", async () => {
    process.env.DOUYIN_VIDEO_PROVIDER = "ytdlp";
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceUrl: "https://v.douyin.com/abc/",
      sourceSnapshot: {},
    });

    const result = await service.redownloadMedia("remake_1");

    expect(result).toEqual({ remakeId: "remake_1", jobId: "job_dl" });
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remix_download_media",
        payload: { remakeId: "remake_1" },
      }),
    );
  });

  it("throws when Just One path has no playUrl", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceUrl: "https://v.douyin.com/abc/",
      sourceSnapshot: {},
    });

    await expect(service.redownloadMedia("remake_1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(jobsService.enqueue).not.toHaveBeenCalled();
  });
});

describe("RemixService.retranslate", () => {
  let prisma: {
    viralRemake: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let jobsService: { enqueue: ReturnType<typeof vi.fn> };
  let service: RemixService;
  let previousRemixEnabled: string | undefined;
  let previousTranslateEnabled: string | undefined;

  beforeEach(() => {
    previousRemixEnabled = process.env.REMIX_ENABLED;
    process.env.REMIX_ENABLED = "true";
    previousTranslateEnabled = process.env.REMIX_TRANSLATE_ENABLED;
    delete process.env.REMIX_TRANSLATE_ENABLED;

    prisma = {
      viralRemake: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    jobsService = {
      enqueue: vi.fn().mockResolvedValue({ jobId: "job_translate", status: "queued" }),
    };
    service = new RemixService(
      prisma as unknown as PrismaService,
      jobsService as unknown as JobsService,
      createRemixStorageMock() as unknown as RemixStorageService,
    );
  });

  afterEach(() => {
    if (previousRemixEnabled === undefined) {
      delete process.env.REMIX_ENABLED;
    } else {
      process.env.REMIX_ENABLED = previousRemixEnabled;
    }
    if (previousTranslateEnabled === undefined) {
      delete process.env.REMIX_TRANSLATE_ENABLED;
    } else {
      process.env.REMIX_TRANSLATE_ENABLED = previousTranslateEnabled;
    }
  });

  it("wipes the translated transcript and invalidates dub/render data", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscript: { fullText: "hello", segments: [] },
    });

    const result = await service.retranslate("remake_1");

    expect(result).toEqual({ remakeId: "remake_1", jobId: "job_translate" });
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remix_translate",
        payload: { remakeId: "remake_1", chainGenerate: false },
      }),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        status: "running",
        pipelinePhase: "translating",
        sourceTranscriptTranslated: null,
        ...INVALIDATE_DUB_AND_RENDER_DATA,
      },
    });
  });

  it("throws BadRequestException when there is no source transcript", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscript: null,
    });

    await expect(service.retranslate("remake_1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(jobsService.enqueue).not.toHaveBeenCalled();
  });
});

describe("RemixService.classifySegments", () => {
  let prisma: {
    viralRemake: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let service: RemixService;

  const sourceTranscript = {
    version: 1,
    language: "zh",
    durationSec: 2,
    segments: [{ text: "你好", startSec: 0, endSec: 1 }],
    fullText: "你好",
    provider: "fake",
    model: "fake",
  };

  const translatedTranscript = {
    version: 1,
    language: "vi",
    durationSec: 2,
    segments: [{ text: "Xin chào", startSec: 0, endSec: 1 }],
    fullText: "Xin chào",
    provider: "fake",
    model: "fake",
  };

  beforeEach(() => {
    classifyTranslatedSegmentsMock.mockReset();
    prisma = {
      viralRemake: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    service = new RemixService(
      prisma as unknown as PrismaService,
      { enqueue: vi.fn() } as unknown as JobsService,
      createRemixStorageMock() as unknown as RemixStorageService,
    );
  });

  it("throws BadRequestException when source or translated transcript is missing", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscript: null,
      sourceTranscriptTranslated: translatedTranscript,
    });

    await expect(service.classifySegments("remake_1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(classifyTranslatedSegmentsMock).not.toHaveBeenCalled();
  });

  it("defaults to reclassify mode and invalidates dub/render when a role changed", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscript,
      sourceTranscriptTranslated: translatedTranscript,
      mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
      renderOutputKey: "remix/remake_1/render.mp4",
    });
    classifyTranslatedSegmentsMock.mockResolvedValue({
      ok: true,
      segments: [{ text: "Xin chào", startSec: 0, endSec: 1, role: "source", roleSource: "auto" }],
    });

    await service.classifySegments("remake_1");

    expect(classifyTranslatedSegmentsMock).toHaveBeenCalledWith({
      source: sourceTranscript,
      translated: translatedTranscript,
      mode: "reclassify",
    });
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        sourceTranscriptTranslated: {
          ...translatedTranscript,
          segments: [{ text: "Xin chào", startSec: 0, endSec: 1, role: "source", roleSource: "auto" }],
        },
        classifyWarning: null,
        ...INVALIDATE_DUB_AND_RENDER_DATA,
      },
    });
  });

  it("leaves dub/render untouched when no role actually changed", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscript,
      sourceTranscriptTranslated: translatedTranscript,
      mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
      renderOutputKey: "remix/remake_1/render.mp4",
    });
    classifyTranslatedSegmentsMock.mockResolvedValue({
      ok: true,
      segments: [
        { text: "Xin chào", startSec: 0, endSec: 1, role: "narration", roleSource: "auto" },
      ],
    });

    await service.classifySegments("remake_1", { mode: "lazy" });

    expect(classifyTranslatedSegmentsMock).toHaveBeenCalledWith({
      source: sourceTranscript,
      translated: translatedTranscript,
      mode: "lazy",
    });
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        sourceTranscriptTranslated: {
          ...translatedTranscript,
          segments: [
            { text: "Xin chào", startSec: 0, endSec: 1, role: "narration", roleSource: "auto" },
          ],
        },
        classifyWarning: null,
      },
    });
  });

  it("leaves roles and dub/render untouched but sets classifyWarning on parse failure", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscript,
      sourceTranscriptTranslated: translatedTranscript,
      mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
      renderOutputKey: "remix/remake_1/render.mp4",
    });
    classifyTranslatedSegmentsMock.mockResolvedValue({
      ok: false,
      warning: "Không thể phân loại segment",
    });

    await service.classifySegments("remake_1");

    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { classifyWarning: "Không thể phân loại segment" },
    });
  });
});

describe("RemixService.updateSegmentRoles", () => {
  let prisma: {
    viralRemake: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let service: RemixService;

  const translatedTranscript = {
    version: 1,
    language: "vi",
    durationSec: 2,
    segments: [
      { text: "Xin chào", startSec: 0, endSec: 1 },
      { text: "Tạm biệt", startSec: 1, endSec: 2 },
    ],
    fullText: "Xin chào Tạm biệt",
    provider: "fake",
    model: "fake",
  };

  beforeEach(() => {
    prisma = {
      viralRemake: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    service = new RemixService(
      prisma as unknown as PrismaService,
      { enqueue: vi.fn() } as unknown as JobsService,
      createRemixStorageMock() as unknown as RemixStorageService,
    );
  });

  it("sets roleSource=manual and always invalidates dub/render data", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscriptTranslated: translatedTranscript,
    });

    await service.updateSegmentRoles("remake_1", [{ index: 0, role: "source" }]);

    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        sourceTranscriptTranslated: {
          ...translatedTranscript,
          segments: [
            { text: "Xin chào", startSec: 0, endSec: 1, role: "source", roleSource: "manual" },
            { text: "Tạm biệt", startSec: 1, endSec: 2 },
          ],
        },
        ...INVALIDATE_DUB_AND_RENDER_DATA,
      },
    });
  });

  it("throws BadRequestException when there is no translated transcript", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscriptTranslated: null,
    });

    await expect(
      service.updateSegmentRoles("remake_1", [{ index: 0, role: "source" }]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.viralRemake.update).not.toHaveBeenCalled();
  });

  it("throws BadRequestException when an index is out of range", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscriptTranslated: translatedTranscript,
    });

    await expect(
      service.updateSegmentRoles("remake_1", [{ index: 5, role: "source" }]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.viralRemake.update).not.toHaveBeenCalled();
  });
});

describe("RemixService.enqueueTts", () => {
  let prisma: {
    viralRemake: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let jobsService: { enqueue: ReturnType<typeof vi.fn> };
  let remixStorage: ReturnType<typeof createRemixStorageMock>;
  let service: RemixService;
  let previousTtsMode: string | undefined;

  beforeEach(() => {
    previousTtsMode = process.env.REMIX_TTS_MODE;
    process.env.REMIX_TTS_MODE = "live";

    prisma = {
      viralRemake: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    jobsService = {
      enqueue: vi.fn().mockResolvedValue({ jobId: "job_tts", status: "queued" }),
    };
    service = new RemixService(
      prisma as unknown as PrismaService,
      jobsService as unknown as JobsService,
      createRemixStorageMock() as unknown as RemixStorageService,
    );
  });

  afterEach(() => {
    if (previousTtsMode === undefined) {
      delete process.env.REMIX_TTS_MODE;
    } else {
      process.env.REMIX_TTS_MODE = previousTtsMode;
    }
  });

  it("enqueues remix_tts with the resolved engine and resets render fields", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscriptTranslated: { fullText: "xin chao", segments: [] },
      ttsEngine: null,
      ttsVoiceId: null,
    });

    const result = await service.enqueueTts("remake_1");

    expect(result).toEqual({ remakeId: "remake_1", jobId: "job_tts" });
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remix_tts",
        payload: { remakeId: "remake_1", engine: "live" },
      }),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        ttsEngine: "live",
        ttsVoiceId: null,
        renderPhase: "tts",
        renderError: null,
        ttsFitFailedIndexes: [],
      },
    });
  });

  it("forwards an explicit voiceId and engine override in the job payload", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscriptTranslated: { fullText: "xin chao", segments: [] },
      ttsEngine: "live",
      ttsVoiceId: null,
    });

    await service.enqueueTts("remake_1", { voiceId: "nova", engine: "piper" });

    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remix_tts",
        payload: { remakeId: "remake_1", engine: "piper", voiceId: "nova" },
      }),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        ttsEngine: "piper",
        ttsVoiceId: "nova",
        renderPhase: "tts",
        renderError: null,
        ttsFitFailedIndexes: [],
      },
    });
  });

  it("keeps the previously persisted engine (or null) when resolution falls back to the fake env default", async () => {
    process.env.REMIX_TTS_MODE = "fake";
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscriptTranslated: { fullText: "xin chao", segments: [] },
      ttsEngine: null,
      ttsVoiceId: null,
    });

    await service.enqueueTts("remake_1");

    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remix_tts",
        payload: { remakeId: "remake_1", engine: "fake" },
      }),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        ttsEngine: null,
        ttsVoiceId: null,
        renderPhase: "tts",
        renderError: null,
        ttsFitFailedIndexes: [],
      },
    });
  });

  it("throws BadRequestException when there is no translated transcript", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscriptTranslated: null,
    });

    await expect(service.enqueueTts("remake_1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(jobsService.enqueue).not.toHaveBeenCalled();
  });
});

describe("RemixService.uploadDubAudio", () => {
  let prisma: {
    viralRemake: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let remixStorage: ReturnType<typeof createRemixStorageMock>;
  let service: RemixService;

  beforeEach(() => {
    prisma = {
      viralRemake: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    remixStorage = createRemixStorageMock();
    service = new RemixService(
      prisma as unknown as PrismaService,
      { enqueue: vi.fn() } as unknown as JobsService,
      remixStorage as unknown as RemixStorageService,
    );
  });

  it("stores uploaded dub audio and sets dubSource=upload with renderPhase=tts_ready", async () => {
    const mp3Buffer = Buffer.from("fake-mp3-audio");

    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      videoDurationSec: 60,
    });

    const result = await service.uploadDubAudio("remake_1", {
      buffer: mp3Buffer,
      mimetype: "audio/mpeg",
      size: mp3Buffer.length,
    });

    expect(remixStorage.putDub).toHaveBeenCalledWith(
      "remake_1",
      mp3Buffer,
      "audio/mpeg",
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
        dubSource: "upload",
        renderPhase: "tts_ready",
        ttsFitFailedIndexes: [],
        renderOutputKey: null,
        renderError: null,
      },
    });
    expect(result).toEqual({
      remakeId: "remake_1",
      mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
      dubSource: "upload",
      renderPhase: "tts_ready",
      durationMismatch: false,
    });
  });

  it("throws BadRequestException for unsupported mime types", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      videoDurationSec: 60,
    });

    await expect(
      service.uploadDubAudio("remake_1", {
        buffer: Buffer.from("data"),
        mimetype: "video/mp4",
        size: 4,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(remixStorage.putDub).not.toHaveBeenCalled();
  });
});

describe("RemixService.enqueueRender", () => {
  let prisma: {
    viralRemake: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let jobsService: { enqueue: ReturnType<typeof vi.fn> };
  let service: RemixService;

  beforeEach(() => {
    prisma = {
      viralRemake: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    jobsService = {
      enqueue: vi.fn().mockResolvedValue({ jobId: "job_render", status: "queued" }),
    };
    service = new RemixService(
      prisma as unknown as PrismaService,
      jobsService as unknown as JobsService,
      createRemixStorageMock() as unknown as RemixStorageService,
    );
  });

  it("enqueues remix_render and sets renderPhase=rendering when media is ready", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      mediaVideoKey: "remix/remake_1/source-video.mp4",
      mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
      renderMode: "audio_only",
    });

    const result = await service.enqueueRender("remake_1");

    expect(result).toEqual({ remakeId: "remake_1", jobId: "job_render" });
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { renderPhase: "rendering", renderError: null },
    });
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remix_render",
        payload: { remakeId: "remake_1" },
      }),
    );
  });

  it("throws BadRequestException when mediaVideoKey is missing", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      mediaVideoKey: null,
      mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
    });

    await expect(service.enqueueRender("remake_1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(jobsService.enqueue).not.toHaveBeenCalled();
  });

  it("throws BadRequestException when mediaDubAudioKey is missing", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      mediaVideoKey: "remix/remake_1/source-video.mp4",
      mediaDubAudioKey: null,
    });

    await expect(service.enqueueRender("remake_1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(jobsService.enqueue).not.toHaveBeenCalled();
  });

  it("throws BadRequestException when renderMode=banner_audio without bannerJson", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      mediaVideoKey: "remix/remake_1/source-video.mp4",
      mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
      renderMode: "banner_audio",
      bannerJson: null,
    });

    await expect(service.enqueueRender("remake_1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(jobsService.enqueue).not.toHaveBeenCalled();
  });

  it("enqueues remix_render when renderMode=banner_audio with bannerJson present", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      mediaVideoKey: "remix/remake_1/source-video.mp4",
      mediaDubAudioKey: "remix/remake_1/dub-audio.mp3",
      renderMode: "banner_audio",
      bannerJson: { header: "", bottom: "" },
    });

    const result = await service.enqueueRender("remake_1");

    expect(result).toEqual({ remakeId: "remake_1", jobId: "job_render" });
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "remix_render" }),
    );
  });
});

describe("RemixService.generateBanners", () => {
  let prisma: {
    viralRemake: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let service: RemixService;
  let previousLlmMode: string | undefined;

  beforeEach(() => {
    previousLlmMode = process.env.LLM_MODE;
    process.env.LLM_MODE = "fake";

    prisma = {
      viralRemake: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    service = new RemixService(
      prisma as unknown as PrismaService,
      { enqueue: vi.fn() } as unknown as JobsService,
      createRemixStorageMock() as unknown as RemixStorageService,
    );
  });

  afterEach(() => {
    if (previousLlmMode === undefined) {
      delete process.env.LLM_MODE;
    } else {
      process.env.LLM_MODE = previousLlmMode;
    }
  });

  it("generates and persists bannerJson from the translated transcript", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      genre: "cultivation",
      sourceSnapshot: { title: "Tiêu đề gốc" },
      sourceTranscriptTranslated: {
        fullText: "Xin chào các bạn, hôm nay chúng ta sẽ...",
        segments: [],
      },
    });

    const result = await service.generateBanners("remake_1");

    expect(result.header).toBeTruthy();
    expect(result.bottom).toBeTruthy();
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { bannerJson: result },
    });
  });

  it("throws BadRequestException when there is no translated transcript", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscriptTranslated: null,
    });

    await expect(service.generateBanners("remake_1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("throws BadRequestException when the translated transcript has no text", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscriptTranslated: { fullText: "", segments: [] },
    });

    await expect(service.generateBanners("remake_1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("RemixService.updateRemake", () => {
  let prisma: {
    viralRemake: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let service: RemixService;

  beforeEach(() => {
    prisma = {
      viralRemake: {
        findUnique: vi.fn().mockResolvedValue({ id: "remake_1" }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    service = new RemixService(
      prisma as unknown as PrismaService,
      { enqueue: vi.fn() } as unknown as JobsService,
      createRemixStorageMock() as unknown as RemixStorageService,
    );
  });

  it("persists renderMode, ttsVoiceId, and bannerJson when provided", async () => {
    await service.updateRemake("remake_1", {
      renderMode: "banner_audio",
      ttsVoiceId: "nova",
      bannerJson: { header: "Header", bottom: "Bottom" },
    });

    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        renderMode: "banner_audio",
        ttsVoiceId: "nova",
        bannerJson: { header: "Header", bottom: "Bottom" },
      },
    });
  });

  it("persists ttsSpeed and ttsMaxSpeed when provided", async () => {
    await service.updateRemake("remake_1", {
      ttsSpeed: 1.15,
      ttsMaxSpeed: 1.5,
    });

    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        ttsSpeed: 1.15,
        ttsMaxSpeed: 1.5,
      },
    });
  });

  it("allows clearing ttsMaxSpeed to fall back to server env", async () => {
    await service.updateRemake("remake_1", { ttsMaxSpeed: null });

    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { ttsMaxSpeed: null },
    });
  });

  it("leaves fields untouched when not provided", async () => {
    await service.updateRemake("remake_1", { editorNotes: "note" });

    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { editorNotes: "note" },
    });
  });

  it("persists bgmTrackId and invalidates render only when track changes", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      mediaDubAudioKey: "remix/remake_1/dub.mp3",
      renderOutputKey: "remix/remake_1/render.mp4",
      renderPhase: "render_ready",
      bgmTrackId: null,
      bgmVolume: null,
    });

    await service.updateRemake("remake_1", { bgmTrackId: "else-paris" });

    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        bgmTrackId: "else-paris",
        renderOutputKey: null,
        renderPhase: "tts_ready",
        renderError: null,
      },
    });
  });

  it("does not invalidate render when bgmTrackId unchanged", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      mediaDubAudioKey: "remix/remake_1/dub.mp3",
      renderOutputKey: "remix/remake_1/render.mp4",
      bgmTrackId: "else-paris",
      bgmVolume: 0.3,
    });

    await service.updateRemake("remake_1", { bgmTrackId: "else-paris" });

    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { bgmTrackId: "else-paris" },
    });
  });
});

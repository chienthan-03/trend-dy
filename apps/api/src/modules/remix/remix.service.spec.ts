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
import { RemixService } from "./remix.service";

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

  beforeEach(() => {
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

  it("enqueues remix_tts and resets render fields when a translated transcript exists", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscriptTranslated: { fullText: "xin chao", segments: [] },
    });

    const result = await service.enqueueTts("remake_1");

    expect(result).toEqual({ remakeId: "remake_1", jobId: "job_tts" });
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remix_tts",
        payload: { remakeId: "remake_1" },
      }),
    );
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        renderPhase: "tts",
        renderError: null,
        ttsFitFailedIndexes: [],
      },
    });
  });

  it("forwards an explicit voiceId in the job payload", async () => {
    prisma.viralRemake.findUnique.mockResolvedValue({
      id: "remake_1",
      sourceTranscriptTranslated: { fullText: "xin chao", segments: [] },
    });

    await service.enqueueTts("remake_1", { voiceId: "nova" });

    expect(jobsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remix_tts",
        payload: { remakeId: "remake_1", voiceId: "nova" },
      }),
    );
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

  it("leaves fields untouched when not provided", async () => {
    await service.updateRemake("remake_1", { editorNotes: "note" });

    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: { editorNotes: "note" },
    });
  });
});

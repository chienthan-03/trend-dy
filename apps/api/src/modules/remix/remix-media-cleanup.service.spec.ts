import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemixMediaCleanupService } from "./remix-media-cleanup.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RemixStorageService } from "./remix-storage.service";

describe("RemixMediaCleanupService", () => {
  let prisma: {
    viralRemake: {
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let storage: {
    deleteAudio: ReturnType<typeof vi.fn>;
    deleteVideo: ReturnType<typeof vi.fn>;
    deleteDub: ReturnType<typeof vi.fn>;
    deleteRender: ReturnType<typeof vi.fn>;
  };
  let service: RemixMediaCleanupService;

  beforeEach(() => {
    prisma = {
      viralRemake: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
    };
    storage = {
      deleteAudio: vi.fn(),
      deleteVideo: vi.fn(),
      deleteDub: vi.fn(),
      deleteRender: vi.fn(),
    };
    service = new RemixMediaCleanupService(
      prisma as unknown as PrismaService,
      storage as unknown as RemixStorageService,
    );
  });

  it("cleanupExpiredMedia deletes storage objects and updates DB", async () => {
    const expiredRemakes = [
      { id: "remake_1", mediaAudioKey: "key_audio_1" },
      { id: "remake_2", mediaAudioKey: "key_audio_2" },
    ];
    prisma.viralRemake.findMany.mockResolvedValue(expiredRemakes);
    prisma.viralRemake.update.mockResolvedValue({});
    storage.deleteAudio.mockResolvedValue(undefined);

    const result = await service.cleanupExpiredMedia();

    expect(result.deletedCount).toBe(2);
    expect(storage.deleteAudio).toHaveBeenCalledWith("key_audio_1");
    expect(storage.deleteAudio).toHaveBeenCalledWith("key_audio_2");
    expect(prisma.viralRemake.update).toHaveBeenCalledTimes(2);
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        mediaAudioKey: null,
        mediaVideoKey: null,
        mediaDubAudioKey: null,
        renderOutputKey: null,
      },
    });
  });

  it("cleanupExpiredMedia deletes video, dub, and render keys when present", async () => {
    prisma.viralRemake.findMany.mockResolvedValue([
      {
        id: "remake_1",
        mediaAudioKey: "key_audio",
        mediaVideoKey: "key_video",
        mediaDubAudioKey: "key_dub",
        renderOutputKey: "key_render",
      },
    ]);
    prisma.viralRemake.update.mockResolvedValue({});
    storage.deleteAudio.mockResolvedValue(undefined);
    storage.deleteVideo.mockResolvedValue(undefined);
    storage.deleteDub.mockResolvedValue(undefined);
    storage.deleteRender.mockResolvedValue(undefined);

    const result = await service.cleanupExpiredMedia();

    expect(result.deletedCount).toBe(1);
    expect(storage.deleteAudio).toHaveBeenCalledWith("key_audio");
    expect(storage.deleteVideo).toHaveBeenCalledWith("key_video");
    expect(storage.deleteDub).toHaveBeenCalledWith("key_dub");
    expect(storage.deleteRender).toHaveBeenCalledWith("key_render");
    expect(prisma.viralRemake.update).toHaveBeenCalledWith({
      where: { id: "remake_1" },
      data: {
        mediaAudioKey: null,
        mediaVideoKey: null,
        mediaDubAudioKey: null,
        renderOutputKey: null,
      },
    });
  });

  it("returns 0 when no expired remakes found", async () => {
    prisma.viralRemake.findMany.mockResolvedValue([]);

    const result = await service.cleanupExpiredMedia();

    expect(result.deletedCount).toBe(0);
    expect(storage.deleteAudio).not.toHaveBeenCalled();
    expect(storage.deleteVideo).not.toHaveBeenCalled();
    expect(storage.deleteDub).not.toHaveBeenCalled();
    expect(storage.deleteRender).not.toHaveBeenCalled();
    expect(prisma.viralRemake.update).not.toHaveBeenCalled();
  });

  it("handles storage deletion errors gracefully", async () => {
    prisma.viralRemake.findMany.mockResolvedValue([
      { id: "remake_1", mediaAudioKey: "key_1" },
    ]);
    storage.deleteAudio.mockRejectedValue(new Error("S3 failed"));

    const result = await service.cleanupExpiredMedia();

    expect(result.deletedCount).toBe(0);
    expect(prisma.viralRemake.update).not.toHaveBeenCalled();
  });
});

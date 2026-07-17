import { BadRequestException, ForbiddenException, NotFoundException, StreamableFile } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemixExportService } from "./remix-export.service";
import { RemixPolicyGuard } from "./remix-policy.guard";
import type { RemixStorageService } from "./remix-storage.service";
import { RemixController } from "./remix.controller";
import type { RemixService } from "./remix.service";

describe("RemixController render endpoints", () => {
  let remixService: {
    getRemake: ReturnType<typeof vi.fn>;
    enqueueRender: ReturnType<typeof vi.fn>;
    generateBanners: ReturnType<typeof vi.fn>;
  };
  let remixStorage: { getRender: ReturnType<typeof vi.fn> };
  let remixPolicyGuard: RemixPolicyGuard;
  let controller: RemixController;

  beforeEach(() => {
    remixService = {
      getRemake: vi.fn(),
      enqueueRender: vi.fn().mockResolvedValue({ remakeId: "remake_1", jobId: "job_1" }),
      generateBanners: vi
        .fn()
        .mockResolvedValue({ header: "Header", bottom: "Bottom" }),
    };
    remixStorage = {
      getRender: vi.fn().mockResolvedValue(Buffer.from("rendered-mp4")),
    };
    remixPolicyGuard = new RemixPolicyGuard();

    controller = new RemixController(
      remixService as unknown as RemixService,
      {} as RemixExportService,
      remixPolicyGuard,
      remixStorage as unknown as RemixStorageService,
    );
  });

  it("POST :id/render delegates to enqueueRender", async () => {
    const result = await controller.enqueueRender("remake_1");

    expect(remixService.enqueueRender).toHaveBeenCalledWith("remake_1");
    expect(result).toEqual({ remakeId: "remake_1", jobId: "job_1" });
  });

  it("POST :id/banners/generate delegates to generateBanners", async () => {
    const result = await controller.generateBanners("remake_1");

    expect(remixService.generateBanners).toHaveBeenCalledWith("remake_1");
    expect(result).toEqual({ header: "Header", bottom: "Bottom" });
  });

  it("GET :id/render streams the render when preview is ready", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      renderPhase: "render_ready",
      renderOutputKey: "remix/remake_1/render.mp4",
      usagePolicy: "remix_draft",
    });

    const result = await controller.streamRender("remake_1");

    expect(result).toBeInstanceOf(StreamableFile);
    expect(remixStorage.getRender).toHaveBeenCalledWith(
      "remix/remake_1/render.mp4",
    );
  });

  it("GET :id/render rejects preview when render is not ready", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      renderPhase: "rendering",
      renderOutputKey: null,
      usagePolicy: "remix_draft",
    });

    await expect(controller.streamRender("remake_1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(remixStorage.getRender).not.toHaveBeenCalled();
  });

  it("GET :id/render?download=1 requires canExport and forbids otherwise", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      renderPhase: "render_ready",
      renderOutputKey: "remix/remake_1/render.mp4",
      usagePolicy: "remix_draft",
    });

    await expect(
      controller.streamRender("remake_1", "1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(remixStorage.getRender).not.toHaveBeenCalled();
  });

  it("GET :id/render?download=1 streams with attachment disposition when approved", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      renderPhase: "render_ready",
      renderOutputKey: "remix/remake_1/render.mp4",
      usagePolicy: "approved_for_export",
    });

    const result = await controller.streamRender("remake_1", "1");

    expect(result).toBeInstanceOf(StreamableFile);
    expect(remixStorage.getRender).toHaveBeenCalledWith(
      "remix/remake_1/render.mp4",
    );
  });

  it("GET :id/render throws NotFoundException when renderOutputKey is missing", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      renderPhase: "render_ready",
      renderOutputKey: null,
      usagePolicy: "approved_for_export",
    });

    await expect(
      controller.streamRender("remake_1", "1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { RemixBgmService } from "./remix-bgm.service";
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
  let remixStorage: {
    headRender: ReturnType<typeof vi.fn>;
    getRenderStream: ReturnType<typeof vi.fn>;
  };
  let remixPolicyGuard: RemixPolicyGuard;
  let request: Pick<Request, "headers">;
  let response: Pick<Response, "setHeader" | "status">;
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
      headRender: vi.fn().mockResolvedValue({
        contentLength: Buffer.byteLength("rendered-mp4"),
        contentType: "video/mp4",
      }),
      getRenderStream: vi.fn().mockResolvedValue({
        body: { pipe: vi.fn() },
        contentLength: Buffer.byteLength("rendered-mp4"),
        contentType: "video/mp4",
      }),
    };
    remixPolicyGuard = new RemixPolicyGuard();
    request = { headers: {} };
    response = {
      setHeader: vi.fn(),
      status: vi.fn(),
    };

    controller = new RemixController(
      remixService as unknown as RemixService,
      {} as RemixBgmService,
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

    await controller.streamRender(
      "remake_1",
      undefined,
      request as Request,
      response as Response,
    );

    expect(remixStorage.headRender).toHaveBeenCalledWith(
      "remix/remake_1/render.mp4",
    );
    expect(remixStorage.getRenderStream).toHaveBeenCalledWith(
      "remix/remake_1/render.mp4",
      undefined,
    );
    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", "video/mp4");
  });

  it("GET :id/render rejects preview when render is not ready", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      renderPhase: "rendering",
      renderOutputKey: null,
      usagePolicy: "remix_draft",
    });

    await expect(
      controller.streamRender(
        "remake_1",
        undefined,
        request as Request,
        response as Response,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(remixStorage.headRender).not.toHaveBeenCalled();
  });

  it("GET :id/render?download=1 requires canExport and forbids otherwise", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      renderPhase: "render_ready",
      renderOutputKey: "remix/remake_1/render.mp4",
      usagePolicy: "remix_draft",
    });

    await expect(
      controller.streamRender(
        "remake_1",
        "1",
        request as Request,
        response as Response,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(remixStorage.headRender).not.toHaveBeenCalled();
  });

  it("GET :id/render?download=1 streams with attachment disposition when approved", async () => {
    remixService.getRemake.mockResolvedValue({
      id: "remake_1",
      renderPhase: "render_ready",
      renderOutputKey: "remix/remake_1/render.mp4",
      usagePolicy: "approved_for_export",
    });

    await controller.streamRender(
      "remake_1",
      "1",
      request as Request,
      response as Response,
    );

    expect(remixStorage.getRenderStream).toHaveBeenCalledWith(
      "remix/remake_1/render.mp4",
      undefined,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="remix-remake_1-render.mp4"',
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
      controller.streamRender(
        "remake_1",
        "1",
        request as Request,
        response as Response,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

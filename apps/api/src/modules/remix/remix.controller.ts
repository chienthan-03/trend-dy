import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Request, Response } from "express";
import {
  SessionAuthGuard,
  type RequestWithUser,
} from "../auth/session-auth.guard";
import { ClassifySegmentsDto } from "./dto/classify-segments.dto";
import { TriggerRemixDto } from "./dto/trigger-remix.dto";
import { UpdateRemixDto } from "./dto/update-remix.dto";
import { UpdateSegmentRolesDto } from "./dto/update-segment-roles.dto";
import { getDubMaxUploadMb } from "./remix-config";
import { RemixExportService } from "./remix-export.service";
import { RemixPolicyGuard } from "./remix-policy.guard";
import { RemixStorageService } from "./remix-storage.service";
import { RemixService } from "./remix.service";

const parseBytesRange = (
  rangeHeader: string | undefined,
  size: number,
): { start: number; end: number } | null => {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=") || size <= 0) {
    return null;
  }
  const [startRaw, endRaw] = rangeHeader.replace("bytes=", "").split("-", 2);
  const start = Number(startRaw);
  const end = endRaw === "" || endRaw === undefined ? size - 1 : Number(endRaw);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
};

@Controller("viral/remix")
@UseGuards(SessionAuthGuard)
export class RemixController {
  constructor(
    private readonly remixService: RemixService,
    private readonly remixExportService: RemixExportService,
    private readonly remixPolicyGuard: RemixPolicyGuard,
    private readonly remixStorage: RemixStorageService,
  ) {}

  @Post()
  triggerRemix(@Body() body: TriggerRemixDto) {
    return this.remixService.triggerRemix(body);
  }

  @Get()
  listRemakes(
    @Query("projectId") projectId?: string,
    @Query("status") status?: string,
    @Query("viralItemId") viralItemId?: string,
  ) {
    return this.remixService.listRemakes({ projectId, status, viralItemId });
  }

  @Get(":id")
  getRemake(@Param("id") id: string) {
    return this.remixService.getRemake(id);
  }

  @Get(":id/cost-estimate")
  getCostEstimate(@Param("id") id: string) {
    return this.remixService.getCostEstimate(id);
  }

  @Patch(":id")
  updateRemake(@Param("id") id: string, @Body() body: UpdateRemixDto) {
    return this.remixService.updateRemake(id, body);
  }

  @Post(":id/approve")
  approveRemake(@Param("id") id: string, @Req() req: RequestWithUser) {
    if (req.user?.role !== "admin") {
      throw new ForbiddenException("Admin role required to approve remix");
    }

    return this.remixService.approve(id, req.user.id);
  }

  @Post(":id/reject")
  rejectRemake(@Param("id") id: string) {
    return this.remixService.reject(id);
  }

  @Post(":id/regenerate")
  regenerateRemake(@Param("id") id: string) {
    return this.remixService.regenerate(id);
  }

  @Post(":id/retranscribe")
  retranscribeRemake(@Param("id") id: string) {
    return this.remixService.retranscribe(id);
  }

  @Post(":id/retranslate")
  retranslateRemake(@Param("id") id: string) {
    return this.remixService.retranslate(id);
  }

  @Post(":id/redownload-media")
  redownloadMedia(@Param("id") id: string) {
    return this.remixService.redownloadMedia(id);
  }

  @Post(":id/banners/generate")
  generateBanners(@Param("id") id: string) {
    return this.remixService.generateBanners(id);
  }

  @Post(":id/tts")
  enqueueTts(
    @Param("id") id: string,
    @Body() body: { voiceId?: string } = {},
  ) {
    return this.remixService.enqueueTts(id, { voiceId: body?.voiceId });
  }

  @Post(":id/dub-audio")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: getDubMaxUploadMb() * 1024 * 1024 },
    }),
  )
  uploadDubAudio(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException("Multipart field 'file' is required");
    }

    return this.remixService.uploadDubAudio(id, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    });
  }

  @Post(":id/render")
  enqueueRender(@Param("id") id: string) {
    return this.remixService.enqueueRender(id);
  }

  @Get(":id/render")
  async streamRender(
    @Param("id") id: string,
    @Query("download") download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const remake = await this.remixService.getRemake(id);
    const isDownload = download === "1";

    if (isDownload) {
      if (!this.remixPolicyGuard.canExport(remake)) {
        throw new ForbiddenException("Remix is not approved for export");
      }
    } else if (remake.renderPhase !== "render_ready") {
      throw new BadRequestException("Render is not ready for preview");
    }

    if (!remake.renderOutputKey) {
      throw new NotFoundException("Render output not found for this remake");
    }

    const head = await this.remixStorage.headRender(remake.renderOutputKey);
    const size = head.contentLength;
    const range = isDownload ? null : parseBytesRange(req.headers.range, size);
    const streamResult = await this.remixStorage.getRenderStream(
      remake.renderOutputKey,
      range ?? undefined,
    );

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", streamResult.contentType ?? "video/mp4");
    res.setHeader("Cache-Control", "private, max-age=60");

    if (isDownload) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="remix-${id}-render.mp4"`,
      );
    }

    if (range) {
      res.status(206);
      res.setHeader(
        "Content-Range",
        streamResult.contentRange ?? `bytes ${range.start}-${range.end}/${size}`,
      );
      res.setHeader("Content-Length", String(streamResult.contentLength));
    } else {
      res.status(200);
      res.setHeader("Content-Length", String(range ? streamResult.contentLength : size));
    }

    streamResult.body.pipe(res);
  }

  @Get(":id/transcript")
  getTranscript(@Param("id") id: string) {
    return this.remixService.getTranscript(id);
  }

  @Post(":id/classify-segments")
  classifySegments(
    @Param("id") id: string,
    @Body() body: ClassifySegmentsDto = {},
  ) {
    return this.remixService.classifySegments(id, { mode: body?.mode });
  }

  @Patch(":id/transcript/roles")
  updateSegmentRoles(
    @Param("id") id: string,
    @Body() body: UpdateSegmentRolesDto,
  ) {
    return this.remixService.updateSegmentRoles(id, body.roles);
  }

  @Get(":id/export")
  async exportRemake(@Param("id") id: string): Promise<StreamableFile> {
    const { stream, filename } = await this.remixExportService.exportRemake(id);

    return new StreamableFile(stream, {
      type: "application/zip",
      disposition: `attachment; filename="${filename}"`,
    });
  }
}

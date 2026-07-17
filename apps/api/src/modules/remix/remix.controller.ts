import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import {
  SessionAuthGuard,
  type RequestWithUser,
} from "../auth/session-auth.guard";
import { TriggerRemixDto } from "./dto/trigger-remix.dto";
import { UpdateRemixDto } from "./dto/update-remix.dto";
import { getDubMaxUploadMb } from "./remix-config";
import { RemixExportService } from "./remix-export.service";
import { RemixService } from "./remix.service";

@Controller("viral/remix")
@UseGuards(SessionAuthGuard)
export class RemixController {
  constructor(
    private readonly remixService: RemixService,
    private readonly remixExportService: RemixExportService,
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

  @Get(":id/transcript")
  getTranscript(@Param("id") id: string) {
    return this.remixService.getTranscript(id);
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

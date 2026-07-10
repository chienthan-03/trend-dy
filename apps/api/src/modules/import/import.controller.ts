import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ImportUrlDto } from "./dto/import-url.dto";
import { ImportService } from "./import.service";

@Controller("stories")
@UseGuards(SessionAuthGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  /**
   * Accepts either multipart `file` (TXT/EPUB) or JSON `{ url }`.
   * Hard-rejects uncleared sources before enqueue.
   */
  @Post(":id/import")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async import(
    @Param("id") storyId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: ImportUrlDto,
  ) {
    if (file) {
      return this.importService.importFile(storyId, {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      });
    }

    if (body?.url) {
      return this.importService.importUrl(storyId, body.url);
    }

    throw new BadRequestException(
      "Provide multipart field 'file' or JSON body { url }",
    );
  }
}

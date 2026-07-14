import {
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
  UseGuards,
} from "@nestjs/common";
import {
  SessionAuthGuard,
  type RequestWithUser,
} from "../auth/session-auth.guard";
import { TriggerRemixDto } from "./dto/trigger-remix.dto";
import { UpdateRemixDto } from "./dto/update-remix.dto";
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

  @Get(":id/export")
  async exportRemake(@Param("id") id: string): Promise<StreamableFile> {
    const { stream, filename } = await this.remixExportService.exportRemake(id);

    return new StreamableFile(stream, {
      type: "application/zip",
      disposition: `attachment; filename="${filename}"`,
    });
  }
}

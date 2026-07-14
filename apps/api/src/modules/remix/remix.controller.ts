import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotImplementedException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  SessionAuthGuard,
  type RequestWithUser,
} from "../auth/session-auth.guard";
import { TriggerRemixDto } from "./dto/trigger-remix.dto";
import { UpdateRemixDto } from "./dto/update-remix.dto";
import { RemixService } from "./remix.service";

@Controller("viral/remix")
@UseGuards(SessionAuthGuard)
export class RemixController {
  constructor(private readonly remixService: RemixService) {}

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
  exportRemake() {
    throw new NotImplementedException("Remix export is not implemented yet");
  }
}

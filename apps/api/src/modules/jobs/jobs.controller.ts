import {
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { JobsService } from "./jobs.service";

@Controller("jobs")
@UseGuards(SessionAuthGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  list(
    @Query("storyId") storyId?: string,
    @Query("status") status?: string,
    @Query("typePrefix") typePrefix?: string,
  ) {
    return this.jobsService.list({ storyId, status, typePrefix });
  }

  @Get(":id/events")
  @Sse()
  streamEvents(@Param("id") id: string): Observable<MessageEvent> {
    return this.jobsService.streamEvents(id);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.jobsService.findById(id);
  }

  @Post(":id/retry")
  retry(@Param("id") id: string) {
    return this.jobsService.retry(id);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string) {
    return this.jobsService.cancel(id);
  }
}

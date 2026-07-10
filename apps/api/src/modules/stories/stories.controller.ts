import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { CreateStoryDto } from "./dto/create-story.dto";
import { UpdateStoryDto } from "./dto/update-story.dto";
import { StoriesService } from "./stories.service";

@Controller("stories")
@UseGuards(SessionAuthGuard)
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get()
  list(@Query("projectId") projectId?: string) {
    return this.storiesService.list(projectId);
  }

  @Post()
  create(@Body() body: CreateStoryDto) {
    return this.storiesService.create(body);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.storiesService.findById(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateStoryDto) {
    return this.storiesService.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.storiesService.remove(id);
  }

  @Get(":id/chapters")
  listChapters(@Param("id") id: string) {
    return this.storiesService.listChapters(id);
  }

  @Get(":id/chapters/:chapterId")
  findChapter(
    @Param("id") id: string,
    @Param("chapterId") chapterId: string,
  ) {
    return this.storiesService.findChapter(id, chapterId);
  }
}

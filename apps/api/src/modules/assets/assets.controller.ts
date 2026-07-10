import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { AssetsService } from "./assets.service";
import { CreateAssetsDto, ExportStoryDto } from "./dto/assets.dto";

@Controller("outputs")
@UseGuards(SessionAuthGuard)
export class OutputAssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post(":id/assets")
  createAssets(@Param("id") outputId: string, @Body() body: CreateAssetsDto) {
    return this.assetsService.enqueueAssets(outputId, body.types);
  }
}

@Controller("stories")
@UseGuards(SessionAuthGuard)
export class StoryExportController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post(":id/export")
  exportStory(@Param("id") storyId: string, @Body() body: ExportStoryDto) {
    return this.assetsService.exportStory(storyId, body);
  }
}

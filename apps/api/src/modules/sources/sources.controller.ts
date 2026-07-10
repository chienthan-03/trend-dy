import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { CreateSourceDto } from "./dto/create-source.dto";
import { UpdateSourceDto } from "./dto/update-source.dto";
import { SourcesService } from "./sources.service";

@Controller("sources")
@UseGuards(SessionAuthGuard)
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get()
  list(@Query("projectId") projectId?: string) {
    return this.sourcesService.list(projectId);
  }

  @Post()
  create(@Body() body: CreateSourceDto) {
    return this.sourcesService.create(body);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.sourcesService.findById(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateSourceDto) {
    return this.sourcesService.update(id, body);
  }
}

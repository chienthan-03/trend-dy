import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { ProjectsService } from "./projects.service";

@Controller("projects")
@UseGuards(SessionAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list() {
    return this.projectsService.list();
  }

  @Post()
  create(@Body() body: CreateProjectDto) {
    return this.projectsService.create(body);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.projectsService.findById(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateProjectDto) {
    return this.projectsService.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.projectsService.remove(id);
  }
}

import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { GenerateDto } from "./dto/generate.dto";
import { UpdateOutputDto } from "./dto/update-output.dto";
import { GenerateService } from "./generate.service";

@Controller("stories")
@UseGuards(SessionAuthGuard)
export class GenerateController {
  constructor(private readonly generateService: GenerateService) {}

  @Post(":id/generate")
  generate(@Param("id") storyId: string, @Body() body: GenerateDto) {
    return this.generateService.enqueueGenerate(storyId, body);
  }

  @Get(":id/outputs")
  listOutputs(@Param("id") storyId: string) {
    return this.generateService.listOutputs(storyId);
  }
}

@Controller("outputs")
@UseGuards(SessionAuthGuard)
export class OutputsController {
  constructor(private readonly generateService: GenerateService) {}

  @Get(":id")
  getOutput(@Param("id") outputId: string) {
    return this.generateService.getOutput(outputId);
  }

  @Patch(":id")
  updateOutput(
    @Param("id") outputId: string,
    @Body() body: UpdateOutputDto,
  ) {
    return this.generateService.updateOutput(outputId, body);
  }
}

import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { GraphService } from "./graph.service";
import { UnderstandService } from "./understand.service";

@Controller("stories")
@UseGuards(SessionAuthGuard)
export class UnderstandController {
  constructor(
    private readonly understandService: UnderstandService,
    private readonly graphService: GraphService,
  ) {}

  @Post(":id/understand")
  understand(@Param("id") storyId: string) {
    return this.understandService.enqueueUnderstand(storyId);
  }

  @Get(":id/graph")
  graph(@Param("id") storyId: string) {
    return this.graphService.getStoryGraph(storyId);
  }
}

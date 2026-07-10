import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { JobsModule } from "../jobs/jobs.module";
import { SourcesModule } from "../sources/sources.module";
import { StoriesModule } from "../stories/stories.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { ArcRollupService } from "./arc-rollup.service";
import { ExtractService } from "./extract.service";
import { GraphService } from "./graph.service";
import { UnderstandController } from "./understand.controller";
import { UnderstandService } from "./understand.service";

@Module({
  imports: [PrismaModule, AuthModule, JobsModule, SourcesModule, StoriesModule],
  controllers: [UnderstandController],
  providers: [
    UnderstandService,
    ExtractService,
    ArcRollupService,
    GraphService,
  ],
  exports: [ExtractService, ArcRollupService, GraphService],
})
export class UnderstandModule {}

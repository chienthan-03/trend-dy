import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { JobsModule } from "../jobs/jobs.module";
import { PromptsModule } from "../prompts/prompts.module";
import { StoriesModule } from "../stories/stories.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { ContextBuilder } from "./context-builder";
import { GenerateController, OutputsController } from "./generate.controller";
import { GenerateService } from "./generate.service";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    JobsModule,
    StoriesModule,
    PromptsModule,
  ],
  controllers: [GenerateController, OutputsController],
  providers: [GenerateService, ContextBuilder],
  exports: [GenerateService, ContextBuilder],
})
export class GenerateModule {}

import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GenerateModule } from "../generate/generate.module";
import { ImportModule } from "../import/import.module";
import { JobsModule } from "../jobs/jobs.module";
import { StoriesModule } from "../stories/stories.module";
import { PrismaModule } from "../../prisma/prisma.module";
import {
  OutputAssetsController,
  StoryExportController,
} from "./assets.controller";
import { AssetsService } from "./assets.service";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    JobsModule,
    StoriesModule,
    GenerateModule,
    ImportModule,
  ],
  controllers: [OutputAssetsController, StoryExportController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}

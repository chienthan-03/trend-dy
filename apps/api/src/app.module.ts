import { Module } from "@nestjs/common";
import { AssetsModule } from "./modules/assets/assets.module";
import { AuthModule } from "./modules/auth/auth.module";
import { GenerateModule } from "./modules/generate/generate.module";
import { ImportModule } from "./modules/import/import.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { PromptsModule } from "./modules/prompts/prompts.module";
import { SourcesModule } from "./modules/sources/sources.module";
import { StoriesModule } from "./modules/stories/stories.module";
import { UnderstandModule } from "./modules/understand/understand.module";
import { ViralModule } from "./modules/viral/viral.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QueueModule } from "./queue/queue.module";

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    JobsModule,
    AuthModule,
    ProjectsModule,
    SourcesModule,
    StoriesModule,
    ImportModule,
    UnderstandModule,
    PromptsModule,
    GenerateModule,
    AssetsModule,
    ViralModule,
  ],
})
export class AppModule {}

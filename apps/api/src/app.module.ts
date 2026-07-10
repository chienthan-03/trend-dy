import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { SourcesModule } from "./modules/sources/sources.module";
import { StoriesModule } from "./modules/stories/stories.module";
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
  ],
})
export class AppModule {}

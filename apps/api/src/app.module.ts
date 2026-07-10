import { Module } from "@nestjs/common";
import { JobsModule } from "./modules/jobs/jobs.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QueueModule } from "./queue/queue.module";

@Module({
  imports: [PrismaModule, QueueModule, JobsModule],
})
export class AppModule {}

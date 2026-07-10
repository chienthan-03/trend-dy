import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { QueueModule } from "../../queue/queue.module";
import { JobsService } from "./jobs.service";

@Module({
  imports: [PrismaModule, QueueModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}

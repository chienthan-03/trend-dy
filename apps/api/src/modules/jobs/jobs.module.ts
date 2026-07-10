import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { QueueModule } from "../../queue/queue.module";
import { AuthModule } from "../auth/auth.module";
import { UsageModule } from "../usage/usage.module";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [PrismaModule, QueueModule, AuthModule, UsageModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}

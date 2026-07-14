import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { JobsModule } from "../jobs/jobs.module";
import { PromptsModule } from "../prompts/prompts.module";
import { RemixController } from "./remix.controller";
import { RemixPolicyGuard } from "./remix-policy.guard";
import { RemixService } from "./remix.service";

@Module({
  imports: [PrismaModule, JobsModule, PromptsModule, AuthModule],
  controllers: [RemixController],
  providers: [RemixService, RemixPolicyGuard],
  exports: [RemixService, RemixPolicyGuard],
})
export class RemixModule {}

import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { JobsModule } from "../jobs/jobs.module";
import { PromptsModule } from "../prompts/prompts.module";
import { RemixPolicyGuard } from "./remix-policy.guard";
import { RemixService } from "./remix.service";

@Module({
  imports: [PrismaModule, JobsModule, PromptsModule],
  providers: [RemixService, RemixPolicyGuard],
  exports: [RemixService, RemixPolicyGuard],
})
export class RemixModule {}

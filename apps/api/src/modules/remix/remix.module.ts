import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { JobsModule } from "../jobs/jobs.module";
import { RemixPolicyGuard } from "./remix-policy.guard";
import { RemixService } from "./remix.service";

@Module({
  imports: [PrismaModule, JobsModule],
  providers: [RemixService, RemixPolicyGuard],
  exports: [RemixService, RemixPolicyGuard],
})
export class RemixModule {}

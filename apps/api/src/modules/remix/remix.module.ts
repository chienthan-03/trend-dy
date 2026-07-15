import { Module, OnModuleInit } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { ImportModule } from "../import/import.module";
import { JobsModule } from "../jobs/jobs.module";
import { PromptsModule } from "../prompts/prompts.module";
import { RemixController } from "./remix.controller";
import { RemixExportService } from "./remix-export.service";
import { RemixPolicyGuard } from "./remix-policy.guard";
import { RemixStorageService } from "./remix-storage.service";
import { RemixMediaCleanupService } from "./remix-media-cleanup.service";
import { RemixService } from "./remix.service";
import { JobsService } from "../jobs/jobs.service";
import { isMediaDownloadAllowed } from "./remix-config";

@Module({
  imports: [PrismaModule, JobsModule, PromptsModule, AuthModule, ImportModule],
  controllers: [RemixController],
  providers: [
    RemixService,
    RemixExportService,
    RemixPolicyGuard,
    RemixStorageService,
    RemixMediaCleanupService,
  ],
  exports: [
    RemixService,
    RemixExportService,
    RemixPolicyGuard,
    RemixStorageService,
    RemixMediaCleanupService,
  ],
})
export class RemixModule implements OnModuleInit {
  constructor(private readonly jobsService: JobsService) {}

  async onModuleInit() {
    if (isMediaDownloadAllowed()) {
      // Run cleanup once every 24 hours
      await this.jobsService.enqueueRepeatable(
        "remix_cleanup_media",
        {},
        { every: 24 * 60 * 60 * 1000 },
      );
    }
  }
}

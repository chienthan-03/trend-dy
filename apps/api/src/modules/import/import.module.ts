import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { JobsModule } from "../jobs/jobs.module";
import { SourcesModule } from "../sources/sources.module";
import { ImportController } from "./import.controller";
import { ImportService } from "./import.service";
import {
  OBJECT_STORAGE,
  createObjectStorage,
} from "./storage/object-storage";

@Module({
  imports: [AuthModule, SourcesModule, JobsModule],
  controllers: [ImportController],
  providers: [
    ImportService,
    {
      provide: OBJECT_STORAGE,
      useFactory: () => createObjectStorage(),
    },
  ],
  exports: [ImportService, OBJECT_STORAGE],
})
export class ImportModule {}

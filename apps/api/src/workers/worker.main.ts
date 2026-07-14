import "../load-env";
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { GenerateModule } from "../modules/generate/generate.module";
import { AssetsModule } from "../modules/assets/assets.module";
import { ImportModule } from "../modules/import/import.module";
import { JobsModule } from "../modules/jobs/jobs.module";
import { PromptsModule } from "../modules/prompts/prompts.module";
import { UnderstandModule } from "../modules/understand/understand.module";
import { ViralModule } from "../modules/viral/viral.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { GenerateProcessor } from "./processors/generate.processor";
import { AssetProcessor } from "./processors/asset.processor";
import { ImportProcessor } from "./processors/import.processor";
import { UnderstandProcessor } from "./processors/understand.processor";
import { DiscoveryProcessor } from "./processors/discovery.processor";
import { RemixProcessor } from "./processors/remix.processor";
import { RemixModule } from "../modules/remix/remix.module";

@Module({
  imports: [
    QueueModule,
    PrismaModule,
    JobsModule,
    PromptsModule,
    ImportModule,
    UnderstandModule,
    GenerateModule,
    AssetsModule,
    ViralModule,
    RemixModule,
  ],
  providers: [
    ImportProcessor,
    UnderstandProcessor,
    GenerateProcessor,
    AssetProcessor,
    DiscoveryProcessor,
    RemixProcessor,
  ],
})
class WorkerModule {}

const bootstrap = async () => {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  console.log(
    "Worker started — ImportProcessor, UnderstandProcessor, GenerateProcessor, AssetProcessor, DiscoveryProcessor, RemixProcessor",
  );
};

void bootstrap();

import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { GenerateModule } from "../modules/generate/generate.module";
import { AssetsModule } from "../modules/assets/assets.module";
import { ImportModule } from "../modules/import/import.module";
import { JobsModule } from "../modules/jobs/jobs.module";
import { UnderstandModule } from "../modules/understand/understand.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { QUEUE_NAMES } from "../queue/queues";
import { GenerateProcessor } from "./processors/generate.processor";
import { AssetProcessor } from "./processors/asset.processor";
import { ImportProcessor } from "./processors/import.processor";
import { UnderstandProcessor } from "./processors/understand.processor";

const [, , GENERATE_Q, , DISCOVERY_Q] = QUEUE_NAMES;

@Processor(DISCOVERY_Q)
class DiscoveryNoopProcessor extends WorkerHost {
  async process(_job: Job): Promise<void> {
    // noop — real discovery processor lands in a later task
  }
}

@Module({
  imports: [
    QueueModule,
    PrismaModule,
    JobsModule,
    ImportModule,
    UnderstandModule,
    GenerateModule,
    AssetsModule,
  ],
  providers: [
    ImportProcessor,
    UnderstandProcessor,
    GenerateProcessor,
    AssetProcessor,
    DiscoveryNoopProcessor,
  ],
})
class WorkerModule {}

const bootstrap = async () => {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  console.log(
    `Worker started — ImportProcessor, UnderstandProcessor, GenerateProcessor, AssetProcessor + noop processor for ${DISCOVERY_Q}`,
  );
};

void bootstrap();

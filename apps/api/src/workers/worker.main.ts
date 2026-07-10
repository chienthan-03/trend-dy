import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { GenerateModule } from "../modules/generate/generate.module";
import { ImportModule } from "../modules/import/import.module";
import { JobsModule } from "../modules/jobs/jobs.module";
import { UnderstandModule } from "../modules/understand/understand.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { QUEUE_NAMES } from "../queue/queues";
import { GenerateProcessor } from "./processors/generate.processor";
import { ImportProcessor } from "./processors/import.processor";
import { UnderstandProcessor } from "./processors/understand.processor";

const [, , GENERATE_Q, ASSET_Q, DISCOVERY_Q] = QUEUE_NAMES;

@Processor(ASSET_Q)
class AssetNoopProcessor extends WorkerHost {
  async process(_job: Job): Promise<void> {
    // noop — real asset processor lands in a later task
  }
}

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
  ],
  providers: [
    ImportProcessor,
    UnderstandProcessor,
    GenerateProcessor,
    AssetNoopProcessor,
    DiscoveryNoopProcessor,
  ],
})
class WorkerModule {}

const bootstrap = async () => {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  console.log(
    `Worker started — ImportProcessor, UnderstandProcessor, GenerateProcessor + noop processors for ${ASSET_Q}, ${DISCOVERY_Q}`,
  );
};

void bootstrap();

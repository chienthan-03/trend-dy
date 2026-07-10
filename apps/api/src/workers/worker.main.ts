import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { QueueModule } from "../queue/queue.module";
import { QUEUE_NAMES } from "../queue/queues";

const [IMPORT_Q, UNDERSTAND_Q, GENERATE_Q, ASSET_Q, DISCOVERY_Q] = QUEUE_NAMES;

@Processor(IMPORT_Q)
class ImportNoopProcessor extends WorkerHost {
  async process(_job: Job): Promise<void> {
    // noop — real import processor lands in a later task
  }
}

@Processor(UNDERSTAND_Q)
class UnderstandNoopProcessor extends WorkerHost {
  async process(_job: Job): Promise<void> {
    // noop — real understand processor lands in a later task
  }
}

@Processor(GENERATE_Q)
class GenerateNoopProcessor extends WorkerHost {
  async process(_job: Job): Promise<void> {
    // noop — real generate processor lands in a later task
  }
}

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
  imports: [QueueModule],
  providers: [
    ImportNoopProcessor,
    UnderstandNoopProcessor,
    GenerateNoopProcessor,
    AssetNoopProcessor,
    DiscoveryNoopProcessor,
  ],
})
class WorkerModule {}

const bootstrap = async () => {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  console.log(
    `Worker started — noop processors registered for ${QUEUE_NAMES.join(", ")}`,
  );
};

void bootstrap();

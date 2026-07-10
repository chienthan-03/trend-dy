import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { QueueModule } from "../queue/queue.module";

@Processor("import")
class ImportNoopProcessor extends WorkerHost {
  async process(_job: Job): Promise<void> {
    // noop — real import processor lands in a later task
  }
}

@Processor("understand")
class UnderstandNoopProcessor extends WorkerHost {
  async process(_job: Job): Promise<void> {
    // noop — real understand processor lands in a later task
  }
}

@Processor("generate")
class GenerateNoopProcessor extends WorkerHost {
  async process(_job: Job): Promise<void> {
    // noop — real generate processor lands in a later task
  }
}

@Processor("asset")
class AssetNoopProcessor extends WorkerHost {
  async process(_job: Job): Promise<void> {
    // noop — real asset processor lands in a later task
  }
}

@Processor("discovery")
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
    "Worker started — noop processors registered for import, understand, generate, asset, discovery",
  );
};

void bootstrap();

import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { QUEUE_NAMES, getRedisConnection } from "./queues";

@Module({
  imports: [
    BullModule.forRoot({
      connection: getRedisConnection(),
    }),
    BullModule.registerQueue(
      ...QUEUE_NAMES.map((name) => ({ name })),
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}

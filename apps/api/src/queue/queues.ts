export const QUEUE_NAMES = [
  "import",
  "understand",
  "generate",
  "asset",
  "discovery",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export const getRedisConnection = () => {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null as null,
  };
};

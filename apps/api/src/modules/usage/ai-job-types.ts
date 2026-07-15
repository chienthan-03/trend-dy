import { resolveQueueName } from "../jobs/job-type-to-queue";

export const isAiBudgetedJobType = (type: string): boolean => {
  try {
    const queue = resolveQueueName(type);
    return (
      queue === "understand" ||
      queue === "generate" ||
      type === "remix_generate" ||
      type === "remix_stt"
    );
  } catch {
    return false;
  }
};

import {
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const startOfUtcDay = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

export const getDailyBudgetCapUsd = (): number | null => {
  const raw = process.env.AI_DAILY_BUDGET_USD;
  if (!raw?.trim()) {
    return null;
  }

  const cap = Number(raw);
  if (!Number.isFinite(cap) || cap <= 0) {
    return null;
  }

  return cap;
};

@Injectable()
export class BudgetGuard {
  constructor(private readonly prisma: PrismaService) {}

  async getTodaySpendUsd(): Promise<number> {
    const result = await this.prisma.usageEvent.aggregate({
      where: { createdAt: { gte: startOfUtcDay() } },
      _sum: { costUsd: true },
    });

    return result._sum.costUsd ?? 0;
  }

  async assertWithinDailyBudget(): Promise<void> {
    const cap = getDailyBudgetCapUsd();
    if (cap === null) {
      return;
    }

    const spent = await this.getTodaySpendUsd();
    if (spent >= cap) {
      throw new HttpException(
        {
          error: {
            code: "daily_budget_exceeded",
            message: `Daily AI budget exceeded ($${spent.toFixed(2)} / $${cap.toFixed(2)}). Understand and generate jobs are paused until tomorrow (UTC).`,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

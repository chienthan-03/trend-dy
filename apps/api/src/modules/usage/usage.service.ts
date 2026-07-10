import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { BudgetGuard, getDailyBudgetCapUsd } from "./budget.guard";

export type UsageTotals = {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
};

export type UsageByDay = UsageTotals & {
  date: string;
};

export type UsageByModel = UsageTotals & {
  model: string;
  provider: string;
  count: number;
};

export type UsageBudgetStatus = {
  dailyCapUsd: number | null;
  todaySpendUsd: number;
  remainingUsd: number | null;
  exceeded: boolean;
};

export type UsageReport = {
  totals: UsageTotals;
  today: UsageTotals;
  budget: UsageBudgetStatus;
  byDay: UsageByDay[];
  byModel: UsageByModel[];
};

const sumField = (value: number | null | undefined): number => value ?? 0;

const toUtcDateKey = (date: Date): string => date.toISOString().slice(0, 10);

@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetGuard: BudgetGuard,
  ) {}

  async getUsageReport(): Promise<UsageReport> {
    const events = await this.prisma.usageEvent.findMany({
      select: {
        createdAt: true,
        model: true,
        provider: true,
        tokensIn: true,
        tokensOut: true,
        costUsd: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const totals: UsageTotals = {
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    };
    const today: UsageTotals = {
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    };
    const todayKey = toUtcDateKey(new Date());
    const byDayMap = new Map<string, UsageTotals>();
    const byModelMap = new Map<string, UsageByModel>();

    for (const event of events) {
      const tokensIn = sumField(event.tokensIn);
      const tokensOut = sumField(event.tokensOut);
      const costUsd = sumField(event.costUsd);

      totals.tokensIn += tokensIn;
      totals.tokensOut += tokensOut;
      totals.costUsd += costUsd;

      const dayKey = toUtcDateKey(event.createdAt);
      const dayTotals = byDayMap.get(dayKey) ?? {
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
      };
      dayTotals.tokensIn += tokensIn;
      dayTotals.tokensOut += tokensOut;
      dayTotals.costUsd += costUsd;
      byDayMap.set(dayKey, dayTotals);

      if (dayKey === todayKey) {
        today.tokensIn += tokensIn;
        today.tokensOut += tokensOut;
        today.costUsd += costUsd;
      }

      const modelKey = `${event.provider}::${event.model}`;
      const modelTotals = byModelMap.get(modelKey) ?? {
        model: event.model,
        provider: event.provider,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        count: 0,
      };
      modelTotals.tokensIn += tokensIn;
      modelTotals.tokensOut += tokensOut;
      modelTotals.costUsd += costUsd;
      modelTotals.count += 1;
      byModelMap.set(modelKey, modelTotals);
    }

    const todaySpendUsd = await this.budgetGuard.getTodaySpendUsd();
    const dailyCapUsd = getDailyBudgetCapUsd();
    const remainingUsd =
      dailyCapUsd === null ? null : Math.max(0, dailyCapUsd - todaySpendUsd);

    const byDay = [...byDayMap.entries()]
      .map(([date, row]) => ({ date, ...row }))
      .sort((a, b) => b.date.localeCompare(a.date));

    const byModel = [...byModelMap.values()].sort(
      (a, b) => b.costUsd - a.costUsd,
    );

    return {
      totals,
      today,
      budget: {
        dailyCapUsd,
        todaySpendUsd,
        remainingUsd,
        exceeded:
          dailyCapUsd !== null ? todaySpendUsd >= dailyCapUsd : false,
      },
      byDay,
      byModel,
    };
  }
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { api, getErrorMessage, type UsageReport } from "@/lib/api-client";

const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);

const formatTokens = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);

const Stat = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
      {label}
    </p>
    <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
    {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
  </div>
);

const AnalyticsPage = () => {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.analytics.usage();
      setReport(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const budgetHint =
    report?.budget.dailyCapUsd != null
      ? `${formatUsd(report.budget.todaySpendUsd)} of ${formatUsd(report.budget.dailyCapUsd)} today`
      : "No daily cap configured";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Token usage, estimated AI cost, and daily budget status."
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      {error ? <Alert>{error}</Alert> : null}

      {report?.budget.exceeded ? (
        <Alert>
          Daily AI budget exceeded. Understand and generate jobs are paused until
          tomorrow (UTC).
        </Alert>
      ) : null}

      {loading ? (
        <Card>
          <p className="text-sm text-gray-600">Loading usage data…</p>
        </Card>
      ) : report ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Today's cost"
              value={formatUsd(report.today.costUsd)}
              hint={budgetHint}
            />
            <Stat
              label="Today's tokens"
              value={formatTokens(
                report.today.tokensIn + report.today.tokensOut,
              )}
              hint={`${formatTokens(report.today.tokensIn)} in · ${formatTokens(report.today.tokensOut)} out`}
            />
            <Stat
              label="All-time cost"
              value={formatUsd(report.totals.costUsd)}
            />
            <Stat
              label="Budget remaining"
              value={
                report.budget.remainingUsd != null
                  ? formatUsd(report.budget.remainingUsd)
                  : "—"
              }
              hint={
                report.budget.dailyCapUsd != null
                  ? `Cap: ${formatUsd(report.budget.dailyCapUsd)} / day`
                  : "Set AI_DAILY_BUDGET_USD to enable"
              }
            />
          </div>

          <Card title="By model">
            {report.byModel.length === 0 ? (
              <EmptyState>No usage events yet.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                      <th className="px-2 py-2 font-medium">Provider</th>
                      <th className="px-2 py-2 font-medium">Model</th>
                      <th className="px-2 py-2 font-medium">Calls</th>
                      <th className="px-2 py-2 font-medium">Tokens in</th>
                      <th className="px-2 py-2 font-medium">Tokens out</th>
                      <th className="px-2 py-2 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byModel.map((row) => (
                      <tr
                        key={`${row.provider}-${row.model}`}
                        className="border-b border-gray-100 last:border-0"
                      >
                        <td className="px-2 py-2">{row.provider}</td>
                        <td className="px-2 py-2 font-mono text-xs">
                          {row.model}
                        </td>
                        <td className="px-2 py-2">{row.count}</td>
                        <td className="px-2 py-2">
                          {formatTokens(row.tokensIn)}
                        </td>
                        <td className="px-2 py-2">
                          {formatTokens(row.tokensOut)}
                        </td>
                        <td className="px-2 py-2">{formatUsd(row.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="By day">
            {report.byDay.length === 0 ? (
              <EmptyState>No daily usage yet.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                      <th className="px-2 py-2 font-medium">Date (UTC)</th>
                      <th className="px-2 py-2 font-medium">Tokens in</th>
                      <th className="px-2 py-2 font-medium">Tokens out</th>
                      <th className="px-2 py-2 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byDay.map((row) => (
                      <tr
                        key={row.date}
                        className="border-b border-gray-100 last:border-0"
                      >
                        <td className="px-2 py-2 font-mono text-xs">
                          {row.date}
                        </td>
                        <td className="px-2 py-2">
                          {formatTokens(row.tokensIn)}
                        </td>
                        <td className="px-2 py-2">
                          {formatTokens(row.tokensOut)}
                        </td>
                        <td className="px-2 py-2">{formatUsd(row.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
};

export default AnalyticsPage;

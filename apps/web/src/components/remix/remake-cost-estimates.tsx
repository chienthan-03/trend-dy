"use client";

import type {
  RemixActionCostEstimate,
  RemixCostEstimate,
} from "@/lib/api-client";

const formatUsd = (value: number | null): string => {
  if (value == null) return "—";
  if (value === 0) return "$0";
  if (value < 0.01) return `~$${value.toFixed(4)}`;
  return `~$${value.toFixed(2)}`;
};

export const formatActionCostUsd = formatUsd;

export const costLabelForAction = (
  estimate: RemixCostEstimate | null | undefined,
  action: RemixActionCostEstimate["action"],
): string | null => {
  const row = estimate?.actions.find((item) => item.action === action);
  if (!row || row.estimatedUsd == null) return null;
  return formatUsd(row.estimatedUsd);
};

type RemakeCostEstimatesProps = {
  estimate: RemixCostEstimate | null;
  error?: string | null;
  loading?: boolean;
};

export const RemakeCostEstimates = ({
  estimate,
  error,
  loading,
}: RemakeCostEstimatesProps) => {
  if (error) {
    return (
      <p className="text-xs text-amber-800" role="status">
        Không tải được ước chi phí: {error}
      </p>
    );
  }

  if (loading || !estimate) {
    return (
      <p className="text-xs text-gray-500" aria-live="polite">
        Đang ước lượng chi phí…
      </p>
    );
  }

  const byAction = (action: RemixActionCostEstimate["action"]) =>
    estimate.actions.find((item) => item.action === action);

  const rows: RemixActionCostEstimate[] = [
    byAction("retranscribe"),
    byAction("retranslate"),
    byAction("tts"),
    byAction("classify"),
    byAction("banners"),
    byAction("render"),
  ].filter((row): row is RemixActionCostEstimate => row != null);

  return (
    <div
      className="space-y-2 rounded-lg border border-gray-200 bg-white p-3"
      aria-label="Ước lượng chi phí từng chức năng"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">
          Ước chi phí (tham khảo)
        </h3>
        <span className="text-xs text-gray-500">
          STT {estimate.rates.sttModel} · Dịch {estimate.rates.translateModel} ·
          TTS {estimate.rates.ttsModel} ({estimate.rates.ttsBatchMode}) · $
          {estimate.rates.ttsPer1kCharsUsd}/1k ký tự
        </span>
      </div>

      <ul className="divide-y divide-gray-100 text-sm">
        {rows.map((row) => (
          <li
            key={row.action}
            className="flex flex-wrap items-start justify-between gap-2 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-800">{row.label}</p>
              <p className="text-xs text-gray-500">{row.detail}</p>
            </div>
            <p
              className={
                row.estimatedUsd == null
                  ? "shrink-0 font-mono text-gray-400"
                  : row.estimatedUsd > 0.05
                    ? "shrink-0 font-mono font-semibold text-amber-800"
                    : "shrink-0 font-mono text-gray-700"
              }
              title={row.detail}
            >
              {formatUsd(row.estimatedUsd)}
            </p>
          </li>
        ))}
      </ul>

      {estimate.lastTtsCostUsd != null ? (
        <p className="text-xs text-gray-500">
          Lần TTS gần nhất đã ghi: ${estimate.lastTtsCostUsd.toFixed(4)}
        </p>
      ) : null}

      <p className="text-xs text-gray-400">{estimate.disclaimer}</p>
    </div>
  );
};

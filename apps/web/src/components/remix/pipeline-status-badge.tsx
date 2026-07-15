import { RemixPipelinePhase } from "@factory/shared";
import { Badge, Spinner } from "@/components/ui";

interface PipelineStatusBadgeProps {
  pipelinePhase: RemixPipelinePhase;
  status: string;
}

const PHASE_LABELS: Record<RemixPipelinePhase, string> = {
  pending: "Đang chờ",
  resolving: "Đang giải quyết",
  fetching_detail: "Đang lấy chi tiết",
  downloading_media: "Đang tải media",
  transcribing: "Đang chuyển âm thành văn",
  translating: "Đang dịch transcript",
  generating: "Đang xử lý AI",
  ready: "Sẵn sàng",
  failed: "Thất bại",
};

export const PipelineStatusBadge = ({
  pipelinePhase,
  status,
}: PipelineStatusBadgeProps) => {
  const isProcessing =
    status === "pending" ||
    status === "running" ||
    (pipelinePhase !== "ready" && pipelinePhase !== "failed");

  const label = PHASE_LABELS[pipelinePhase] || pipelinePhase;

  let tone: "neutral" | "success" | "danger" | "warning" = "neutral";
  if (pipelinePhase === "ready") tone = "success";
  if (pipelinePhase === "failed" || status === "failed") tone = "danger";
  if (isProcessing && pipelinePhase !== "pending") tone = "warning";

  return (
    <Badge tone={tone} className="flex items-center gap-1.5">
      {isProcessing && pipelinePhase !== "ready" && pipelinePhase !== "failed" && (
        <Spinner className="animate-pulse" />
      )}
      {label}
    </Badge>
  );
};

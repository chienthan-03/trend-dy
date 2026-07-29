"use client";

import type {
  RemixPackageV1,
  RemixPipelinePhase,
  RemixScriptMode,
  RemixSegmentRole,
  RemixTranscriptV1,
} from "@factory/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PipelineStatusBadge } from "@/components/remix/pipeline-status-badge";
import { RemakeCostEstimates } from "@/components/remix/remake-cost-estimates";
import { RemakeEditor } from "@/components/remix/remake-editor";
import { RemakeSourcePanel } from "@/components/remix/remake-source-panel";
import { RemakeTranscriptPanel } from "@/components/remix/remake-transcript-panel";
import { VideoOutputPanel } from "@/components/remix/video-output-panel";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import {
  api,
  getErrorMessage,
  type RemixCostEstimate,
  type ViralRemake,
} from "@/lib/api-client";

const POLL_MS = 3000;

const isProcessingStatus = (status: string): boolean =>
  status === "pending" || status === "running";

const RemakeStudioPage = () => {
  const params = useParams<{ remakeId: string }>();
  const remakeId = params.remakeId;

  const [remake, setRemake] = useState<ViralRemake | null>(null);
  const [transcript, setTranscript] = useState<RemixTranscriptV1 | null>(null);
  const [translatedTranscript, setTranslatedTranscript] =
    useState<RemixTranscriptV1 | null>(null);
  const [packageJson, setPackageJson] = useState<RemixPackageV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [costEstimate, setCostEstimate] = useState<RemixCostEstimate | null>(
    null,
  );
  const [costEstimateError, setCostEstimateError] = useState<string | null>(
    null,
  );
  const [costEstimateLoading, setCostEstimateLoading] = useState(false);
  const dirtyRef = useRef(false);

  const loadCostEstimate = useCallback(async () => {
    setCostEstimateLoading(true);
    try {
      setCostEstimateError(null);
      const data = await api.remix.getCostEstimate(remakeId);
      setCostEstimate(data);
    } catch (err) {
      setCostEstimateError(getErrorMessage(err));
    } finally {
      setCostEstimateLoading(false);
    }
  }, [remakeId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.remix.get(remakeId);
      setRemake(data);

      if (
        data.pipelinePhase === "ready" ||
        data.scriptMode === "full" ||
        data.pipelinePhase === "translating"
      ) {
        try {
          const tData = await api.remix.getTranscript(remakeId);
          setTranscript(tData.transcript);
          setTranslatedTranscript(tData.translatedTranscript);
        } catch (err) {
          console.error("Failed to load transcript:", err);
        }
      }

      const shouldSyncFromServer =
        !dirtyRef.current || isProcessingStatus(data.status);
      if (shouldSyncFromServer) {
        if (data.packageJson) {
          setPackageJson(data.packageJson);
        } else if (isProcessingStatus(data.status)) {
          setPackageJson(null);
        }
        if (isProcessingStatus(data.status)) {
          dirtyRef.current = false;
        }
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [remakeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadCostEstimate();
  }, [loadCostEstimate, transcript, translatedTranscript, remake?.renderPhase]);

  const processing = remake
    ? isProcessingStatus(remake.status) ||
      (remake.pipelinePhase !== "ready" && remake.pipelinePhase !== "failed") ||
      remake.renderPhase === "tts" ||
      remake.renderPhase === "rendering" ||
      remake.pipelinePhase === "downloading_media"
    : false;

  useEffect(() => {
    if (!processing) return;
    const interval = setInterval(() => {
      void load();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [processing, load]);

  const handleSave = async () => {
    if (!packageJson) return;
    setPending("save");
    setError(null);
    setInfo(null);
    try {
      const updated = await api.remix.update(remakeId, {
        packageJson,
      });
      setRemake(updated);
      if (updated.packageJson) setPackageJson(updated.packageJson);
      dirtyRef.current = false;
      setInfo("Changes saved.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleApprove = async () => {
    setPending("approve");
    setError(null);
    setInfo(null);
    try {
      if (packageJson && dirtyRef.current) {
        const saved = await api.remix.update(remakeId, { packageJson });
        setRemake(saved);
        if (saved.packageJson) setPackageJson(saved.packageJson);
        dirtyRef.current = false;
      }

      const updated = await api.remix.approve(remakeId);
      setRemake(updated);
      setInfo("Approved for export.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleReject = async () => {
    setPending("reject");
    setError(null);
    setInfo(null);
    try {
      const updated = await api.remix.reject(remakeId);
      setRemake(updated);
      setInfo("Remake archived.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleRetranslate = async () => {
    setPending("retranslate");
    setError(null);
    setInfo(null);
    try {
      const result = await api.remix.retranslate(remakeId);
      setInfo(`Transcript translation queued (job ${result.jobId}).`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleRetranscribe = async () => {
    setPending("retranscribe");
    setError(null);
    setInfo(null);
    try {
      const result = await api.remix.retranscribe(remakeId);
      setInfo(
        `Transcribe lại đã xếp hàng (job ${result.jobId}). Sau STT sẽ dịch lại — rồi bấm «Tạo audio VI».`,
      );
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleToggleRole = async (index: number, role: RemixSegmentRole) => {
    setPending("toggleRole");
    setError(null);
    setInfo(null);
    try {
      const updated = await api.remix.updateSegmentRoles(remakeId, [
        { index, role },
      ]);
      setRemake(updated);
      await load();
      setInfo(
        "Đã đổi vai trò dòng thoại. Audio VI đã tạo bị xoá — bấm «Tạo audio VI» lại trước khi render.",
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleClassify = async () => {
    setPending("classify");
    setError(null);
    setInfo(null);
    try {
      const updated = await api.remix.classifySegments(remakeId, {
        mode: "reclassify",
      });
      setRemake(updated);
      await load();
      setInfo(
        updated.classifyWarning
          ? updated.classifyWarning
          : "Đã phân loại lại vai trò dòng thoại. Nếu vai trò thay đổi, cần tạo lại audio VI trước khi render.",
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleRegenerate = async () => {
    setPending("regenerate");
    setError(null);
    setInfo(null);
    try {
      const result = await api.remix.regenerate(remakeId);
      dirtyRef.current = false;
      setPackageJson(null);
      setInfo(`AI regeneration queued (job ${result.jobId}).`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleExport = () => {
    if (remake?.usagePolicy !== "approved_for_export") {
      setError("Approve the remake before exporting.");
      return;
    }
    window.open(api.remix.exportUrl(remakeId), "_blank", "noopener,noreferrer");
    setInfo("Export download started.");
  };

  const canEdit =
    remake?.status === "ready" && remake.usagePolicy !== "approved_for_export";
  const canExport = remake?.usagePolicy === "approved_for_export";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remake Studio"
        description={
          remake
            ? `Remake ${remake.externalVideoId}`
            : "Edit remix package before export"
        }
        actions={
          <Link
            href="/discovery"
            className="text-sm font-medium text-gray-600 underline decoration-gray-300 underline-offset-2 hover:text-gray-900 hover:decoration-gray-600"
          >
            Back to Viral Feed
          </Link>
        }
      />

      {error ? <Alert>{error}</Alert> : null}
      {info ? <Alert variant="info">{info}</Alert> : null}

      {!remake ? (
        <EmptyState>Loading remake…</EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={remake.status} />
            <PipelineStatusBadge
              pipelinePhase={remake.pipelinePhase as RemixPipelinePhase}
              status={remake.status}
            />
            <Badge
              tone={
                remake.usagePolicy === "approved_for_export"
                  ? "success"
                  : remake.usagePolicy === "blocked"
                    ? "danger"
                    : "neutral"
              }
            >
              {remake.usagePolicy}
            </Badge>
            {processing ? (
              <span className="text-sm text-gray-500" aria-live="polite">
                Generating remix package…
              </span>
            ) : null}
            {remake.approvedAt ? (
              <span className="text-xs text-gray-500">
                Approved {new Date(remake.approvedAt).toLocaleString()}
              </span>
            ) : null}
          </div>

          {remake.status === "failed" ? (
            <Alert>Remix generation failed. Try Re-run AI or start a new remix.</Alert>
          ) : null}

          <Card title="Source">
            <div className="space-y-4">
              <RemakeSourcePanel
                sourceSnapshot={remake.sourceSnapshot}
                sourceUrl={remake.sourceUrl}
                genre={remake.genre}
              />
              <RemakeCostEstimates
                estimate={costEstimate}
                error={costEstimateError}
                loading={costEstimateLoading}
              />
              <RemakeTranscriptPanel
                transcript={transcript}
                translatedTranscript={translatedTranscript}
                videoDurationSec={remake.videoDurationSec}
                scriptMode={remake.scriptMode as RemixScriptMode}
                pipelinePhase={remake.pipelinePhase}
                costEstimate={costEstimate}
                onRetranslate={handleRetranslate}
                retranslatePending={pending === "retranslate"}
                onRetranscribe={handleRetranscribe}
                retranscribePending={pending === "retranscribe"}
                onToggleRole={handleToggleRole}
                onClassify={handleClassify}
                classifyPending={pending === "classify" || pending === "toggleRole"}
                classifyWarning={remake.classifyWarning}
                timingWarning={remake.timingWarning}
                effectiveTtsAudioMode={remake.effectiveTtsAudioMode}
              />
            </div>
          </Card>

          <Card title="Remix package">
            {packageJson ? (
              <div className="space-y-4">
                <RemakeEditor
                  packageJson={packageJson}
                  disabled={!canEdit}
                  onChange={(next) => {
                    dirtyRef.current = true;
                    setPackageJson(next);
                  }}
                />
              </div>
            ) : (
              <EmptyState>
                {processing
                  ? "Waiting for AI to generate the remix package…"
                  : "No package available yet."}
              </EmptyState>
            )}
          </Card>

          <Card title="Video xuất bản (Dub + Render)">
            <VideoOutputPanel
              remake={remake}
              pipelineReady={Boolean(translatedTranscript)}
              costEstimate={costEstimate}
              onRemakeChange={(updated) => setRemake(updated)}
              onError={(message) => setError(message)}
              onInfo={(message) => setInfo(message)}
            />
          </Card>

          <Card title="Actions">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSave}
                disabled={!canEdit || !packageJson || pending === "save"}
                aria-label="Save remix package"
              >
                {pending === "save" ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="secondary"
                onClick={handleApprove}
                disabled={!canEdit || !packageJson || pending === "approve"}
                aria-label="Approve for export"
              >
                {pending === "approve" ? "Approving…" : "Approve for export"}
              </Button>
              <Button
                variant="danger"
                onClick={handleReject}
                disabled={
                  remake.status === "archived" || pending === "reject"
                }
                aria-label="Reject and archive remake"
              >
                {pending === "reject" ? "Rejecting…" : "Reject"}
              </Button>
              <Button
                variant="secondary"
                onClick={handleRegenerate}
                disabled={
                  processing ||
                  remake.status === "archived" ||
                  pending === "regenerate"
                }
                aria-label={
                  remake.scriptMode === "full"
                    ? "Re-run AI to regenerate full script and timing"
                    : "Re-run AI to regenerate remix package"
                }
              >
                {pending === "regenerate" ? "Queuing…" : "Re-run AI"}
              </Button>
              <Button
                variant="secondary"
                onClick={handleExport}
                disabled={!canExport || pending === "export"}
                aria-label="Export remix zip"
              >
                Export ZIP
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default RemakeStudioPage;

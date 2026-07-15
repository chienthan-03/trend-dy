"use client";

import {
  defaultRemixPolicyChecklist,
  isPolicyChecklistComplete,
  type RemixPackageV1,
  type RemixPipelinePhase,
  type RemixPolicyChecklist,
  type RemixScriptMode,
  type RemixTranscriptV1,
} from "@factory/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PipelineStatusBadge } from "@/components/remix/pipeline-status-badge";
import { PolicyChecklist } from "@/components/remix/policy-checklist";
import { RemakeEditor } from "@/components/remix/remake-editor";
import { RemakeSourcePanel } from "@/components/remix/remake-source-panel";
import { RemakeTranscriptPanel } from "@/components/remix/remake-transcript-panel";
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
  const [policyChecklist, setPolicyChecklist] = useState<RemixPolicyChecklist>(
    defaultRemixPolicyChecklist(),
  );
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const dirtyRef = useRef(false);

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
        setPolicyChecklist(
          data.policyChecklist ?? defaultRemixPolicyChecklist(),
        );
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

  const processing = remake
    ? isProcessingStatus(remake.status) ||
      (remake.pipelinePhase !== "ready" && remake.pipelinePhase !== "failed")
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
        policyChecklist,
      });
      setRemake(updated);
      if (updated.packageJson) setPackageJson(updated.packageJson);
      setPolicyChecklist(
        updated.policyChecklist ?? defaultRemixPolicyChecklist(),
      );
      dirtyRef.current = false;
      setInfo("Changes saved.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleApprove = async () => {
    if (!isPolicyChecklistComplete(policyChecklist)) {
      setError("Complete the policy checklist before approving for export.");
      return;
    }
    setPending("approve");
    setError(null);
    setInfo(null);
    try {
      // Approve reads checklist from DB — persist local checklist first.
      const saved = await api.remix.update(remakeId, {
        ...(packageJson ? { packageJson } : {}),
        policyChecklist,
      });
      setRemake(saved);
      setPolicyChecklist(
        saved.policyChecklist ?? defaultRemixPolicyChecklist(),
      );
      dirtyRef.current = false;

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
  const checklistComplete = isPolicyChecklistComplete(policyChecklist);

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
              <RemakeTranscriptPanel
                transcript={transcript}
                translatedTranscript={translatedTranscript}
                videoDurationSec={remake.videoDurationSec}
                scriptMode={remake.scriptMode as RemixScriptMode}
                pipelinePhase={remake.pipelinePhase}
                onRetranslate={handleRetranslate}
                retranslatePending={pending === "retranslate"}
              />
            </div>
          </Card>

          <Card title="Remix package">
            {packageJson ? (
              <div className="space-y-4">
                {remake.scriptMode === "full" && (
                  <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-800">
                    <p className="font-semibold">Chế độ Script đầy đủ</p>
                    <p>
                      Độ dài narration:{" "}
                      <span className="font-bold">
                        {packageJson.script.narration.length}
                      </span>{" "}
                      ký tự. Mục tiêu gợi ý: ~
                      <span className="font-bold">
                        {Math.round((remake.videoDurationSec || 0) * 10)}
                      </span>{" "}
                      ký tự (10 ký tự/giây).
                    </p>
                  </div>
                )}
                <RemakeEditor
                  packageJson={packageJson}
                  disabled={!canEdit}
                  timingSource={remake.scriptMode === "full" ? "stt" : "estimated"}
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

          <Card title="Policy checklist">
            <PolicyChecklist
              checklist={policyChecklist}
              warnings={remake.policyWarnings}
              disabled={!canEdit}
              onChange={(next) => {
                dirtyRef.current = true;
                setPolicyChecklist(next);
              }}
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
                disabled={
                  !canEdit ||
                  !packageJson ||
                  !checklistComplete ||
                  pending === "approve"
                }
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
            {!checklistComplete && canEdit ? (
              <p className="mt-3 text-xs text-gray-500">
                Complete all policy checklist items to enable approval.
              </p>
            ) : null}
            {checklistComplete && canEdit ? (
              <p className="mt-3 text-xs text-gray-500">
                Checklist is saved automatically when you approve for export.
              </p>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
};

export default RemakeStudioPage;

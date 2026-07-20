"use client";

import {
  RemixScriptMode,
  RemixSegmentRole,
  RemixTranscriptSegment,
  RemixTranscriptV1,
  secToSrtTimestamp,
} from "@factory/shared";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";

type TranscriptView = "source" | "translated";

const ROLE_LABELS: Record<RemixSegmentRole, string> = {
  narration: "Review",
  source: "Giữ gốc",
};

const effectiveRole = (segment: RemixTranscriptSegment): RemixSegmentRole =>
  segment.role === "source" ? "source" : "narration";

interface RemakeTranscriptPanelProps {
  transcript: RemixTranscriptV1 | null;
  translatedTranscript: RemixTranscriptV1 | null;
  videoDurationSec: number | null;
  scriptMode: RemixScriptMode;
  pipelinePhase?: string;
  onRetranslate?: () => void;
  retranslatePending?: boolean;
  onToggleRole?: (index: number, role: RemixSegmentRole) => void;
  onClassify?: () => void;
  classifyPending?: boolean;
  classifyWarning?: string | null;
}

export const RemakeTranscriptPanel = ({
  transcript,
  translatedTranscript,
  videoDurationSec,
  scriptMode,
  pipelinePhase,
  onRetranslate,
  retranslatePending = false,
  onToggleRole,
  onClassify,
  classifyPending = false,
  classifyWarning,
}: RemakeTranscriptPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<TranscriptView>("source");

  if (!transcript && scriptMode === "caption") {
    return null;
  }

  const isTranslating = pipelinePhase === "translating" || retranslatePending;
  const activeTranscript =
    view === "translated" ? translatedTranscript : transcript;

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Transcript</h3>
          <Badge tone={scriptMode === "full" ? "success" : "neutral"}>
            {scriptMode === "full" ? "Script đầy đủ (STT)" : "Caption only"}
          </Badge>
          {translatedTranscript ? (
            <Badge tone="success">Đã dịch VI</Badge>
          ) : isTranslating ? (
            <Badge tone="warning">Đang dịch…</Badge>
          ) : scriptMode === "full" ? (
            <Badge tone="neutral">Chưa dịch</Badge>
          ) : null}
        </div>
        <Button
          variant="ghost"
          onClick={() => setIsOpen(!isOpen)}
          className="h-8 px-2 text-xs"
        >
          {isOpen ? "Thu gọn" : "Xem chi tiết"}
        </Button>
      </div>

      {!transcript ? (
        <p className="text-sm text-gray-500 italic">
          Đang chờ dữ liệu transcript...
        </p>
      ) : (
        isOpen && (
          <div className="mt-4 space-y-4 border-t border-gray-200 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={view === "source" ? "primary" : "ghost"}
                onClick={() => setView("source")}
                className="h-8 px-3 text-xs"
                aria-pressed={view === "source"}
              >
                Gốc (STT)
              </Button>
              <Button
                variant={view === "translated" ? "primary" : "ghost"}
                onClick={() => setView("translated")}
                className="h-8 px-3 text-xs"
                aria-pressed={view === "translated"}
              >
                Đã dịch (VI)
              </Button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {scriptMode === "full" && onRetranslate ? (
                  <Button
                    variant="secondary"
                    onClick={onRetranslate}
                    disabled={isTranslating}
                    className="h-8 px-3 text-xs"
                    aria-label="Dịch transcript sang tiếng Việt"
                  >
                    {isTranslating ? "Đang dịch…" : "Dịch transcript"}
                  </Button>
                ) : null}
                {view === "translated" && translatedTranscript && onClassify ? (
                  <Button
                    variant="secondary"
                    onClick={onClassify}
                    disabled={classifyPending}
                    className="h-8 px-3 text-xs"
                    aria-label="Phân loại lại vai trò các dòng thoại bằng AI"
                  >
                    {classifyPending ? "Đang phân loại…" : "Phân loại lại"}
                  </Button>
                ) : null}
              </div>
            </div>

            {view === "translated" && translatedTranscript ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  <strong>Review</strong> = phát ngôn viên đọc, sẽ được lồng tiếng VI
                  (TTS). <strong>Giữ gốc</strong> = giữ nguyên audio phim gốc, không lồng
                  tiếng. Đổi vai trò sẽ xoá audio VI đã tạo — cần bấm «Tạo audio VI» lại
                  trước khi render.
                </p>
                {classifyWarning ? (
                  <div
                    role="alert"
                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                  >
                    {classifyWarning}
                  </div>
                ) : null}
              </div>
            ) : null}

            {view === "translated" && !activeTranscript ? (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p>
                  {isTranslating
                    ? "Đang dịch transcript sang tiếng Việt (LLM, có thể mất vài phút với video dài)..."
                    : "Chưa có bản dịch. Bấm «Dịch transcript» để dịch chính xác bằng LLM."}
                </p>
                {!isTranslating && (
                  <p className="text-xs text-amber-800">
                    Dùng GPT qua OpenRouter — dịch có ngữ cảnh, sửa lỗi STT nhẹ. Cần{" "}
                    <code className="rounded bg-amber-100 px-1">OPENAI_API_KEY</code>{" "}
                    trong .env.
                  </p>
                )}
              </div>
            ) : activeTranscript ? (
              <>
                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase text-gray-500">
                    Toàn bộ văn bản
                    {view === "source" ? " — ngôn ngữ gốc" : " — tiếng Việt"}
                  </h4>
                  <p className="text-sm leading-relaxed text-gray-800">
                    {activeTranscript.fullText}
                  </p>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase text-gray-500">
                    Phân đoạn (Segments)
                  </h4>
                  <div className="max-h-60 overflow-y-auto rounded border border-gray-200 bg-white">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-gray-50 text-xs font-semibold text-gray-600">
                        <tr>
                          <th className="px-3 py-2">Thời gian</th>
                          <th className="px-3 py-2">Văn bản</th>
                          {view === "translated" ? (
                            <th className="px-3 py-2">Vai trò</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {activeTranscript.segments.map((seg, i) => {
                          const role = effectiveRole(seg);
                          return (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-500">
                                {secToSrtTimestamp(seg.startSec).split(",")[0]}
                              </td>
                              <td className="px-3 py-2 text-gray-700">{seg.text}</td>
                              {view === "translated" ? (
                                <td className="whitespace-nowrap px-3 py-2">
                                  <button
                                    type="button"
                                    tabIndex={0}
                                    aria-pressed={role === "source"}
                                    aria-label={`Đổi vai trò dòng ${i + 1}: hiện tại ${ROLE_LABELS[role]}`}
                                    onClick={() =>
                                      onToggleRole?.(
                                        i,
                                        role === "narration" ? "source" : "narration",
                                      )
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        onToggleRole?.(
                                          i,
                                          role === "narration" ? "source" : "narration",
                                        );
                                      }
                                    }}
                                    disabled={!onToggleRole || classifyPending}
                                    className="disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <Badge
                                      tone={role === "narration" ? "success" : "neutral"}
                                    >
                                      {ROLE_LABELS[role]}
                                    </Badge>
                                  </button>
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-4 text-xs text-gray-500">
                  <span>Thời lượng: {videoDurationSec?.toFixed(1) || 0}s</span>
                  <span>Ngôn ngữ: {activeTranscript.language}</span>
                  <span>Model: {activeTranscript.model}</span>
                  <span>Segments: {activeTranscript.segments.length}</span>
                </div>
              </>
            ) : null}
          </div>
        )
      )}
    </div>
  );
};

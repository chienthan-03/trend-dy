"use client";

import type {
  RemixBannerJson,
  RemixRenderMode,
  RemixRenderPhase,
} from "@factory/shared";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Alert, Badge, Button, Input, Label, Select, Spinner } from "@/components/ui";
import { api, getErrorMessage, type ViralRemake } from "@/lib/api-client";

const VOICE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "alloy", label: "Giọng A (alloy)" },
  { id: "nova", label: "Giọng B (nova)" },
];

const RENDER_PHASE_LABELS: Record<RemixRenderPhase, string> = {
  idle: "Chưa xử lý",
  tts: "Đang tạo audio VI…",
  tts_ready: "Audio VI sẵn sàng",
  rendering: "Đang render video…",
  render_ready: "Video đã render",
  failed: "Render thất bại",
};

const renderPhaseTone = (
  phase: RemixRenderPhase,
): "neutral" | "success" | "danger" | "warning" => {
  if (phase === "render_ready") return "success";
  if (phase === "failed") return "danger";
  if (phase === "tts" || phase === "rendering") return "warning";
  return "neutral";
};

type VideoOutputPanelProps = {
  remake: ViralRemake;
  pipelineReady: boolean;
  onRemakeChange: (remake: ViralRemake) => void;
  onError: (message: string) => void;
  onInfo: (message: string) => void;
};

export const VideoOutputPanel = ({
  remake,
  pipelineReady,
  onRemakeChange,
  onError,
  onInfo,
}: VideoOutputPanelProps) => {
  const [renderMode, setRenderMode] = useState<RemixRenderMode>(remake.renderMode);
  const [voiceId, setVoiceId] = useState<string>(
    remake.ttsVoiceId || VOICE_OPTIONS[0].id,
  );
  const [bannerHeader, setBannerHeader] = useState(remake.bannerJson?.header ?? "");
  const [bannerBottom, setBannerBottom] = useState(remake.bannerJson?.bottom ?? "");
  const [pending, setPending] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const remakeIdRef = useRef(remake.id);

  useEffect(() => {
    if (remakeIdRef.current === remake.id) return;
    remakeIdRef.current = remake.id;
    setRenderMode(remake.renderMode);
    setVoiceId(remake.ttsVoiceId || VOICE_OPTIONS[0].id);
    setBannerHeader(remake.bannerJson?.header ?? "");
    setBannerBottom(remake.bannerJson?.bottom ?? "");
  }, [remake]);

  const isBannerMode = renderMode === "banner_audio";
  const isTtsBusy = remake.renderPhase === "tts" || pending === "tts";
  const isRenderBusy = remake.renderPhase === "rendering" || pending === "render";
  const bannerReady = isBannerMode
    ? Boolean(remake.bannerJson) || Boolean(bannerHeader.trim() && bannerBottom.trim())
    : true;
  const canRender =
    Boolean(remake.mediaVideoKey) && Boolean(remake.mediaDubAudioKey) && bannerReady;
  const canDownload =
    remake.usagePolicy === "approved_for_export" && remake.renderPhase === "render_ready";

  const handleModeChange = async (mode: RemixRenderMode) => {
    setRenderMode(mode);
    setPending("mode");
    try {
      const updated = await api.remix.update(remake.id, { renderMode: mode });
      onRemakeChange(updated);
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleVoiceChange = async (id: string) => {
    setVoiceId(id);
    setPending("voice");
    try {
      const updated = await api.remix.update(remake.id, { ttsVoiceId: id });
      onRemakeChange(updated);
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleGenerateTts = async () => {
    setPending("tts");
    try {
      const result = await api.remix.enqueueTts(remake.id, { voiceId });
      onInfo(`Đã xếp hàng tạo audio VI (job ${result.jobId}).`);
      onRemakeChange({
        ...remake,
        renderPhase: "tts",
        renderError: null,
        ttsFitFailedIndexes: [],
      });
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPending("upload");
    try {
      const result = await api.remix.uploadDubAudio(remake.id, file);
      onRemakeChange({
        ...remake,
        mediaDubAudioKey: result.mediaDubAudioKey,
        dubSource: result.dubSource,
        renderPhase: result.renderPhase,
        renderOutputKey: null,
        renderError: null,
        ttsFitFailedIndexes: [],
      });
      onInfo(
        result.durationMismatch
          ? "Đã tải audio lồng tiếng, nhưng thời lượng khác với video gốc — kiểm tra lại trước khi render."
          : "Đã tải audio lồng tiếng.",
      );
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleGenerateBanners = async () => {
    setPending("banners");
    try {
      const bannerJson = await api.remix.generateBanners(remake.id);
      setBannerHeader(bannerJson.header);
      setBannerBottom(bannerJson.bottom);
      onRemakeChange({ ...remake, bannerJson });
      onInfo("Đã tạo nội dung banner từ AI.");
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const saveBanner = async (): Promise<RemixBannerJson | null> => {
    const bannerJson: RemixBannerJson = {
      header: bannerHeader.trim(),
      bottom: bannerBottom.trim(),
    };
    try {
      const updated = await api.remix.update(remake.id, { bannerJson });
      onRemakeChange(updated);
      return bannerJson;
    } catch (err) {
      onError(getErrorMessage(err));
      return null;
    }
  };

  const handleRenderPreview = async () => {
    setPending("render");
    try {
      if (isBannerMode && !remake.bannerJson) {
        const saved = await saveBanner();
        if (!saved) return;
      }
      const result = await api.remix.enqueueRender(remake.id);
      onInfo(`Đã xếp hàng render video (job ${result.jobId}).`);
      onRemakeChange({ ...remake, renderPhase: "rendering", renderError: null });
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleDownload = () => {
    if (!canDownload) {
      onError("Chỉ có thể tải MP4 khi remake đã được duyệt xuất bản.");
      return;
    }
    window.open(
      api.remix.getRenderUrl(remake.id, { download: true }),
      "_blank",
      "noopener,noreferrer",
    );
    onInfo("Bắt đầu tải video MP4.");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={renderPhaseTone(remake.renderPhase)}>
          <span className="flex items-center gap-1.5">
            {isTtsBusy || isRenderBusy ? <Spinner className="animate-pulse" /> : null}
            {RENDER_PHASE_LABELS[remake.renderPhase] ?? remake.renderPhase}
          </span>
        </Badge>
        {remake.dubSource ? (
          <span className="text-xs text-gray-500">
            Nguồn audio: {remake.dubSource === "upload" ? "Tải lên" : "TTS"}
          </span>
        ) : null}
      </div>

      {remake.renderError ? <Alert>{remake.renderError}</Alert> : null}
      {remake.ttsFitFailedIndexes.length > 0 ? (
        <Alert variant="info">
          {remake.ttsFitFailedIndexes.length} dòng phụ đề vượt tốc độ đọc tối đa (dòng số{" "}
          {remake.ttsFitFailedIndexes.join(", ")}) — kiểm tra lại timing trước khi render.
        </Alert>
      ) : null}

      <fieldset className="grid gap-3 rounded border border-gray-200 p-3">
        <legend className="px-1 text-sm font-medium text-gray-700">Chế độ xuất</legend>
        <div
          className="flex flex-wrap gap-4"
          role="radiogroup"
          aria-label="Chế độ render video"
        >
          <label
            className="flex items-center gap-2 text-sm text-gray-700"
            htmlFor="render-mode-audio"
          >
            <input
              type="radio"
              id="render-mode-audio"
              name="render-mode"
              value="audio_only"
              checked={renderMode === "audio_only"}
              onChange={() => handleModeChange("audio_only")}
              disabled={pending === "mode"}
              className="h-4 w-4"
              aria-label="Chỉ audio VI"
            />
            Chỉ audio VI
          </label>
          <label
            className="flex items-center gap-2 text-sm text-gray-700"
            htmlFor="render-mode-banner"
          >
            <input
              type="radio"
              id="render-mode-banner"
              name="render-mode"
              value="banner_audio"
              checked={renderMode === "banner_audio"}
              onChange={() => handleModeChange("banner_audio")}
              disabled={pending === "mode"}
              className="h-4 w-4"
              aria-label="Banner + audio VI"
            />
            Banner + audio VI
          </label>
        </div>

        <div className="grid gap-1 sm:max-w-xs">
          <Label htmlFor="tts-voice">Giọng đọc</Label>
          <Select
            id="tts-voice"
            value={voiceId}
            onChange={(event) => handleVoiceChange(event.target.value)}
            disabled={pending === "voice"}
            aria-label="Chọn giọng đọc TTS"
          >
            {VOICE_OPTIONS.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label}
              </option>
            ))}
          </Select>
        </div>
      </fieldset>

      <fieldset
        className="grid gap-3 rounded border border-gray-200 p-3"
        disabled={!isBannerMode}
      >
        <legend className="px-1 text-sm font-medium text-gray-700">
          Banner (chỉ dùng khi chọn Banner + audio VI)
        </legend>
        <div className="grid gap-1">
          <Label htmlFor="banner-header">Banner đầu (header)</Label>
          <Input
            id="banner-header"
            value={bannerHeader}
            onChange={(event) => setBannerHeader(event.target.value)}
            disabled={!isBannerMode}
            aria-label="Nội dung banner đầu"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="banner-bottom">Banner cuối (bottom)</Label>
          <Input
            id="banner-bottom"
            value={bannerBottom}
            onChange={(event) => setBannerBottom(event.target.value)}
            disabled={!isBannerMode}
            aria-label="Nội dung banner cuối"
          />
        </div>
        <Button
          variant="secondary"
          onClick={handleGenerateBanners}
          disabled={!isBannerMode || pending === "banners"}
          aria-label="Tạo nội dung banner bằng AI"
          className="w-fit"
        >
          {pending === "banners" ? "Đang tạo…" : "Tạo nội dung banner (AI)"}
        </Button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={handleGenerateTts}
          disabled={!pipelineReady || isTtsBusy}
          aria-label="Tạo audio lồng tiếng VI bằng TTS"
        >
          {isTtsBusy ? "Đang tạo audio…" : "Tạo audio VI"}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
          className="hidden"
          onChange={handleFileSelected}
          tabIndex={-1}
          aria-hidden="true"
        />
        <Button
          variant="secondary"
          onClick={handleUploadClick}
          disabled={pending === "upload"}
          aria-label="Tải lên file audio lồng tiếng"
        >
          {pending === "upload" ? "Đang tải…" : "Tải audio lồng tiếng"}
        </Button>

        <Button
          variant="secondary"
          onClick={handleRenderPreview}
          disabled={!canRender || isRenderBusy}
          aria-label="Render video xem trước"
        >
          {isRenderBusy ? "Đang render…" : "Render preview"}
        </Button>

        <Button
          variant="secondary"
          onClick={handleDownload}
          disabled={!canDownload}
          aria-label="Tải video MP4"
        >
          Download MP4
        </Button>
      </div>

      {remake.renderPhase === "render_ready" ? (
        <div className="grid gap-1">
          <Label htmlFor="render-preview-video">Xem trước video</Label>
          <video
            id="render-preview-video"
            controls
            className="w-full max-w-md rounded-md border border-gray-200 bg-black"
            src={api.remix.getRenderUrl(remake.id)}
          >
            <track kind="captions" />
          </video>
        </div>
      ) : null}
    </div>
  );
};

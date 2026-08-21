"use client";

import type {
  RemixBannerJson,
  RemixRenderMode,
  RemixRenderPhase,
} from "@factory/shared";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Alert, Badge, Button, Input, Label, Select, Spinner } from "@/components/ui";
import { costLabelForAction } from "@/components/remix/remake-cost-estimates";
import { BgmPicker } from "@/components/remix/bgm-picker";
import { formatTtsFitWarning } from "@/components/remix/tts-fit-warning";
import {
  api,
  getErrorMessage,
  type RemixCostEstimate,
  type ViralRemake,
} from "@/lib/api-client";

const VOICE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "alloy", label: "Giọng A (alloy)" },
  { id: "nova", label: "Giọng B (nova)" },
];

type TtsEngine = "piper" | "live";

const ENGINE_OPTIONS: Array<{ id: TtsEngine; label: string }> = [
  { id: "piper", label: "Local (Ngọc Huyền)" },
  { id: "live", label: "Live (Grok)" },
];

const ENGINE_HINTS: Record<TtsEngine, string> = {
  piper: "Chạy local, miễn phí.",
  live: "Dùng credit — tính phí theo ký tự.",
};

const formatSpeedLabel = (value: number): string => `${value}×`;

const TTS_FAST_SPEED_VALUES = [1, 1.15, 1.25, 1.35, 1.45, 1.5, 1.75, 2] as const;

const TTS_SPEED_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0.85, label: "Chậm (0.85×)" },
  ...TTS_FAST_SPEED_VALUES.map((value) => ({
    value,
    label:
      value === 1
        ? "Bình thường (1.0×)"
        : value === 1.15
          ? "Nhanh (1.15×)"
          : value === 1.25
            ? "Khá nhanh (1.25×)"
            : value === 1.35
              ? "Nhanh hơn (1.35×)"
              : value === 1.45
                ? "Cực nhanh (1.45×)"
                : value === 1.5
                  ? "Rất nhanh (1.5×)"
                  : formatSpeedLabel(value),
  })),
];

const TTS_MAX_SPEED_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "server", label: "Theo server" },
  ...TTS_FAST_SPEED_VALUES.map((value) => ({
    value: String(value),
    label: formatSpeedLabel(value),
  })),
];

const resolveTtsSpeedValue = (remake: ViralRemake): number => {
  const speed = remake.ttsSpeed ?? 1;
  return TTS_SPEED_OPTIONS.some((option) => option.value === speed) ? speed : 1;
};

const resolveTtsMaxSpeedSelectValue = (remake: ViralRemake): string => {
  if (remake.ttsMaxSpeed == null) return "server";
  const match = TTS_MAX_SPEED_OPTIONS.find(
    (option) => option.value !== "server" && Number(option.value) === remake.ttsMaxSpeed,
  );
  return match?.value ?? "server";
};

/** Bootstrap: prefer the persisted engine, else server default — never silently assume live. */
const resolveInitialEngine = (
  remake: ViralRemake,
  costEstimate: RemixCostEstimate | null,
): TtsEngine => {
  if (remake.ttsEngine === "piper" || remake.ttsEngine === "live") {
    return remake.ttsEngine;
  }
  return costEstimate?.defaultTtsEngine ?? "piper";
};

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
  costEstimate?: RemixCostEstimate | null;
  onRemakeChange: (remake: ViralRemake) => void;
  onError: (message: string) => void;
  onInfo: (message: string) => void;
};

export const VideoOutputPanel = ({
  remake,
  pipelineReady,
  costEstimate = null,
  onRemakeChange,
  onError,
  onInfo,
}: VideoOutputPanelProps) => {
  const renderPhase: RemixRenderPhase = remake.renderPhase ?? "idle";
  const ttsFitFailedIndexes = remake.ttsFitFailedIndexes ?? [];
  const [renderMode, setRenderMode] = useState<RemixRenderMode>(
    remake.renderMode ?? "audio_only",
  );
  const [voiceId, setVoiceId] = useState<string>(
    remake.ttsVoiceId || VOICE_OPTIONS[0].id,
  );
  const [ttsSpeed, setTtsSpeed] = useState<number>(() => resolveTtsSpeedValue(remake));
  const [ttsMaxSpeed, setTtsMaxSpeed] = useState<string>(() =>
    resolveTtsMaxSpeedSelectValue(remake),
  );
  const [engine, setEngine] = useState<TtsEngine>(() =>
    resolveInitialEngine(remake, costEstimate),
  );
  const [engineCostEstimate, setEngineCostEstimate] =
    useState<RemixCostEstimate | null>(null);
  const [engineCostLoading, setEngineCostLoading] = useState(false);
  const engineTouchedRef = useRef(false);
  const [bannerHeader, setBannerHeader] = useState(remake.bannerJson?.header ?? "");
  const [bannerBottom, setBannerBottom] = useState(remake.bannerJson?.bottom ?? "");
  const [pending, setPending] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const remakeIdRef = useRef(remake.id);

  useEffect(() => {
    if (remakeIdRef.current === remake.id) return;
    remakeIdRef.current = remake.id;
    setRenderMode(remake.renderMode ?? "audio_only");
    setVoiceId(remake.ttsVoiceId || VOICE_OPTIONS[0].id);
    setTtsSpeed(resolveTtsSpeedValue(remake));
    setTtsMaxSpeed(resolveTtsMaxSpeedSelectValue(remake));
    setBannerHeader(remake.bannerJson?.header ?? "");
    setBannerBottom(remake.bannerJson?.bottom ?? "");
    engineTouchedRef.current = false;
    setEngine(resolveInitialEngine(remake, costEstimate));
    setEngineCostEstimate(null);
  }, [remake, costEstimate]);

  // Once the server's default engine arrives, adopt it — but only while the
  // remake has no persisted engine yet and the user hasn't touched the toggle.
  useEffect(() => {
    if (engineTouchedRef.current) return;
    if (remake.ttsEngine === "piper" || remake.ttsEngine === "live") return;
    if (!costEstimate) return;
    setEngine(costEstimate.defaultTtsEngine);
  }, [costEstimate, remake.ttsEngine]);

  const effectiveCostEstimate =
    engineCostEstimate?.resolvedEngine === engine ? engineCostEstimate : costEstimate;
  const ttsCost = costLabelForAction(effectiveCostEstimate, "tts");
  const bannersCost = costLabelForAction(costEstimate, "banners");
  const renderCost = costLabelForAction(costEstimate, "render");

  const isBannerMode = renderMode === "banner_audio";
  const isTtsBusy = renderPhase === "tts" || pending === "tts";
  const isRenderBusy = renderPhase === "rendering" || pending === "render";
  const bannerReady = isBannerMode
    ? Boolean(remake.bannerJson) || Boolean(bannerHeader.trim() && bannerBottom.trim())
    : true;
  const canRender =
    Boolean(remake.mediaVideoKey) && Boolean(remake.mediaDubAudioKey) && bannerReady;
  const canDownload =
    remake.usagePolicy === "approved_for_export" && renderPhase === "render_ready";
  const needsVideoRedownload = !remake.mediaVideoKey;

  const handleRedownloadMedia = async () => {
    setPending("redownload");
    try {
      const result = await api.remix.redownloadMedia(remake.id);
      onInfo(`Đã xếp hàng tải lại video (job ${result.jobId}).`);
      onRemakeChange({
        ...remake,
        status: "running",
        pipelinePhase: "downloading_media",
        renderOutputKey: null,
        renderError: null,
      });
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

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

  const handleTtsSpeedChange = async (value: string) => {
    const nextSpeed = Number(value);
    setTtsSpeed(nextSpeed);
    setPending("ttsSpeed");
    try {
      const currentMax =
        ttsMaxSpeed === "server" ? null : Number(ttsMaxSpeed);
      const shouldBumpMax =
        nextSpeed > 1 && (currentMax == null || currentMax < nextSpeed);
      const bumpedMax = shouldBumpMax ? nextSpeed : undefined;
      if (bumpedMax != null) {
        setTtsMaxSpeed(String(bumpedMax));
      }
      const updated = await api.remix.update(remake.id, {
        ttsSpeed: nextSpeed,
        ...(bumpedMax != null ? { ttsMaxSpeed: bumpedMax } : {}),
      });
      onRemakeChange(updated);
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleTtsMaxSpeedChange = async (value: string) => {
    setTtsMaxSpeed(value);
    setPending("ttsMaxSpeed");
    try {
      const nextMaxSpeed = value === "server" ? null : Number(value);
      const updated = await api.remix.update(remake.id, { ttsMaxSpeed: nextMaxSpeed });
      onRemakeChange(updated);
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleEngineChange = async (nextEngine: TtsEngine) => {
    engineTouchedRef.current = true;
    setEngine(nextEngine);
    if (costEstimate?.resolvedEngine === nextEngine) {
      setEngineCostEstimate(null);
      return;
    }
    setEngineCostLoading(true);
    try {
      const data = await api.remix.getCostEstimate(remake.id, {
        engine: nextEngine,
      });
      setEngineCostEstimate(data);
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setEngineCostLoading(false);
    }
  };

  const handleGenerateTts = async () => {
    setPending("tts");
    try {
      const result = await api.remix.enqueueTts(remake.id, {
        engine,
        voiceId: engine === "live" ? voiceId : undefined,
      });
      onInfo(`Đã xếp hàng tạo audio VI (job ${result.jobId}).`);
      onRemakeChange({
        ...remake,
        renderPhase: "tts",
        renderError: null,
        ttsFitFailedIndexes: [],
        ttsEngine: engine,
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
      if (isBannerMode) {
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
        <Badge tone={renderPhaseTone(renderPhase)}>
          <span className="flex items-center gap-1.5">
            {isTtsBusy || isRenderBusy ? <Spinner className="animate-pulse" /> : null}
            {RENDER_PHASE_LABELS[renderPhase] ?? renderPhase}
          </span>
        </Badge>
        {remake.dubSource ? (
          <span className="text-xs text-gray-500">
            Nguồn audio: {remake.dubSource === "upload" ? "Tải lên" : "TTS"}
          </span>
        ) : null}
      </div>

      {remake.renderError ? <Alert>{remake.renderError}</Alert> : null}
      {remake.scriptMode === "full" && !remake.mediaDubAudioKey ? (
        <Alert variant="info">
          Chưa có audio VI (hoặc đã bị xoá do đổi vai trò dòng thoại / phân loại lại). Bấm
          «Tạo audio VI» trước khi Render preview — Render bị khoá khi chưa có audio.
        </Alert>
      ) : null}
      {ttsFitFailedIndexes.length > 0 ? (
        <Alert variant="info">{formatTtsFitWarning(ttsFitFailedIndexes)}</Alert>
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
          <Label htmlFor="tts-engine">Công cụ TTS</Label>
          <Select
            id="tts-engine"
            value={engine}
            onChange={(event) => handleEngineChange(event.target.value as TtsEngine)}
            disabled={engineCostLoading}
            aria-label="Chọn công cụ tạo audio VI"
          >
            {ENGINE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-gray-500">{ENGINE_HINTS[engine]}</p>
        </div>

        <div
          className="grid gap-1 sm:max-w-xs"
          hidden={engine === "piper"}
        >
          <Label htmlFor="tts-voice">Giọng đọc (Live)</Label>
          <Select
            id="tts-voice"
            value={voiceId}
            onChange={(event) => handleVoiceChange(event.target.value)}
            disabled={pending === "voice" || engine === "piper"}
            aria-label="Chọn giọng đọc TTS Live"
          >
            {VOICE_OPTIONS.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-1 sm:max-w-xs">
          <Label htmlFor="tts-speed">Tốc độ đọc</Label>
          <Select
            id="tts-speed"
            value={String(ttsSpeed)}
            onChange={(event) => handleTtsSpeedChange(event.target.value)}
            disabled={pending === "ttsSpeed"}
            aria-label="Chọn tốc độ đọc TTS"
          >
            {TTS_SPEED_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-gray-500">
            Tăng tốc đều mọi câu. Tổng tốc độ khi khớp khung phụ đề ≈ tốc độ đọc ×
            khớp timeline (ví dụ 1.35 × 1.5 ≈ 2×). Cần «Tạo audio VI» lại sau khi đổi.
          </p>
        </div>

        <div className="grid gap-1 sm:max-w-xs">
          <Label htmlFor="tts-max-speed">Khớp timeline tối đa</Label>
          <Select
            id="tts-max-speed"
            value={ttsMaxSpeed}
            onChange={(event) => handleTtsMaxSpeedChange(event.target.value)}
            disabled={pending === "ttsMaxSpeed"}
            aria-label="Chọn giới hạn tăng tốc khi khớp timeline"
          >
            {TTS_MAX_SPEED_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-gray-500">
            Tăng tốc thêm khi câu VI dài hơn khung phụ đề ZH. Tự nâng tối thiểu bằng
            tốc độ đọc; thử 1.75–2× nếu vẫn lệch. Cần «Tạo audio VI» lại sau khi đổi.
          </p>
        </div>
      </fieldset>

      <BgmPicker
        remake={remake}
        onRemakeChange={onRemakeChange}
        onError={onError}
      />

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
          {bannersCost ? (
            <span className="ml-1 opacity-70">({bannersCost})</span>
          ) : null}
        </Button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        {needsVideoRedownload ? (
          <p className="w-full text-sm text-amber-800" role="status">
            Remake này chưa có video gốc trong storage (download trước khi hệ thống lưu
            mediaVideoKey). Cần <strong>Tải lại video</strong> trước khi Render preview.
          </p>
        ) : null}

        {needsVideoRedownload ? (
          <Button
            variant="secondary"
            onClick={handleRedownloadMedia}
            disabled={pending === "redownload" || remake.pipelinePhase === "downloading_media"}
            aria-label="Tải lại video gốc từ Douyin"
          >
            {pending === "redownload" || remake.pipelinePhase === "downloading_media"
              ? "Đang tải video…"
              : "Tải lại video"}
          </Button>
        ) : null}

        <Button
          onClick={handleGenerateTts}
          disabled={!pipelineReady || isTtsBusy}
          aria-label="Tạo audio lồng tiếng VI bằng TTS"
        >
          {isTtsBusy ? "Đang tạo audio…" : "Tạo audio VI"}
          {ttsCost ? <span className="ml-1 opacity-70">({ttsCost})</span> : null}
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
          {renderCost ? (
            <span className="ml-1 opacity-70">({renderCost})</span>
          ) : null}
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

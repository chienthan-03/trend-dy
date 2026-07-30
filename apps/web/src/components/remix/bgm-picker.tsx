"use client";

import {
  REMIX_BGM_DEFAULT_SPEED,
  REMIX_BGM_DEFAULT_VOLUME,
  type RemixBgmTrack,
  type RemixBgmTrackId,
} from "@factory/shared";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button, Label, Select } from "@/components/ui";
import { api, getErrorMessage, type ViralRemake } from "@/lib/api-client";

type BgmPickerProps = {
  remake: ViralRemake;
  onRemakeChange: (remake: ViralRemake) => void;
  onError: (message: string) => void;
  disabled?: boolean;
};

const NONE_VALUE = "__none__";

const BGM_SPEED_OPTIONS = [
  { value: 0.75, label: "0.75×" },
  { value: 1, label: "1× (bình thường)" },
  { value: 1.25, label: "1.25×" },
  { value: 1.5, label: "1.5×" },
  { value: 1.75, label: "1.75×" },
  { value: 2, label: "2×" },
] as const;

const resolveVolumePercent = (remake: ViralRemake): number =>
  Math.round((remake.bgmVolume ?? REMIX_BGM_DEFAULT_VOLUME) * 100);

const resolveSpeedValue = (remake: ViralRemake): number => {
  const speed = remake.bgmSpeed ?? REMIX_BGM_DEFAULT_SPEED;
  return BGM_SPEED_OPTIONS.some((option) => option.value === speed) ? speed : 1;
};

const resolveStartSec = (remake: ViralRemake): number =>
  Math.max(0, remake.bgmStartSec ?? 0);

const formatTimeLabel = (sec: number): string => {
  const total = Math.max(0, Math.floor(sec));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export const BgmPicker = ({
  remake,
  onRemakeChange,
  onError,
  disabled = false,
}: BgmPickerProps) => {
  const [tracks, setTracks] = useState<RemixBgmTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<RemixBgmTrackId | null>(null);
  const [volumePercent, setVolumePercent] = useState(() => resolveVolumePercent(remake));
  const [speed, setSpeed] = useState(() => resolveSpeedValue(remake));
  const [startSec, setStartSec] = useState(() => resolveStartSec(remake));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedTrackId = remake.bgmTrackId ?? null;
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId);
  const maxStartSec = Math.max(0, Math.floor(selectedTrack?.durationSec ?? 0) - 1);

  useEffect(() => {
    setVolumePercent(resolveVolumePercent(remake));
    setSpeed(resolveSpeedValue(remake));
    setStartSec(resolveStartSec(remake));
  }, [remake.bgmVolume, remake.bgmSpeed, remake.bgmStartSec, remake.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.remix
      .listBgm()
      .then((result) => {
        if (!cancelled) setTracks(result.tracks);
      })
      .catch((error) => {
        if (!cancelled) onError(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onError]);

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingTrackId(null);
  }, []);

  useEffect(() => {
    return () => {
      stopPreview();
      if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
      if (startDebounceRef.current) clearTimeout(startDebounceRef.current);
    };
  }, [stopPreview]);

  const playPreview = (trackId: RemixBgmTrackId) => {
    stopPreview();
    const audio = new Audio(api.remix.getBgmPreviewUrl(trackId));
    audio.playbackRate = speed;
    audioRef.current = audio;
    setPlayingTrackId(trackId);

    const beginPlayback = () => {
      const track = tracks.find((item) => item.id === trackId);
      const maxSec = Math.max(0, (track?.durationSec ?? 0) - 0.1);
      audio.currentTime = Math.min(startSec, maxSec);
      audio.play().catch(() => {
        onError("Không phát được bản nghe thử nhạc nền.");
        stopPreview();
      });
    };

    if (audio.readyState >= 1) {
      beginPlayback();
    } else {
      audio.addEventListener("loadedmetadata", beginPlayback, { once: true });
    }

    audio.onended = () => stopPreview();
  };

  const handlePreview = (trackId: RemixBgmTrackId) => {
    if (playingTrackId === trackId && audioRef.current) {
      stopPreview();
      return;
    }
    playPreview(trackId);
  };

  useEffect(() => {
    if (!audioRef.current || !playingTrackId) return;
    audioRef.current.playbackRate = speed;
    const track = tracks.find((item) => item.id === playingTrackId);
    const maxSec = Math.max(0, (track?.durationSec ?? 0) - 0.1);
    audioRef.current.currentTime = Math.min(startSec, maxSec);
  }, [speed, startSec, playingTrackId, tracks]);

  const handleTrackChange = async (value: string) => {
    const nextTrackId = value === NONE_VALUE ? null : (value as RemixBgmTrackId);
    setPending("track");
    try {
      const updated = await api.remix.update(remake.id, { bgmTrackId: nextTrackId });
      onRemakeChange(updated);
      stopPreview();
    } catch (error) {
      onError(getErrorMessage(error));
    } finally {
      setPending(null);
    }
  };

  const persistVolume = (percent: number) => {
    const bgmVolume = percent / 100;
    setPending("volume");
    api.remix
      .update(remake.id, { bgmVolume })
      .then((updated) => onRemakeChange(updated))
      .catch((error) => onError(getErrorMessage(error)))
      .finally(() => setPending(null));
  };

  const handleVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const percent = Number(event.target.value);
    setVolumePercent(percent);
    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(() => persistVolume(percent), 300);
  };

  const handleSpeedChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextSpeed = Number(event.target.value);
    setSpeed(nextSpeed);
    setPending("speed");
    try {
      const updated = await api.remix.update(remake.id, { bgmSpeed: nextSpeed });
      onRemakeChange(updated);
    } catch (error) {
      onError(getErrorMessage(error));
    } finally {
      setPending(null);
    }
  };

  const persistStartSec = (nextStartSec: number) => {
    setPending("start");
    api.remix
      .update(remake.id, { bgmStartSec: nextStartSec })
      .then((updated) => onRemakeChange(updated))
      .catch((error) => onError(getErrorMessage(error)))
      .finally(() => setPending(null));
  };

  const handleStartChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextStartSec = Number(event.target.value);
    setStartSec(nextStartSec);
    if (startDebounceRef.current) clearTimeout(startDebounceRef.current);
    startDebounceRef.current = setTimeout(() => persistStartSec(nextStartSec), 300);
  };

  const isBusy = pending !== null || loading;
  const hasBgm = selectedTrackId !== null;

  return (
    <fieldset
      className="grid gap-3 rounded border border-gray-200 p-3"
      disabled={disabled || isBusy}
    >
      <legend className="px-1 text-sm font-medium text-gray-700">Nhạc nền</legend>
      <p className="text-xs text-gray-500">
        Bấm «Nghe thử» để chọn nhạc (áp dụng tốc độ và điểm bắt đầu). Audio gốc video
        sẽ tắt — output chỉ còn giọng VI + nhạc nền.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Đang tải thư viện nhạc…</p>
      ) : (
        <div className="grid gap-2">
          <label
            className={`flex items-center gap-2 rounded px-2 py-1.5 ${
              selectedTrackId === null ? "bg-blue-50 ring-1 ring-blue-200" : ""
            }`}
          >
            <input
              type="radio"
              name={`bgm-track-${remake.id}`}
              value={NONE_VALUE}
              checked={selectedTrackId === null}
              onChange={() => handleTrackChange(NONE_VALUE)}
              aria-label="Không dùng nhạc nền"
            />
            <span className="text-sm">Không dùng nhạc nền</span>
          </label>

          {tracks.map((track) => {
            const isSelected = selectedTrackId === track.id;
            const isPlaying = playingTrackId === track.id;
            return (
              <div
                key={track.id}
                className={`flex items-center gap-2 rounded px-2 py-1.5 ${
                  isSelected ? "bg-blue-50 ring-1 ring-blue-200" : ""
                }`}
              >
                <input
                  type="radio"
                  name={`bgm-track-${remake.id}`}
                  value={track.id}
                  checked={isSelected}
                  onChange={() => handleTrackChange(track.id)}
                  aria-label={`Chọn nhạc nền ${track.label}`}
                />
                <span className="flex-1 text-sm">
                  {track.label}
                  {track.durationSec > 0 ? (
                    <span className="ml-1 text-xs text-gray-500">
                      ({formatTimeLabel(track.durationSec)})
                    </span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => handlePreview(track.id)}
                  aria-label={`${isPlaying ? "Dừng" : "Nghe thử"} ${track.label}`}
                >
                  {isPlaying ? "Dừng" : "Nghe thử"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-1 sm:max-w-xs">
        <Label htmlFor={`bgm-volume-${remake.id}`}>
          Volume nhạc nền ({volumePercent}%)
        </Label>
        <input
          id={`bgm-volume-${remake.id}`}
          type="range"
          min={0}
          max={100}
          step={5}
          value={volumePercent}
          onChange={handleVolumeChange}
          disabled={disabled || loading || !hasBgm}
          aria-label="Chỉnh volume nhạc nền khi render"
          className="w-full"
        />
      </div>

      <div className="grid gap-1 sm:max-w-xs">
        <Label htmlFor={`bgm-speed-${remake.id}`}>Tốc độ nhạc nền</Label>
        <Select
          id={`bgm-speed-${remake.id}`}
          value={String(speed)}
          onChange={handleSpeedChange}
          disabled={disabled || loading || !hasBgm}
          aria-label="Chọn tốc độ nhạc nền"
        >
          {BGM_SPEED_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-1 sm:max-w-xs">
        <Label htmlFor={`bgm-start-${remake.id}`}>
          Bắt đầu từ ({formatTimeLabel(startSec)})
          {selectedTrack && selectedTrack.durationSec > 0
            ? ` / ${formatTimeLabel(selectedTrack.durationSec)}`
            : ""}
        </Label>
        <input
          id={`bgm-start-${remake.id}`}
          type="range"
          min={0}
          max={maxStartSec}
          step={1}
          value={Math.min(startSec, maxStartSec)}
          onChange={handleStartChange}
          disabled={disabled || loading || !hasBgm || maxStartSec <= 0}
          aria-label="Chọn điểm bắt đầu nhạc nền"
          className="w-full"
        />
        <p className="text-xs text-gray-500">
          Kéo để chọn đoạn nhạc bắt đầu; «Nghe thử» phát từ điểm này.
        </p>
      </div>
    </fieldset>
  );
};

"use client";

import type { RemixPackageV1 } from "@factory/shared";
import { Input, Label } from "@/components/ui";

const formatSrtPreview = (pkg: RemixPackageV1): string => {
  const cues = pkg.subtitles?.cues ?? [];
  if (cues.length === 0) return "";

  return cues
    .map((cue, index) => {
      const start = cue.start.replace(".", ",");
      const end = cue.end.replace(".", ",");
      return `${index + 1}\n${start} --> ${end}\n${cue.text}\n`;
    })
    .join("\n");
};

type RemakeEditorProps = {
  packageJson: RemixPackageV1;
  disabled?: boolean;
  timingSource?: "estimated" | "stt";
  onChange: (next: RemixPackageV1) => void;
};

export const RemakeEditor = ({
  packageJson,
  disabled = false,
  timingSource,
  onChange,
}: RemakeEditorProps) => {
  const updateBanner = (field: keyof RemixPackageV1["banners"], value: string) => {
    onChange({
      ...packageJson,
      banners: { ...packageJson.banners, [field]: value },
    });
  };

  const updateTitle = (index: number, value: string) => {
    const titles = [...packageJson.packaging.titles];
    titles[index] = value;
    onChange({
      ...packageJson,
      packaging: { ...packageJson.packaging, titles },
    });
  };

  const updatePackaging = (
    field: "description" | "hashtags",
    value: string,
  ) => {
    if (field === "hashtags") {
      const hashtags = value
        .split(/[\s,]+/)
        .map((tag) => tag.trim())
        .filter(Boolean);
      onChange({
        ...packageJson,
        packaging: { ...packageJson.packaging, hashtags },
      });
      return;
    }
    onChange({
      ...packageJson,
      packaging: { ...packageJson.packaging, description: value },
    });
  };

  const srtPreview = formatSrtPreview(packageJson);

  return (
    <div className="space-y-6">
      <fieldset className="grid gap-3 rounded border border-gray-200 p-3" disabled={disabled}>
        <legend className="px-1 text-sm font-medium text-gray-700">Banners</legend>
        <div className="grid gap-1">
          <Label htmlFor="banner-top">Top banner</Label>
          <Input
            id="banner-top"
            value={packageJson.banners.top}
            onChange={(event) => updateBanner("top", event.target.value)}
            disabled={disabled}
            aria-label="Top banner text"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="banner-bottom">Bottom banner</Label>
          <Input
            id="banner-bottom"
            value={packageJson.banners.bottom}
            onChange={(event) => updateBanner("bottom", event.target.value)}
            disabled={disabled}
            aria-label="Bottom banner text"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="banner-watermark">Watermark</Label>
          <Input
            id="banner-watermark"
            value={packageJson.banners.watermark}
            onChange={(event) => updateBanner("watermark", event.target.value)}
            disabled={disabled}
            aria-label="Watermark text"
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded border border-gray-200 p-3" disabled={disabled}>
        <legend className="px-1 text-sm font-medium text-gray-700">Packaging</legend>
        {[0, 1, 2].map((index) => (
          <div key={index} className="grid gap-1">
            <Label htmlFor={`pack-title-${index}`}>Title {index + 1}</Label>
            <Input
              id={`pack-title-${index}`}
              value={packageJson.packaging.titles[index] ?? ""}
              onChange={(event) => updateTitle(index, event.target.value)}
              disabled={disabled}
              aria-label={`Packaging title ${index + 1}`}
            />
          </div>
        ))}
        <div className="grid gap-1">
          <Label htmlFor="pack-description">Description</Label>
          <textarea
            id="pack-description"
            className="min-h-[5rem] w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={packageJson.packaging.description}
            onChange={(event) => updatePackaging("description", event.target.value)}
            disabled={disabled}
            aria-label="Packaging description"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="pack-hashtags">Hashtags (space or comma separated)</Label>
          <Input
            id="pack-hashtags"
            value={packageJson.packaging.hashtags.join(" ")}
            onChange={(event) => updatePackaging("hashtags", event.target.value)}
            disabled={disabled}
            aria-label="Packaging hashtags"
          />
        </div>
      </fieldset>

      <div className="grid gap-1">
        <Label htmlFor="srt-preview">
          Subtitles (SRT preview)
          {timingSource === "stt" && (
            <span className="ml-2 font-normal text-blue-600">
              (Phụ đề timing từ STT)
            </span>
          )}
        </Label>
        <pre
          id="srt-preview"
          className="max-h-64 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800"
          aria-label="SRT subtitle preview"
        >
          {srtPreview || "No subtitle cues yet."}
        </pre>
      </div>
    </div>
  );
};

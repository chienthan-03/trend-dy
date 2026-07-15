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
  const updateScript = (narration: string) => {
    onChange({
      ...packageJson,
      script: { ...packageJson.script, narration },
    });
  };

  const updateHook = (field: keyof RemixPackageV1["hook_3s"], value: string) => {
    onChange({
      ...packageJson,
      hook_3s: { ...packageJson.hook_3s, [field]: value },
    });
  };

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
      <div className="grid gap-1">
        <Label htmlFor="remix-script">Remix script (VN narration)</Label>
        <textarea
          id="remix-script"
          className="min-h-[10rem] w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={packageJson.script.narration}
          onChange={(event) => updateScript(event.target.value)}
          disabled={disabled}
          aria-label="Remix script narration"
        />
        <p className="text-xs text-gray-500">
          Est. {packageJson.script.duration_estimate_sec}s ·{" "}
          {packageJson.script.sections.length} sections
        </p>
      </div>

      <fieldset className="grid gap-3 rounded border border-gray-200 p-3" disabled={disabled}>
        <legend className="px-1 text-sm font-medium text-gray-700">Hook 3s</legend>
        <div className="grid gap-1">
          <Label htmlFor="hook-spoken">Spoken</Label>
          <Input
            id="hook-spoken"
            value={packageJson.hook_3s.spoken}
            onChange={(event) => updateHook("spoken", event.target.value)}
            disabled={disabled}
            aria-label="Hook spoken text"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="hook-on-screen">On screen</Label>
          <Input
            id="hook-on-screen"
            value={packageJson.hook_3s.on_screen}
            onChange={(event) => updateHook("on_screen", event.target.value)}
            disabled={disabled}
            aria-label="Hook on-screen text"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="hook-visual">Visual hint</Label>
          <Input
            id="hook-visual"
            value={packageJson.hook_3s.visual_hint}
            onChange={(event) => updateHook("visual_hint", event.target.value)}
            disabled={disabled}
            aria-label="Hook visual hint"
          />
        </div>
      </fieldset>

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

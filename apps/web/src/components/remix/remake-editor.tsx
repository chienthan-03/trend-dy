"use client";

import type { RemixPackageV1 } from "@factory/shared";
import { Input, Label } from "@/components/ui";

type RemakeEditorProps = {
  packageJson: RemixPackageV1;
  disabled?: boolean;
  onChange: (next: RemixPackageV1) => void;
};

export const RemakeEditor = ({
  packageJson,
  disabled = false,
  onChange,
}: RemakeEditorProps) => {
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

  return (
    <div className="space-y-6">
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
    </div>
  );
};

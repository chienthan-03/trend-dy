"use client";

import type { RemixPolicyChecklist } from "@factory/shared";
import { Alert } from "@/components/ui";

const CHECKLIST_ITEMS: Array<{
  key: keyof RemixPolicyChecklist;
  label: string;
}> = [
  {
    key: "hasStudioBrand",
    label: "Banner/watermark includes studio brand",
  },
  {
    key: "voiceWillBeRerecorded",
    label: "Voice will be re-recorded (Phase A)",
  },
  {
    key: "noFullReupload",
    label: "No full re-upload of source video",
  },
  { key: "leadApproved", label: "Lead approval (admin or lead role)" },
];

type PolicyChecklistProps = {
  checklist: RemixPolicyChecklist;
  warnings: string[];
  disabled?: boolean;
  onChange: (next: RemixPolicyChecklist) => void;
};

export const PolicyChecklist = ({
  checklist,
  warnings,
  disabled = false,
  onChange,
}: PolicyChecklistProps) => {
  const handleToggle = (key: keyof RemixPolicyChecklist) => {
    onChange({ ...checklist, [key]: !checklist[key] });
  };

  return (
    <div className="space-y-4">
      {warnings.length > 0 ? (
        <Alert variant="info">
          <span className="font-medium">Policy warnings: </span>
          {warnings.join(" · ")}
        </Alert>
      ) : null}

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="sr-only">Export policy checklist</legend>
        {CHECKLIST_ITEMS.map((item) => {
          const id = `policy-${item.key}`;
          return (
            <label
              key={item.key}
              htmlFor={id}
              className="flex cursor-pointer items-start gap-2 text-sm text-gray-700"
            >
              <input
                id={id}
                type="checkbox"
                checked={checklist[item.key]}
                onChange={() => handleToggle(item.key)}
                disabled={disabled}
                className="mt-0.5"
                aria-label={item.label}
              />
              <span>{item.label}</span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
};

"use client";

import { FormEvent, useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { api, getErrorMessage, type RemixTriggerResult } from "@/lib/api-client";

type PasteLinkBarProps = {
  projectId: string;
  onSuccess?: (result: RemixTriggerResult) => void;
  onError?: (message: string) => void;
};

export const PasteLinkBar = ({
  projectId,
  onSuccess,
  onError,
}: PasteLinkBarProps) => {
  const [shareUrl, setShareUrl] = useState("");
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = shareUrl.trim();
    if (!trimmed || !projectId) return;

    setPending(true);
    try {
      const result = await api.remix.trigger({
        projectId,
        shareUrl: trimmed,
      });
      setShareUrl("");
      onSuccess?.(result);
    } catch (err) {
      onError?.(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3"
      aria-label="Paste Douyin link to remix"
    >
      <div className="min-w-[16rem] flex-1 grid gap-1">
        <Label htmlFor="paste-link-url">Paste link</Label>
        <Input
          id="paste-link-url"
          type="url"
          value={shareUrl}
          onChange={(event) => setShareUrl(event.target.value)}
          placeholder="https://v.douyin.com/…"
          aria-label="Douyin share URL"
          disabled={pending || !projectId}
        />
      </div>
      <Button
        type="submit"
        disabled={pending || !projectId || !shareUrl.trim()}
        aria-label="Trigger remix from pasted link"
      >
        {pending ? "Triggering…" : "Trigger"}
      </Button>
    </form>
  );
};

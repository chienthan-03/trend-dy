"use client";

import { GENRES, type Genre } from "@factory/shared";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { StoryNav } from "@/components/story-nav";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  formatGenre,
  Label,
  PageHeader,
  Select,
  StatusBadge,
} from "@/components/ui";
import {
  api,
  GENERATION_TYPES,
  getErrorMessage,
  type GenerationOutput,
  type GenerationType,
  type Story,
} from "@/lib/api-client";

const OUTPUT_STATUSES = [
  "ready",
  "reviewed",
  "approved",
  "rejected",
  "archived",
] as const;

const StoryGeneratePage = () => {
  const params = useParams<{ storyId: string }>();
  const storyId = params.storyId;
  const [story, setStory] = useState<Story | null>(null);
  const [outputs, setOutputs] = useState<GenerationOutput[]>([]);
  const [genType, setGenType] = useState<GenerationType>("pack.title");
  const [inspireEnabled, setInspireEnabled] = useState(false);
  const [inspireGenre, setInspireGenre] = useState<Genre>(GENRES[0]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const [storyData, outputList] = await Promise.all([
        api.stories.get(storyId),
        api.stories.listOutputs(storyId),
      ]);
      setStory(storyData);
      setOutputs(outputList);
      const nextEditing: Record<string, string> = {};
      for (const output of outputList) {
        nextEditing[output.id] = output.content ?? "";
      }
      setEditing(nextEditing);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [storyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending("generate");
    setError(null);
    setInfo(null);
    try {
      const options = inspireEnabled
        ? { inspireFromViral: { inspireGenre } }
        : undefined;
      const result = await api.stories.generate(storyId, {
        type: genType,
        options,
      });
      setInfo(`Generation queued (job ${result.jobId})`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleStatusChange = async (outputId: string, status: string) => {
    setPending(`status-${outputId}`);
    setError(null);
    try {
      await api.outputs.update(outputId, { status });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleContentSave = async (outputId: string) => {
    setPending(`content-${outputId}`);
    setError(null);
    try {
      await api.outputs.update(outputId, { content: editing[outputId] });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleExport = async () => {
    setPending("export");
    setError(null);
    setInfo(null);
    try {
      const readyIds = outputs
        .filter((o) => o.status === "approved" || o.status === "ready")
        .map((o) => o.id);
      const result = await api.stories.exportZip(
        storyId,
        readyIds.length > 0 ? readyIds : undefined,
      );
      setInfo("Export ready — opening download.");
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-6">
      <StoryNav storyId={storyId} />
      <PageHeader
        title={story?.title ?? "Generate"}
        description="Enqueue AI outputs, review status, and export."
        actions={
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={pending === "export" || outputs.length === 0}
            aria-label="Export story zip"
          >
            {pending === "export" ? "Exporting…" : "Export ZIP"}
          </Button>
        }
      />

      {error ? <Alert>{error}</Alert> : null}
      {info ? <Alert variant="info">{info}</Alert> : null}

      <Card title="Generate">
        <form onSubmit={handleGenerate} className="grid max-w-lg gap-4">
          <div className="grid gap-1">
            <Label htmlFor="gen-type">Output type</Label>
            <Select
              id="gen-type"
              value={genType}
              onChange={(e) => setGenType(e.target.value as GenerationType)}
            >
              {GENERATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </div>

          <fieldset className="rounded border border-gray-200 p-3">
            <legend className="px-1 text-sm font-medium text-gray-700">
              Viral inspire (S/A packaging hints)
            </legend>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={inspireEnabled}
                onChange={(e) => setInspireEnabled(e.target.checked)}
                aria-label="Enable viral inspire"
              />
              Use viral S/A captions for inspire
            </label>
            {inspireEnabled ? (
              <div className="mt-3 grid gap-1">
                <Label htmlFor="inspire-genre">Inspire genre</Label>
                <Select
                  id="inspire-genre"
                  value={inspireGenre}
                  onChange={(e) => setInspireGenre(e.target.value as Genre)}
                >
                  {GENRES.map((genre) => (
                    <option key={genre} value={genre}>
                      {formatGenre(genre)}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </fieldset>

          <Button type="submit" disabled={pending === "generate"}>
            {pending === "generate" ? "Queuing…" : "Generate"}
          </Button>
        </form>
      </Card>

      <Card title={`Outputs (${outputs.length})`}>
        {outputs.length === 0 ? (
          <EmptyState>No outputs yet. Run generate above.</EmptyState>
        ) : (
          <ul className="space-y-4">
            {outputs.map((output) => (
              <li
                key={output.id}
                className="rounded-lg border border-gray-200 p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{output.type}</span>
                    <StatusBadge status={output.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={output.status}
                      onChange={(e) =>
                        handleStatusChange(output.id, e.target.value)
                      }
                      disabled={pending === `status-${output.id}`}
                      aria-label={`Status for ${output.type}`}
                      className="w-auto min-w-[8rem]"
                    >
                      {OUTPUT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <textarea
                  className="min-h-[6rem] w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={editing[output.id] ?? ""}
                  onChange={(e) =>
                    setEditing((prev) => ({
                      ...prev,
                      [output.id]: e.target.value,
                    }))
                  }
                  aria-label={`Content for ${output.type}`}
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => handleContentSave(output.id)}
                    disabled={pending === `content-${output.id}`}
                  >
                    {pending === `content-${output.id}` ? "Saving…" : "Save content"}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {new Date(output.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default StoryGeneratePage;

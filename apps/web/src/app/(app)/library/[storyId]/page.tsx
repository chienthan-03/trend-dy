"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { StoryNav } from "@/components/story-nav";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  StatusBadge,
} from "@/components/ui";
import {
  api,
  getErrorMessage,
  type Chapter,
  type Story,
} from "@/lib/api-client";

const StoryOverviewPage = () => {
  const params = useParams<{ storyId: string }>();
  const storyId = params.storyId;
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [importUrl, setImportUrl] = useState("");
  const [status, setStatus] = useState("draft");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [storyData, chapterList] = await Promise.all([
        api.stories.get(storyId),
        api.stories.listChapters(storyId),
      ]);
      setStory(storyData);
      setStatus(storyData.status);
      setChapters(chapterList);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [storyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPending("import-file");
    setError(null);
    try {
      await api.stories.importFile(storyId, file);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
      event.target.value = "";
    }
  };

  const handleUrlImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!importUrl.trim()) return;
    setPending("import-url");
    setError(null);
    try {
      await api.stories.importUrl(storyId, importUrl.trim());
      setImportUrl("");
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleUnderstand = async () => {
    setPending("understand");
    setError(null);
    try {
      await api.stories.understand(storyId);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const handleStatusSave = async () => {
    setPending("status");
    setError(null);
    try {
      const updated = await api.stories.update(storyId, { status });
      setStory(updated);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  if (!story) {
    return (
      <div className="space-y-4">
        <StoryNav storyId={storyId} />
        {error ? <Alert>{error}</Alert> : <p className="text-sm text-gray-500">Loading…</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StoryNav storyId={storyId} />
      <PageHeader title={story.title} description="Overview, import, and understand." />

      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Status">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid flex-1 gap-1">
              <Label htmlFor="story-status">Workflow status</Label>
              <Select
                id="story-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="draft">draft</option>
                <option value="importing">importing</option>
                <option value="understanding">understanding</option>
                <option value="ready">ready</option>
                <option value="archived">archived</option>
              </Select>
            </div>
            <Button
              onClick={handleStatusSave}
              disabled={pending === "status"}
            >
              Save
            </Button>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Current: <StatusBadge status={story.status} />
          </p>
        </Card>

        <Card title="Understand">
          <p className="mb-3 text-sm text-gray-600">
            Enqueue graph extraction for imported chapters.
          </p>
          <Button
            onClick={handleUnderstand}
            disabled={pending === "understand" || chapters.length === 0}
            aria-label="Trigger understand job"
          >
            {pending === "understand" ? "Queuing…" : "Run understand"}
          </Button>
        </Card>
      </div>

      <Card title="Import">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <Label htmlFor="import-file">Upload TXT or EPUB</Label>
            <Input
              id="import-file"
              type="file"
              accept=".txt,.epub,text/plain,application/epub+zip"
              className="mt-1"
              onChange={handleFileImport}
              disabled={pending === "import-file"}
              aria-label="Upload file"
            />
          </div>
          <form onSubmit={handleUrlImport} className="grid gap-2">
            <Label htmlFor="import-url">Import from URL</Label>
            <Input
              id="import-url"
              type="url"
              placeholder="https://…"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={pending === "import-url" || !importUrl.trim()}
            >
              {pending === "import-url" ? "Importing…" : "Import URL"}
            </Button>
          </form>
        </div>
      </Card>

      <Card title={`Chapters (${chapters.length})`}>
        {chapters.length === 0 ? (
          <EmptyState>No chapters yet. Import content to get started.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {chapters.map((chapter) => (
              <li
                key={chapter.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0"
              >
                <span>
                  <span className="font-medium">#{chapter.number}</span>
                  {chapter.title ? ` · ${chapter.title}` : ""}
                </span>
                <span className="text-gray-500">
                  <StatusBadge status={chapter.status} />
                  {chapter.wordCount != null ? ` · ${chapter.wordCount} words` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default StoryOverviewPage;

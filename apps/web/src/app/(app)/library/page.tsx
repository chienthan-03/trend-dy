"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { api, getErrorMessage, type Story } from "@/lib/api-client";
import { useProject } from "@/lib/project-context";

const LibraryPage = () => {
  const { projectId } = useProject();
  const [stories, setStories] = useState<Story[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const loadStories = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    try {
      const list = await api.stories.list(projectId);
      setStories(list);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [projectId]);

  useEffect(() => {
    void loadStories();
  }, [loadStories]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId) return;
    setPending(true);
    setError(null);
    try {
      await api.stories.create({ projectId, title });
      setTitle("");
      await loadStories();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Library"
        description="Stories, chapters, and import actions."
      />

      {error ? <Alert>{error}</Alert> : null}

      <Card title="New story">
        <form
          onSubmit={handleCreate}
          className="flex max-w-lg flex-wrap items-end gap-3"
          aria-label="Create story"
        >
          <div className="min-w-[16rem] flex-1 grid gap-1">
            <Label htmlFor="story-title">Title</Label>
            <Input
              id="story-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My web novel"
            />
          </div>
          <Button type="submit" disabled={pending || !projectId}>
            {pending ? "Creating…" : "Create story"}
          </Button>
        </form>
      </Card>

      <Card title="Stories">
        {stories.length === 0 ? (
          <EmptyState>No stories yet. Create one to start importing.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {stories.map((story) => (
              <li key={story.id} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={`/library/${story.id}`}
                  className="group flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <p className="font-medium group-hover:underline">
                      {story.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {story.language} · updated{" "}
                      {new Date(story.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={story.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default LibraryPage;

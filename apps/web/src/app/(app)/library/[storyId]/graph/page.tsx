"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { StoryNav } from "@/components/story-nav";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { api, getErrorMessage, type Story, type StoryGraph } from "@/lib/api-client";

const StoryGraphPage = () => {
  const params = useParams<{ storyId: string }>();
  const storyId = params.storyId;
  const [story, setStory] = useState<Story | null>(null);
  const [graph, setGraph] = useState<StoryGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [storyData, graphData] = await Promise.all([
        api.stories.get(storyId),
        api.stories.graph(storyId),
      ]);
      setStory(storyData);
      setGraph(graphData);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [storyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <StoryNav storyId={storyId} />
      <PageHeader
        title={story?.title ?? "Story graph"}
        description="Read-only story graph from understand pipeline."
      />

      {error ? <Alert>{error}</Alert> : null}

      {!graph ? (
        <p className="text-sm text-gray-500">Loading graph…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={`Characters (${graph.characters.length})`}>
            {graph.characters.length === 0 ? (
              <EmptyState>No characters extracted yet.</EmptyState>
            ) : (
              <ul className="space-y-2 text-sm">
                {graph.characters.map((character) => (
                  <li key={character.id}>
                    <span className="font-medium">{character.name}</span>
                    {character.role ? (
                      <span className="text-gray-500"> · {character.role}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Arcs (${graph.arcs.length})`}>
            {graph.arcs.length === 0 ? (
              <EmptyState>No arcs yet.</EmptyState>
            ) : (
              <ul className="space-y-3 text-sm">
                {graph.arcs.map((arc) => (
                  <li key={arc.id}>
                    <p className="font-medium">{arc.title}</p>
                    {arc.summary ? (
                      <p className="text-gray-600">{arc.summary}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Events (${graph.events.length})`}>
            {graph.events.length === 0 ? (
              <EmptyState>No events yet.</EmptyState>
            ) : (
              <ul className="max-h-96 space-y-3 overflow-y-auto text-sm">
                {graph.events.map((event) => (
                  <li key={event.id} className="rounded border border-gray-100 p-2">
                    <p className="font-medium">{event.type}</p>
                    {event.summary ? (
                      <p className="text-gray-600">{event.summary}</p>
                    ) : null}
                    {event.characters.length > 0 ? (
                      <p className="mt-1 text-xs text-gray-500">
                        {event.characters.map((c) => c.name).join(", ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Relationships (${graph.relationships.length})`}>
            {graph.relationships.length === 0 ? (
              <EmptyState>No relationships yet.</EmptyState>
            ) : (
              <ul className="space-y-2 text-sm">
                {graph.relationships.map((rel) => (
                  <li key={rel.id}>
                    <span className="font-medium">{rel.from.name}</span>
                    <span className="text-gray-500"> → {rel.type} → </span>
                    <span className="font-medium">{rel.to.name}</span>
                    {rel.description ? (
                      <p className="text-gray-600">{rel.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};

export default StoryGraphPage;

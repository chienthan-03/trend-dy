"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { api, getErrorMessage, type Job } from "@/lib/api-client";

const JobsPage = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await api.jobs.list();
      setJobs(list);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const handleRetry = async (jobId: string) => {
    setRetrying(jobId);
    setError(null);
    try {
      await api.jobs.retry(jobId);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description="Queue status, errors, and retry for failed jobs."
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      {error ? <Alert>{error}</Alert> : null}

      <Card>
        {jobs.length === 0 ? (
          <EmptyState>No jobs yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Story</th>
                  <th className="px-2 py-2 font-medium">Attempts</th>
                  <th className="px-2 py-2 font-medium">Created</th>
                  <th className="px-2 py-2 font-medium">Error</th>
                  <th className="px-2 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-gray-100">
                    <td className="px-2 py-2 font-mono text-xs">{job.type}</td>
                    <td className="px-2 py-2">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-2 py-2">
                      {job.storyId ? (
                        <Link
                          href={`/library/${job.storyId}`}
                          className="text-blue-700 hover:underline"
                        >
                          {job.storyId.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">{job.attempts}</td>
                    <td className="px-2 py-2 text-gray-600">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="max-w-[12rem] truncate px-2 py-2 text-red-600">
                      {job.error ?? "—"}
                    </td>
                    <td className="px-2 py-2">
                      {job.status === "failed" ? (
                        <Button
                          variant="secondary"
                          onClick={() => handleRetry(job.id)}
                          disabled={retrying === job.id}
                          aria-label={`Retry job ${job.id}`}
                        >
                          {retrying === job.id ? "Retrying…" : "Retry"}
                        </Button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default JobsPage;

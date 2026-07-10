"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Source = {
  id: string;
  projectId: string;
  name: string;
  type: string;
  baseUrl: string | null;
  licenseStatus: string;
};

const DiscoveryPage = () => {
  const [sources, setSources] = useState<Source[]>([]);
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("manual");
  const [baseUrl, setBaseUrl] = useState("");
  const [licenseStatus, setLicenseStatus] = useState("pending");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const loadSources = useCallback(async () => {
    setError(null);
    try {
      const query = projectId
        ? `?projectId=${encodeURIComponent(projectId)}`
        : "";
      const response = await fetch(`/api/v1/sources${query}`, {
        credentials: "include",
      });
      if (!response.ok) {
        setError("Failed to load sources (are you signed in?)");
        return;
      }
      const data = (await response.json()) as Source[];
      setSources(data);
    } catch {
      setError("Unable to reach the API");
    }
  }, [projectId]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/v1/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId,
          name,
          type,
          ...(baseUrl ? { baseUrl } : {}),
          licenseStatus,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const message = Array.isArray(body?.message)
          ? body.message.join(", ")
          : body?.message;
        setError(message ?? "Failed to create source");
        return;
      }

      setName("");
      setBaseUrl("");
      setLicenseStatus("pending");
      await loadSources();
    } catch {
      setError("Unable to reach the API");
    } finally {
      setPending(false);
    }
  };

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "1.5rem",
        maxWidth: "48rem",
        margin: "0 auto",
        display: "grid",
        gap: "1.5rem",
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Discovery</h1>
        <p style={{ margin: "0.5rem 0 0", color: "#555" }}>
          Manual sources register (stub — polish in Task 14)
        </p>
      </header>

      <section aria-labelledby="sources-form-heading">
        <h2 id="sources-form-heading" style={{ fontSize: "1.125rem" }}>
          Register source
        </h2>
        <form
          onSubmit={handleSubmit}
          aria-label="Create source"
          style={{ display: "grid", gap: "0.75rem", maxWidth: "28rem" }}
        >
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span>Project ID</span>
            <input
              name="projectId"
              required
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              aria-label="Project ID"
            />
          </label>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span>Name</span>
            <input
              name="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Source name"
            />
          </label>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span>Type</span>
            <select
              name="type"
              value={type}
              onChange={(event) => setType(event.target.value)}
              aria-label="Source type"
            >
              <option value="manual">manual</option>
              <option value="url">url</option>
              <option value="rss">rss</option>
              <option value="douyin_board">douyin_board</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span>Base URL (optional)</span>
            <input
              name="baseUrl"
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              aria-label="Base URL"
            />
          </label>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span>License status</span>
            <select
              name="licenseStatus"
              value={licenseStatus}
              onChange={(event) => setLicenseStatus(event.target.value)}
              aria-label="License status"
            >
              <option value="pending">pending</option>
              <option value="cleared">cleared</option>
              <option value="rejected">rejected</option>
              <option value="research_only">research_only</option>
            </select>
          </label>
          <button type="submit" disabled={pending} aria-label="Create source">
            {pending ? "Creating…" : "Create source"}
          </button>
        </form>
      </section>

      {error ? (
        <p role="alert" style={{ color: "#b00020", margin: 0 }}>
          {error}
        </p>
      ) : null}

      <section aria-labelledby="sources-list-heading">
        <h2 id="sources-list-heading" style={{ fontSize: "1.125rem" }}>
          Sources
        </h2>
        {sources.length === 0 ? (
          <p style={{ color: "#555" }}>No sources yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {sources.map((source) => (
              <li
                key={source.id}
                style={{
                  padding: "0.75rem 0",
                  borderBottom: "1px solid #ddd",
                }}
              >
                <strong>{source.name}</strong>
                <span style={{ color: "#555" }}>
                  {" "}
                  · {source.type} · {source.licenseStatus}
                </span>
                {source.baseUrl ? (
                  <div style={{ fontSize: "0.875rem", color: "#666" }}>
                    {source.baseUrl}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
};

export default DiscoveryPage;

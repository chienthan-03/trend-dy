import type {
  RemixPackageV1,
  RemixPolicyChecklist,
  RemixTranscriptV1,
} from "@factory/shared";

const API_BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API error ${status}`);
    this.name = "ApiError";
  }
}

const parseErrorMessage = (body: unknown): string => {
  if (!body || typeof body !== "object") return "Request failed";
  const record = body as { message?: string | string[]; error?: { message?: string } };
  if (Array.isArray(record.message)) return record.message.join(", ");
  if (typeof record.message === "string") return record.message;
  if (record.error?.message) return record.error.message;
  return "Request failed";
};

export const apiFetch = async <T>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const isFormData = options.body instanceof FormData;
  const headers: HeadersInit = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    const message = parseErrorMessage(error.body);
    if (error.status === 503) {
      if (/remix/i.test(message)) {
        return "Remix is disabled on the server. Set REMIX_ENABLED=true to enable Chế biến.";
      }
      return message || "Service temporarily unavailable. Try again later.";
    }
    return message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong";
};

export type Project = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type Source = {
  id: string;
  projectId: string;
  name: string;
  type: string;
  baseUrl: string | null;
  licenseStatus: string;
};

export type ViralBoard = {
  id: string;
  projectId: string;
  boardKey: string;
  label: string;
  genre: string;
  enabled: boolean;
  crawlIntervalSec: number;
  lastCrawledAt: string | null;
};

export type ViralItem = {
  id: string;
  boardId: string;
  title: string;
  caption: string | null;
  authorHandle: string | null;
  hashtags: string[];
  tier: string | null;
  trendScore: number | null;
  rankPosition: number | null;
  genres: string[];
  usagePolicy: string;
  crawledAt: string;
  coverUrl: string | null;
  stats: Record<string, number> | null;
};

export type ViralCrawlRun = {
  id: string;
  boardId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  itemCount: number | null;
  error: string | null;
};

export type ViralRemake = {
  id: string;
  projectId: string;
  viralItemId: string | null;
  externalVideoId: string;
  sourceUrl: string | null;
  sourceSnapshot: unknown;
  genre: string | null;
  status: string;
  scriptMode: string;
  pipelinePhase: string;
  videoDurationSec: number | null;
  usagePolicy: string;
  packageJson: RemixPackageV1 | null;
  policyChecklist: RemixPolicyChecklist | null;
  policyWarnings: string[];
  editorNotes: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  createdAt: string;
  updatedAt: string;
};

export type RemixTriggerResult = {
  remakeId: string;
  jobId: string;
};

export type RemixTranscriptResponse = {
  transcript: RemixTranscriptV1 | null;
  translatedTranscript: RemixTranscriptV1 | null;
  pipelinePhase: string;
  videoDurationSec: number | null;
  scriptMode: string;
};

export type Story = {
  id: string;
  projectId: string;
  title: string;
  language: string;
  genre: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type Chapter = {
  id: string;
  storyId: string;
  number: number;
  title: string | null;
  status: string;
  wordCount: number | null;
};

export type StoryGraph = {
  characters: Array<{ id: string; name: string; role: string | null }>;
  arcs: Array<{ id: string; title: string; summary: string | null; orderIndex: number }>;
  events: Array<{
    id: string;
    type: string;
    summary: string | null;
    importance: number | null;
    characters: Array<{ id: string; name: string; role: string | null }>;
  }>;
  relationships: Array<{
    id: string;
    type: string;
    description: string | null;
    from: { id: string; name: string };
    to: { id: string; name: string };
  }>;
};

export type GenerationOutput = {
  id: string;
  storyId: string;
  type: string;
  content: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type Job = {
  id: string;
  type: string;
  status: string;
  storyId: string | null;
  payload?: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export const GENERATION_TYPES = [
  "summary.chapter",
  "summary.arc",
  "script.narration",
  "outline.video",
  "pack.title",
  "pack.thumbnail_text",
  "pack.description",
  "pack.tags",
  "pack.hook_3s",
] as const;

export type GenerationType = (typeof GENERATION_TYPES)[number];

export type UsageReport = {
  totals: {
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
  };
  today: {
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
  };
  budget: {
    dailyCapUsd: number | null;
    todaySpendUsd: number;
    remainingUsd: number | null;
    exceeded: boolean;
  };
  byDay: Array<{
    date: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
  }>;
  byModel: Array<{
    model: string;
    provider: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    count: number;
  }>;
};

export const api = {
  projects: {
    list: () => apiFetch<Project[]>("/projects"),
    create: (body: { name: string; slug: string }) =>
      apiFetch<Project>("/projects", { method: "POST", body: JSON.stringify(body) }),
  },
  sources: {
    list: (projectId?: string) =>
      apiFetch<Source[]>(
        `/sources${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`,
      ),
    create: (body: {
      projectId: string;
      name: string;
      type: string;
      baseUrl?: string;
      licenseStatus: string;
    }) =>
      apiFetch<Source>("/sources", { method: "POST", body: JSON.stringify(body) }),
  },
  viral: {
    listBoards: (projectId?: string) =>
      apiFetch<ViralBoard[]>(
        `/viral/boards${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`,
      ),
    createBoard: (body: {
      projectId: string;
      boardKey: string;
      label: string;
      genre: string;
      enabled?: boolean;
    }) =>
      apiFetch<ViralBoard>("/viral/boards", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    triggerCrawl: (boardId: string) =>
      apiFetch<{ jobId: string; status: string }>(`/viral/boards/${boardId}/crawl`, {
        method: "POST",
      }),
    listItems: (params: {
      projectId?: string;
      genre?: string;
      tier?: string;
      boardId?: string;
    }) => {
      const query = new URLSearchParams();
      if (params.projectId) query.set("projectId", params.projectId);
      if (params.genre) query.set("genre", params.genre);
      if (params.tier) query.set("tier", params.tier);
      if (params.boardId) query.set("boardId", params.boardId);
      const qs = query.toString();
      return apiFetch<ViralItem[]>(`/viral/items${qs ? `?${qs}` : ""}`);
    },
    listCrawlRuns: (boardId?: string) =>
      apiFetch<ViralCrawlRun[]>(
        `/viral/crawl-runs${boardId ? `?boardId=${encodeURIComponent(boardId)}` : ""}`,
      ),
  },
  remix: {
    trigger: (body: { projectId: string; viralItemId?: string; shareUrl?: string }) =>
      apiFetch<RemixTriggerResult>("/viral/remix", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    list: (params: { projectId: string; status?: string; viralItemId?: string }) => {
      const query = new URLSearchParams();
      query.set("projectId", params.projectId);
      if (params.status) query.set("status", params.status);
      if (params.viralItemId) query.set("viralItemId", params.viralItemId);
      const qs = query.toString();
      return apiFetch<ViralRemake[]>(`/viral/remix${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) => apiFetch<ViralRemake>(`/viral/remix/${id}`),
    update: (
      id: string,
      body: {
        packageJson?: RemixPackageV1;
        policyChecklist?: RemixPolicyChecklist;
        editorNotes?: string;
      },
    ) =>
      apiFetch<ViralRemake>(`/viral/remix/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    approve: (id: string) =>
      apiFetch<ViralRemake>(`/viral/remix/${id}/approve`, { method: "POST" }),
    reject: (id: string) =>
      apiFetch<ViralRemake>(`/viral/remix/${id}/reject`, { method: "POST" }),
    regenerate: (id: string) =>
      apiFetch<RemixTriggerResult>(`/viral/remix/${id}/regenerate`, { method: "POST" }),
    getTranscript: (id: string) =>
      apiFetch<RemixTranscriptResponse>(`/viral/remix/${id}/transcript`),
    retranscribe: (id: string) =>
      apiFetch<RemixTriggerResult>(`/viral/remix/${id}/retranscribe`, {
        method: "POST",
      }),
    retranslate: (id: string) =>
      apiFetch<RemixTriggerResult>(`/viral/remix/${id}/retranslate`, {
        method: "POST",
      }),
    exportUrl: (id: string) => `${API_BASE}/viral/remix/${id}/export`,
    triggerFromItem: (itemId: string, projectId: string) =>
      apiFetch<RemixTriggerResult>(`/viral/items/${itemId}/remix`, {
        method: "POST",
        body: JSON.stringify({ projectId }),
      }),
  },
  stories: {
    list: (projectId?: string) =>
      apiFetch<Story[]>(
        `/stories${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`,
      ),
    get: (id: string) => apiFetch<Story>(`/stories/${id}`),
    create: (body: { projectId: string; title: string }) =>
      apiFetch<Story>("/stories", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { status?: string; title?: string }) =>
      apiFetch<Story>(`/stories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    listChapters: (id: string) => apiFetch<Chapter[]>(`/stories/${id}/chapters`),
    understand: (id: string) =>
      apiFetch<{ jobId: string; status: string }>(`/stories/${id}/understand`, {
        method: "POST",
      }),
    graph: (id: string) => apiFetch<StoryGraph>(`/stories/${id}/graph`),
    importFile: (id: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiFetch<{ jobId: string; status: string }>(`/stories/${id}/import`, {
        method: "POST",
        body: form,
      });
    },
    importUrl: (id: string, url: string) =>
      apiFetch<{ jobId: string; status: string }>(`/stories/${id}/import`, {
        method: "POST",
        body: JSON.stringify({ url }),
      }),
    generate: (
      id: string,
      body: {
        type: GenerationType;
        chapterId?: string;
        options?: Record<string, unknown>;
      },
    ) =>
      apiFetch<{ jobId: string; status: string }>(`/stories/${id}/generate`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listOutputs: (id: string) => apiFetch<GenerationOutput[]>(`/stories/${id}/outputs`),
    exportZip: (id: string, outputIds?: string[]) =>
      apiFetch<{ storyId: string; key: string; downloadUrl: string }>(
        `/stories/${id}/export`,
        {
          method: "POST",
          body: JSON.stringify({ format: "zip", outputIds }),
        },
      ),
  },
  outputs: {
    update: (id: string, body: { content?: string; status?: string }) =>
      apiFetch<GenerationOutput>(`/outputs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  jobs: {
    list: (params?: {
      storyId?: string;
      status?: string;
      typePrefix?: string;
    }) => {
      const query = new URLSearchParams();
      if (params?.storyId) query.set("storyId", params.storyId);
      if (params?.status) query.set("status", params.status);
      if (params?.typePrefix) query.set("typePrefix", params.typePrefix);
      const qs = query.toString();
      return apiFetch<Job[]>(`/jobs${qs ? `?${qs}` : ""}`);
    },
    retry: (id: string) =>
      apiFetch<{ jobId: string; status: string }>(`/jobs/${id}/retry`, {
        method: "POST",
      }),
  },
  analytics: {
    usage: () => apiFetch<UsageReport>("/analytics/usage"),
  },
};

import "../../load-env";
import "reflect-metadata";
import { Module, ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { Job as BullJob } from "bullmq";
import cookieParser from "cookie-parser";
import JSZip from "jszip";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { AppModule } from "../../app.module";
import { JobsModule } from "../jobs/jobs.module";
import { JobsService, type EnqueueInput, type EnqueueResult } from "../jobs/jobs.service";
import { PromptsModule } from "../prompts/prompts.module";
import { RemixModule } from "./remix.module";
import { RemixStorageService } from "./remix-storage.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { PrismaService } from "../../prisma/prisma.service";
import { QueueModule } from "../../queue/queue.module";
import { RemixProcessor } from "../../workers/processors/remix.processor";

process.env.DOUYIN_ADAPTER = "fake";
process.env.LLM_MODE = "fake";
process.env.REMIX_ENABLED = "true";
process.env.REMIX_SCRIPT_MODE = "caption";
process.env.REMIX_SKIP_GENERATE = "false";
process.env.REMIX_MEDIA_ADAPTER = "fake";

const createdJobIdsForSync: string[] = [];
const e2eAudioStore = new Map<string, Buffer>();

const createE2eRemixStorage = (): RemixStorageService =>
  ({
    audioKey: (remakeId: string) => `remix/${remakeId}/source-audio.wav`,
    putAudio: async (remakeId: string, wav: Buffer) => {
      const key = `remix/${remakeId}/source-audio.wav`;
      e2eAudioStore.set(key, wav);
      return key;
    },
    getAudio: async (key: string) => {
      const audio = e2eAudioStore.get(key);
      if (!audio) {
        throw new Error(`Missing e2e audio for key ${key}`);
      }
      return audio;
    },
    deleteAudio: async (key: string) => {
      e2eAudioStore.delete(key);
    },
  }) as RemixStorageService;

/** Inline remix_* enqueue so e2e tests do not race with a local dev worker. */
const patchSyncRemixEnqueue = (
  jobsService: JobsService,
  processor: RemixProcessor,
  prisma: PrismaService,
): void => {
  const originalEnqueue = jobsService.enqueue.bind(jobsService);

  jobsService.enqueue = async (input: EnqueueInput): Promise<EnqueueResult> => {
    if (!input.type.startsWith("remix_")) {
      return originalEnqueue(input);
    }

    const job = await prisma.job.create({
      data: {
        type: input.type,
        status: "queued",
        storyId: input.storyId ?? null,
        payload: (input.payload ?? {}) as never,
      },
    });

    createdJobIdsForSync.push(job.id);

    await processor.process({
      id: job.id,
      name: input.type,
      data: input.payload ?? {},
    } as BullJob);

    return { jobId: job.id, status: "completed" };
  };
};

@Module({
  imports: [QueueModule, PrismaModule, JobsModule, PromptsModule, RemixModule],
  providers: [
    RemixProcessor,
    {
      provide: RemixStorageService,
      useFactory: createE2eRemixStorage,
    },
  ],
})
class RemixE2eWorkerModule {}

const completeChecklist = () => ({
  hasStudioBrand: true,
  voiceWillBeRerecorded: true,
  noFullReupload: true,
  leadApproved: true,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Remix pipeline (e2e)", () => {
  let app: INestApplication;
  let workerApp: { close: () => Promise<void> };
  let prisma: PrismaService;
  let baseUrl: string;
  let sessionCookie: string;

  let projectId: string;
  let boardId: string;
  const createdJobIds: string[] = [];
  const createdRemakeIds: string[] = [];

  const apiFetch = async (
    path: string,
    init: RequestInit = {},
  ): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (sessionCookie) {
      headers.set("Cookie", sessionCookie);
    }
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(`${baseUrl}/api/v1${path}`, {
      ...init,
      headers,
    });
  };

  const apiJson = async <T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> => {
    const response = await apiFetch(path, init);
    const text = await response.text();
    const data = text ? (JSON.parse(text) as T) : ({} as T);

    if (!response.ok) {
      throw new Error(
        `${init.method ?? "GET"} ${path} → ${response.status}: ${text}`,
      );
    }

    return data;
  };

  const pollRemakeReady = async (remakeId: string, timeoutMs = 45_000) => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const remake = await apiJson<{
        status: string;
        packageJson?: {
          banners?: { watermark?: string };
          packaging?: { titles?: string[] };
          subtitles?: { cues?: unknown[] };
        };
      }>(`/viral/remix/${remakeId}`);

      if (remake.status === "ready") {
        return remake;
      }

      if (remake.status === "failed") {
        throw new Error(`Remake ${remakeId} failed`);
      }

      await sleep(400);
    }

    throw new Error(`Timeout waiting for remake ${remakeId} to become ready`);
  };

  const pollJobCompleted = async (jobId: string, timeoutMs = 45_000) => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const job = await apiJson<{ status: string; error?: string | null }>(
        `/jobs/${jobId}`,
      );

      if (job.status === "completed") {
        return job;
      }

      if (job.status === "failed") {
        throw new Error(`Job ${jobId} failed: ${job.error ?? "unknown"}`);
      }

      await sleep(400);
    }

    throw new Error(`Timeout waiting for job ${jobId} to complete`);
  };

  const seedViralItem = async () => {
    const suffix = Date.now().toString(36);

    const board = await prisma.viralBoard.create({
      data: {
        projectId,
        boardKey: `e2e-board-${suffix}`,
        label: "E2E Remix Board",
        genre: "cultivation",
      },
    });
    boardId = board.id;

    return prisma.viralItem.create({
      data: {
        boardId: board.id,
        externalId: "fake-video-001",
        title: "E2E viral item",
        caption: "Caption gốc cho integration test remix pipeline.",
        canonicalUrl: "https://example.test/fake/fake-video-001",
        genres: ["cultivation"],
        usagePolicy: "research_only",
      },
    });
  };

  beforeAll(async () => {
    workerApp = await NestFactory.createApplicationContext(RemixE2eWorkerModule);
    const processor = workerApp.get(RemixProcessor);

    app = await NestFactory.create(AppModule);
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.listen(0);

    const address = app.getHttpServer().address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve test server port");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
    patchSyncRemixEnqueue(workerApp.get(JobsService), processor, prisma);
    patchSyncRemixEnqueue(app.get(JobsService), processor, prisma);

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.STUDIO_EMAIL,
        password: process.env.STUDIO_PASSWORD,
      }),
    });

    if (!loginResponse.ok) {
      const body = await loginResponse.text();
      throw new Error(`Login failed (${loginResponse.status}): ${body}`);
    }

    const setCookies = loginResponse.headers.getSetCookie?.() ?? [];
    sessionCookie = setCookies
      .map((cookie) => cookie.split(";")[0] ?? "")
      .filter(Boolean)
      .join("; ");

    if (!sessionCookie) {
      throw new Error("Missing session cookie after login");
    }

    const suffix = Date.now().toString(36);
    const project = await apiJson<{ id: string }>("/projects", {
      method: "POST",
      body: JSON.stringify({
        name: `E2E Remix ${suffix}`,
        slug: `e2e-remix-${suffix}`,
      }),
    });
    projectId = project.id;
  });

  afterAll(async () => {
    const allJobIds = [...createdJobIds, ...createdJobIdsForSync];
    if (allJobIds.length > 0) {
      await prisma.job.deleteMany({ where: { id: { in: allJobIds } } });
    }

    if (createdRemakeIds.length > 0) {
      await prisma.viralRemake.deleteMany({
        where: { id: { in: createdRemakeIds } },
      });
    }

    if (boardId) {
      await prisma.viralBoard.delete({ where: { id: boardId } }).catch(() => {});
    }

    if (projectId) {
      await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    }

    await app?.close();
    await workerApp?.close();
  });

  it("runs full fake-adapter pipeline from shareUrl to ready package", async () => {
    const trigger = await apiJson<{ remakeId: string; jobId: string }>(
      "/viral/remix",
      {
        method: "POST",
        body: JSON.stringify({
          projectId,
          shareUrl: "https://v.douyin.com/test/",
        }),
      },
    );

    createdRemakeIds.push(trigger.remakeId);
    createdJobIds.push(trigger.jobId);

    await pollJobCompleted(trigger.jobId);
    const remake = await pollRemakeReady(trigger.remakeId);

    expect(remake.status).toBe("ready");
    expect(remake.packageJson?.banners?.watermark?.length ?? 0).toBeGreaterThan(0);
    expect(remake.packageJson?.packaging?.titles?.length ?? 0).toBeGreaterThan(0);
    expect(remake.packageJson?.subtitles?.cues?.length ?? 0).toBeGreaterThan(0);
  });

  it("blocks export until checklist is complete and remix is approved", async () => {
    const trigger = await apiJson<{ remakeId: string; jobId: string }>(
      "/viral/remix",
      {
        method: "POST",
        body: JSON.stringify({
          projectId,
          shareUrl: "https://v.douyin.com/export-test/",
        }),
      },
    );

    createdRemakeIds.push(trigger.remakeId);
    createdJobIds.push(trigger.jobId);

    await pollJobCompleted(trigger.jobId);
    await pollRemakeReady(trigger.remakeId);

    const blocked = await apiFetch(`/viral/remix/${trigger.remakeId}/export`);
    expect(blocked.status).toBe(403);

    await apiJson(`/viral/remix/${trigger.remakeId}`, {
      method: "PATCH",
      body: JSON.stringify({
        policyChecklist: completeChecklist(),
      }),
    });

    await apiJson(`/viral/remix/${trigger.remakeId}/approve`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    const exportResponse = await apiFetch(
      `/viral/remix/${trigger.remakeId}/export`,
    );
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get("content-type")).toContain("zip");

    const zipBuffer = Buffer.from(await exportResponse.arrayBuffer());
    const zip = await JSZip.loadAsync(zipBuffer);
    const fileNames = Object.keys(zip.files).sort();

    expect(fileNames.sort()).toEqual(
      [
        "banners.txt",
        "description.txt",
        "package.json",
        "package.srt",
        "titles.txt",
      ].sort(),
    );
  });

  it("triggers remix from viral item and links ready remake", async () => {
    const item = await seedViralItem();

    const trigger = await apiJson<{ remakeId: string; jobId: string }>(
      `/viral/items/${item.id}/remix`,
      {
        method: "POST",
        body: JSON.stringify({ projectId }),
      },
    );

    createdRemakeIds.push(trigger.remakeId);
    createdJobIds.push(trigger.jobId);

    await pollJobCompleted(trigger.jobId);
    const remake = await pollRemakeReady(trigger.remakeId);

    expect(remake.status).toBe("ready");
    expect(remake.packageJson?.banners?.watermark?.length ?? 0).toBeGreaterThan(0);
    expect(remake.packageJson?.packaging?.titles?.length ?? 0).toBeGreaterThan(0);
    expect(remake.packageJson?.subtitles?.cues?.length ?? 0).toBeGreaterThan(0);

    const linked = await apiJson<Array<{ id: string; viralItemId: string | null }>>(
      `/viral/remix?viralItemId=${item.id}`,
    );

    expect(linked.some((row) => row.id === trigger.remakeId)).toBe(true);
    expect(
      linked.find((row) => row.id === trigger.remakeId)?.viralItemId,
    ).toBe(item.id);
  });

  describe("full-script pipeline", () => {
    let originalScriptMode: string | undefined;
    let originalAllowDownload: string | undefined;
    let originalSttMode: string | undefined;
    let originalMediaAdapter: string | undefined;

    beforeAll(() => {
      originalScriptMode = process.env.REMIX_SCRIPT_MODE;
      originalAllowDownload = process.env.REMIX_ALLOW_MEDIA_DOWNLOAD;
      originalSttMode = process.env.REMIX_STT_MODE;
      originalMediaAdapter = process.env.REMIX_MEDIA_ADAPTER;

      process.env.REMIX_SCRIPT_MODE = "full";
      process.env.REMIX_ALLOW_MEDIA_DOWNLOAD = "true";
      process.env.REMIX_STT_MODE = "fake";
      process.env.REMIX_MEDIA_ADAPTER = "fake";
      process.env.REMIX_SKIP_GENERATE = "false";
    });

    afterAll(() => {
      process.env.REMIX_SCRIPT_MODE = originalScriptMode;
      process.env.REMIX_ALLOW_MEDIA_DOWNLOAD = originalAllowDownload;
      process.env.REMIX_STT_MODE = originalSttMode;
      process.env.REMIX_MEDIA_ADAPTER = originalMediaAdapter;
    });

    it("runs full-script pipeline with transcript and SRT export", async () => {
      const remake = await prisma.viralRemake.create({
        data: {
          projectId,
          externalVideoId: "pending",
          scriptMode: "full",
          pipelinePhase: "pending",
          status: "pending",
          usagePolicy: "remix_draft",
        },
      });
      createdRemakeIds.push(remake.id);

      const processor = workerApp.get(RemixProcessor);
      const resolveJob = await prisma.job.create({
        data: {
          type: "remix_resolve",
          status: "queued",
          payload: {
            remakeId: remake.id,
            shareUrl: "https://v.douyin.com/full-script-test/",
          },
        },
      });
      createdJobIdsForSync.push(resolveJob.id);

      await processor.process({
        id: resolveJob.id,
        name: "remix_resolve",
        data: {
          remakeId: remake.id,
          shareUrl: "https://v.douyin.com/full-script-test/",
        },
      } as BullJob);

      const ready = await pollRemakeReady(remake.id);
      expect(ready.status).toBe("ready");

      const fullRemake = await prisma.viralRemake.findUnique({
        where: { id: remake.id },
      });

      expect(fullRemake?.sourceTranscript).not.toBeNull();
      const transcript = fullRemake?.sourceTranscript as {
        segments: unknown[];
      };
      expect(transcript.segments.length).toBeGreaterThan(0);
      const pkg = fullRemake?.packageJson as {
        packaging?: { titles?: string[] };
        subtitles?: { cues?: unknown[] };
      };
      expect(pkg.packaging?.titles?.length ?? 0).toBeGreaterThan(0);
      expect(pkg.subtitles?.cues?.length ?? 0).toBeGreaterThan(0);

      // Approve and export via API
      await apiJson(`/viral/remix/${remake.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          policyChecklist: completeChecklist(),
        }),
      });

      await apiJson(`/viral/remix/${remake.id}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      const exportResponse = await apiFetch(`/viral/remix/${remake.id}/export`);
      expect(exportResponse.status).toBe(200);

      const zipBuffer = Buffer.from(await exportResponse.arrayBuffer());
      const zip = await JSZip.loadAsync(zipBuffer);
      const fileNames = Object.keys(zip.files);

      expect(fileNames).toContain("transcript-source.srt");
      expect(fileNames).toContain("transcript-source.txt");
    });

    it("rejects trigger when script mode is full but media download is disabled", async () => {
      process.env.REMIX_ALLOW_MEDIA_DOWNLOAD = "false";

      const response = await apiFetch("/viral/remix", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          shareUrl: "https://v.douyin.com/reject-test/",
        }),
      });

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.message).toContain("REMIX_ALLOW_MEDIA_DOWNLOAD=true");

      process.env.REMIX_ALLOW_MEDIA_DOWNLOAD = "true";
    });
  });
});

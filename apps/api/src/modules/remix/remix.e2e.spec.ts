import "../../load-env";
import "reflect-metadata";
import { Module, ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
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
import { PromptsModule } from "../prompts/prompts.module";
import { RemixModule } from "./remix.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { PrismaService } from "../../prisma/prisma.service";
import { QueueModule } from "../../queue/queue.module";
import { RemixProcessor } from "../../workers/processors/remix.processor";

process.env.DOUYIN_ADAPTER = "fake";
process.env.LLM_MODE = "fake";
process.env.REMIX_ENABLED = "true";

@Module({
  imports: [QueueModule, PrismaModule, JobsModule, PromptsModule, RemixModule],
  providers: [RemixProcessor],
})
class RemixE2eWorkerModule {}

const completeChecklist = () => ({
  scriptRewritten: true,
  hookIsNew: true,
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
          script?: { narration?: string };
          hook_3s?: { spoken?: string };
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
    if (createdJobIds.length > 0) {
      await prisma.job.deleteMany({ where: { id: { in: createdJobIds } } });
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
    expect(remake.packageJson?.script?.narration?.length ?? 0).toBeGreaterThan(50);
    expect(remake.packageJson?.hook_3s?.spoken?.length ?? 0).toBeGreaterThan(0);
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

    expect(fileNames).toEqual(
      [
        "hook.txt",
        "package.json",
        "package.srt",
        "script.txt",
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
    expect(remake.packageJson?.script?.narration?.length ?? 0).toBeGreaterThan(50);
    expect(remake.packageJson?.hook_3s?.spoken?.length ?? 0).toBeGreaterThan(0);

    const linked = await apiJson<Array<{ id: string; viralItemId: string | null }>>(
      `/viral/remix?viralItemId=${item.id}`,
    );

    expect(linked.some((row) => row.id === trigger.remakeId)).toBe(true);
    expect(
      linked.find((row) => row.id === trigger.remakeId)?.viralItemId,
    ).toBe(item.id);
  });
});

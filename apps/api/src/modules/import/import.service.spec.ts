import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import type { JobsService } from "../jobs/jobs.service";
import type { SourcesService } from "../sources/sources.service";
import { ImportService } from "./import.service";
import type { ObjectStorage } from "./storage/object-storage";

describe("ImportService", () => {
  let sourcesService: {
    assertStoryImportAllowed: ReturnType<typeof vi.fn>;
  };
  let jobsService: {
    enqueue: ReturnType<typeof vi.fn>;
  };
  let storage: {
    putObject: ReturnType<typeof vi.fn>;
    getObject: ReturnType<typeof vi.fn>;
  };
  let service: ImportService;

  beforeEach(() => {
    sourcesService = {
      assertStoryImportAllowed: vi.fn().mockResolvedValue(undefined),
    };
    jobsService = {
      enqueue: vi.fn().mockResolvedValue({ jobId: "job_1", status: "queued" }),
    };
    storage = {
      putObject: vi.fn().mockResolvedValue(undefined),
      getObject: vi.fn(),
    };
    service = new ImportService(
      sourcesService as unknown as SourcesService,
      jobsService as unknown as JobsService,
      storage as unknown as ObjectStorage,
    );
  });

  it("hard-rejects via assertStoryImportAllowed before enqueueing a file", async () => {
    sourcesService.assertStoryImportAllowed.mockRejectedValue(
      new ForbiddenException("not cleared"),
    );

    await expect(
      service.importFile("story_1", {
        buffer: Buffer.from("Chương 1\nA"),
        originalname: "novel.txt",
        mimetype: "text/plain",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(storage.putObject).not.toHaveBeenCalled();
    expect(jobsService.enqueue).not.toHaveBeenCalled();
  });

  it("uploads to object storage then enqueues parse_file", async () => {
    const result = await service.importFile("story_1", {
      buffer: Buffer.from("Chương 1\nA"),
      originalname: "novel.txt",
      mimetype: "text/plain",
    });

    expect(sourcesService.assertStoryImportAllowed).toHaveBeenCalledWith(
      "story_1",
    );
    expect(storage.putObject).toHaveBeenCalled();
    const objectKey = storage.putObject.mock.calls[0]?.[0] as string;
    expect(objectKey).toMatch(/^imports\/story_1\//);
    expect(jobsService.enqueue).toHaveBeenCalledWith({
      type: "parse_file",
      storyId: "story_1",
      payload: {
        objectKey,
        filename: "novel.txt",
        contentType: "text/plain",
      },
    });
    expect(result).toEqual({ jobId: "job_1", status: "queued" });
  });

  it("hard-rejects via assertStoryImportAllowed before enqueueing a URL", async () => {
    sourcesService.assertStoryImportAllowed.mockRejectedValue(
      new ForbiddenException("not cleared"),
    );

    await expect(
      service.importUrl("story_1", "https://example.com/novel"),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(jobsService.enqueue).not.toHaveBeenCalled();
  });

  it("enqueues fetch_url after license gate", async () => {
    await service.importUrl("story_1", "https://example.com/novel");

    expect(sourcesService.assertStoryImportAllowed).toHaveBeenCalledWith(
      "story_1",
    );
    expect(jobsService.enqueue).toHaveBeenCalledWith({
      type: "fetch_url",
      storyId: "story_1",
      payload: { url: "https://example.com/novel" },
    });
  });
});

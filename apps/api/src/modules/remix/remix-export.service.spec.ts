import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { RemixPackageV1 } from "@factory/shared";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service";
import { RemixExportService } from "./remix-export.service";
import { RemixPolicyGuard } from "./remix-policy.guard";

const samplePackage = (): RemixPackageV1 => ({
  locale: "vi",
  script: {
    narration: "Đây là script tiếng Việt.",
    duration_estimate_sec: 45,
    sections: [{ label: "Mở đầu", text: "Đây là script tiếng Việt." }],
  },
  hook_3s: {
    spoken: "Bạn có biết điều này?",
    on_screen: "SHOCK",
    visual_hint: "close-up",
  },
  banners: { top: "TOP", bottom: "BOTTOM", watermark: "STUDIO ALPHA" },
  packaging: {
    titles: ["Tiêu đề A", "Tiêu đề B"],
    description: "Mô tả video",
    hashtags: ["#viral"],
  },
  subtitles: {
    format: "srt",
    cues: [
      {
        start: "00:00:00,000",
        end: "00:00:03,000",
        text: "Bạn có biết điều này?",
      },
      {
        start: "00:00:03,000",
        end: "00:00:08,000",
        text: "Đây là script tiếng Việt.",
      },
    ],
  },
  transform_notes: {
    source_language: "zh",
    rewrite_strategy: "recap",
    risks: [],
  },
});

const completeChecklist = () => ({
  scriptRewritten: true,
  hookIsNew: true,
  hasStudioBrand: true,
  voiceWillBeRerecorded: true,
  noFullReupload: true,
  leadApproved: true,
});

const collectStream = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

describe("RemixExportService", () => {
  let prisma: {
    viralRemake: { findUnique: ReturnType<typeof vi.fn> };
  };
  let service: RemixExportService;

  beforeEach(() => {
    prisma = {
      viralRemake: { findUnique: vi.fn() },
    };
    service = new RemixExportService(
      prisma as unknown as PrismaService,
      new RemixPolicyGuard(),
    );
  });

  describe("buildSrtFromCues", () => {
    it("formats cues as SRT", () => {
      const srt = service.buildSrtFromCues(samplePackage().subtitles.cues);

      expect(srt).toBe(
        [
          "1",
          "00:00:00,000 --> 00:00:03,000",
          "Bạn có biết điều này?",
          "",
          "2",
          "00:00:03,000 --> 00:00:08,000",
          "Đây là script tiếng Việt.",
          "",
        ].join("\n"),
      );
    });
  });

  describe("exportRemake", () => {
    it("throws NotFoundException when remake does not exist", async () => {
      prisma.viralRemake.findUnique.mockResolvedValue(null);

      await expect(service.exportRemake("missing")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws ForbiddenException when policy guard fails", async () => {
      prisma.viralRemake.findUnique.mockResolvedValue({
        id: "remake_1",
        usagePolicy: "remix_draft",
        policyChecklist: completeChecklist(),
        packageJson: samplePackage(),
      });

      await expect(service.exportRemake("remake_1")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("throws BadRequestException when packageJson is missing", async () => {
      prisma.viralRemake.findUnique.mockResolvedValue({
        id: "remake_1",
        usagePolicy: "approved_for_export",
        policyChecklist: completeChecklist(),
        packageJson: null,
      });

      await expect(service.exportRemake("remake_1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("builds zip with script.txt, hook.txt, package.srt, titles.txt, package.json", async () => {
      const pkg = samplePackage();
      prisma.viralRemake.findUnique.mockResolvedValue({
        id: "remake_1",
        usagePolicy: "approved_for_export",
        policyChecklist: completeChecklist(),
        packageJson: pkg,
      });

      const { stream } = await service.exportRemake("remake_1");
      const zipBuffer = await collectStream(stream);
      const zip = await JSZip.loadAsync(zipBuffer);

      const expectedFiles = [
        "script.txt",
        "hook.txt",
        "package.srt",
        "titles.txt",
        "package.json",
      ];
      expect(Object.keys(zip.files).sort()).toEqual(expectedFiles.sort());

      expect(await zip.file("script.txt")!.async("string")).toBe(
        pkg.script.narration,
      );
      expect(await zip.file("hook.txt")!.async("string")).toBe(
        pkg.hook_3s.spoken,
      );
      expect(await zip.file("titles.txt")!.async("string")).toBe(
        "Tiêu đề A\nTiêu đề B",
      );
      expect(await zip.file("package.srt")!.async("string")).toBe(
        service.buildSrtFromCues(pkg.subtitles.cues),
      );
      expect(JSON.parse(await zip.file("package.json")!.async("string"))).toEqual(
        pkg,
      );
    });
  });
});

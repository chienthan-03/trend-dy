import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { RemixPackageV1, RemixTranscriptV1 } from "@factory/shared";
import { buildSrtFromSegments, toSlimRemixPackage } from "@factory/shared";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service";
import { RemixExportService } from "./remix-export.service";
import { RemixPolicyGuard } from "./remix-policy.guard";

const samplePackage = (): RemixPackageV1 => ({
  locale: "vi",
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

const legacyPackageWithScript = () => ({
  ...samplePackage(),
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
});

const sampleTranscript = (): RemixTranscriptV1 => ({
  version: 1,
  language: "zh",
  durationSec: 8,
  segments: [
    { startSec: 0, endSec: 3, text: "原始第一句" },
    { startSec: 3, endSec: 8, text: "原始第二句" },
  ],
  fullText: "原始第一句 原始第二句",
  provider: "openai",
  model: "whisper-1",
});

const sampleTranslatedTranscript = (): RemixTranscriptV1 => ({
  version: 1,
  language: "vi",
  durationSec: 8,
  segments: [
    { startSec: 0, endSec: 3, text: "Câu đầu tiên" },
    { startSec: 3, endSec: 8, text: "Câu thứ hai" },
  ],
  fullText: "Câu đầu tiên Câu thứ hai",
  provider: "openai",
  model: "gpt-4o-mini",
});

const completeChecklist = () => ({
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

    it("builds slim zip with package.srt, titles.txt, banners.txt, description.txt, package.json", async () => {
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
        "package.srt",
        "titles.txt",
        "banners.txt",
        "description.txt",
        "package.json",
      ];
      expect(Object.keys(zip.files).sort()).toEqual(expectedFiles.sort());

      expect(zip.file("script.txt")).toBeNull();
      expect(zip.file("script-full.txt")).toBeNull();
      expect(zip.file("hook.txt")).toBeNull();

      expect(await zip.file("titles.txt")!.async("string")).toBe(
        "Tiêu đề A\nTiêu đề B",
      );
      expect(await zip.file("banners.txt")!.async("string")).toBe(
        "top: TOP\nbottom: BOTTOM\nwatermark: STUDIO ALPHA",
      );
      expect(await zip.file("description.txt")!.async("string")).toBe(
        "Mô tả video\n\n#viral",
      );
      expect(await zip.file("package.srt")!.async("string")).toBe(
        service.buildSrtFromCues(pkg.subtitles.cues),
      );
      expect(JSON.parse(await zip.file("package.json")!.async("string"))).toEqual(
        toSlimRemixPackage(pkg),
      );
    });

    it("strips legacy script and hook_3s from package.json even when DB raw object includes them", async () => {
      const rawPkg = legacyPackageWithScript();
      prisma.viralRemake.findUnique.mockResolvedValue({
        id: "remake_1",
        usagePolicy: "approved_for_export",
        policyChecklist: completeChecklist(),
        packageJson: rawPkg,
      });

      const { stream } = await service.exportRemake("remake_1");
      const zipBuffer = await collectStream(stream);
      const zip = await JSZip.loadAsync(zipBuffer);

      const parsed = JSON.parse(await zip.file("package.json")!.async("string"));
      expect(parsed).toEqual(toSlimRemixPackage(rawPkg));
      expect(parsed).not.toHaveProperty("script");
      expect(parsed).not.toHaveProperty("hook_3s");
    });

    it("includes transcript-source files when sourceTranscript is present", async () => {
      const pkg = samplePackage();
      const transcript = sampleTranscript();
      prisma.viralRemake.findUnique.mockResolvedValue({
        id: "remake_1",
        usagePolicy: "approved_for_export",
        policyChecklist: completeChecklist(),
        packageJson: pkg,
        sourceTranscript: transcript,
      });

      const { stream } = await service.exportRemake("remake_1");
      const zipBuffer = await collectStream(stream);
      const zip = await JSZip.loadAsync(zipBuffer);

      expect(zip.file("transcript-source.txt")).not.toBeNull();
      expect(zip.file("transcript-source.srt")).not.toBeNull();
      expect(zip.file("transcript-vi.txt")).toBeNull();
      expect(zip.file("transcript-vi.srt")).toBeNull();

      expect(await zip.file("transcript-source.txt")!.async("string")).toBe(
        transcript.fullText,
      );

      const srt = await zip.file("transcript-source.srt")!.async("string");
      expect(srt).toBe(buildSrtFromSegments(transcript.segments));
      expect(srt.split("\n\n").filter(Boolean)).toHaveLength(
        transcript.segments.length,
      );
    });

    it("includes transcript-vi files when sourceTranscriptTranslated is present", async () => {
      const pkg = samplePackage();
      const transcript = sampleTranscript();
      const translated = sampleTranslatedTranscript();
      prisma.viralRemake.findUnique.mockResolvedValue({
        id: "remake_1",
        usagePolicy: "approved_for_export",
        policyChecklist: completeChecklist(),
        packageJson: pkg,
        sourceTranscript: transcript,
        sourceTranscriptTranslated: translated,
      });

      const { stream } = await service.exportRemake("remake_1");
      const zipBuffer = await collectStream(stream);
      const zip = await JSZip.loadAsync(zipBuffer);

      expect(zip.file("transcript-vi.txt")).not.toBeNull();
      expect(zip.file("transcript-vi.srt")).not.toBeNull();

      expect(await zip.file("transcript-vi.txt")!.async("string")).toBe(
        translated.fullText,
      );

      const srt = await zip.file("transcript-vi.srt")!.async("string");
      expect(srt).toBe(buildSrtFromSegments(translated.segments));
      expect(srt.split("\n\n").filter(Boolean)).toHaveLength(
        translated.segments.length,
      );
    });
  });
});

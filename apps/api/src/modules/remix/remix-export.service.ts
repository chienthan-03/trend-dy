import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  buildSrtFromSegments,
  type RemixPackageV1,
  type RemixTranscriptV1,
  toSlimRemixPackage,
} from "@factory/shared";
import { ZipArchive } from "archiver";
import { PassThrough } from "node:stream";
import { PrismaService } from "../../prisma/prisma.service";
import { RemixPolicyGuard } from "./remix-policy.guard";

export type RemixExportStream = {
  stream: PassThrough;
  filename: string;
};

export type RemixSubtitleCue = {
  start: string;
  end: string;
  text: string;
};

@Injectable()
export class RemixExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyGuard: RemixPolicyGuard,
  ) {}

  buildSrtFromCues(cues: RemixSubtitleCue[]): string {
    if (cues.length === 0) {
      return "";
    }

    return `${cues
      .map(
        (cue, index) =>
          `${index + 1}\n${cue.start} --> ${cue.end}\n${cue.text}`,
      )
      .join("\n\n")}\n`;
  }

  async exportRemake(id: string): Promise<RemixExportStream> {
    const remake = await this.prisma.viralRemake.findUnique({ where: { id } });
    if (!remake) {
      throw new NotFoundException(`Remake ${id} not found`);
    }

    if (!this.policyGuard.canExport(remake)) {
      throw new ForbiddenException("Remix is not approved for export");
    }

    if (!remake.packageJson) {
      throw new BadRequestException("Remix package is not ready for export");
    }

    const pkg = remake.packageJson as RemixPackageV1;
    const transcript = remake.sourceTranscript as RemixTranscriptV1 | null;
    const translated =
      (remake.sourceTranscriptTranslated as RemixTranscriptV1 | null) ?? null;
    const stream = this.createZipStream(pkg, transcript, translated);

    return {
      stream,
      filename: `remix-${id}.zip`,
    };
  }

  private createZipStream(
    pkg: RemixPackageV1,
    transcript: RemixTranscriptV1 | null,
    translated?: RemixTranscriptV1 | null,
  ): PassThrough {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const passthrough = new PassThrough();

    archive.on("error", (error) => {
      passthrough.destroy(error);
    });

    archive.pipe(passthrough);

    const slim = toSlimRemixPackage(pkg);

    if (transcript) {
      archive.append(transcript.fullText, { name: "transcript-source.txt" });
      archive.append(buildSrtFromSegments(transcript.segments), {
        name: "transcript-source.srt",
      });
    }

    if (translated) {
      archive.append(translated.fullText, { name: "transcript-vi.txt" });
      archive.append(buildSrtFromSegments(translated.segments), {
        name: "transcript-vi.srt",
      });
    }

    archive.append(this.buildSrtFromCues(slim.subtitles.cues), {
      name: "package.srt",
    });
    archive.append(slim.packaging.titles.join("\n"), { name: "titles.txt" });
    archive.append(
      [
        `top: ${slim.banners.top}`,
        `bottom: ${slim.banners.bottom}`,
        `watermark: ${slim.banners.watermark}`,
      ].join("\n"),
      { name: "banners.txt" },
    );
    archive.append(
      [slim.packaging.description, "", slim.packaging.hashtags.join(" ")].join(
        "\n",
      ),
      { name: "description.txt" },
    );
    archive.append(JSON.stringify(slim, null, 2), { name: "package.json" });

    void archive.finalize();

    return passthrough;
  }
}

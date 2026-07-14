import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { RemixPackageV1 } from "@factory/shared";
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
    const stream = this.createZipStream(pkg);

    return {
      stream,
      filename: `remix-${id}.zip`,
    };
  }

  private createZipStream(pkg: RemixPackageV1): PassThrough {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const passthrough = new PassThrough();

    archive.on("error", (error) => {
      passthrough.destroy(error);
    });

    archive.pipe(passthrough);

    archive.append(pkg.script.narration, { name: "script.txt" });
    archive.append(pkg.hook_3s.spoken, { name: "hook.txt" });
    archive.append(this.buildSrtFromCues(pkg.subtitles.cues), {
      name: "package.srt",
    });
    archive.append(pkg.packaging.titles.join("\n"), { name: "titles.txt" });
    archive.append(JSON.stringify(pkg, null, 2), { name: "package.json" });

    void archive.finalize();

    return passthrough;
  }
}

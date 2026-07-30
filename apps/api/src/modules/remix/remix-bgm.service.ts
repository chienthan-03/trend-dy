import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  REMIX_BGM_TRACK_IDS,
  type RemixBgmTrack,
  type RemixBgmTrackId,
} from "@factory/shared";
import { probeAudioDurationSec } from "./remix-audio.util";

type BgmManifestEntry = {
  id: string;
  label: string;
  file: string;
};

type BgmManifest = {
  tracks: BgmManifestEntry[];
};

const BGM_PREVIEW_PATH_PREFIX = "/api/v1/viral/remix/bgm";

const resolveBgmAssetsDir = (): string => {
  const cwd = process.cwd();
  const candidates = [
    join(cwd, "apps/api/assets/remix/bgm"),
    join(cwd, "assets/remix/bgm"),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "manifest.json"))) {
      return resolve(candidate);
    }
  }
  return resolve(cwd, "apps/api/assets/remix/bgm");
};

@Injectable()
export class RemixBgmService {
  private manifestPromise: Promise<BgmManifest> | null = null;
  private readonly assetsDir = resolveBgmAssetsDir();
  private readonly durationCache = new Map<RemixBgmTrackId, number>();

  private async loadManifest(): Promise<BgmManifest> {
    if (!this.manifestPromise) {
      this.manifestPromise = readFile(join(this.assetsDir, "manifest.json"), "utf8").then(
        (raw) => JSON.parse(raw) as BgmManifest,
      );
    }
    return this.manifestPromise;
  }

  assertTrackId(trackId: string): RemixBgmTrackId {
    if (!REMIX_BGM_TRACK_IDS.includes(trackId as RemixBgmTrackId)) {
      throw new BadRequestException(`Unknown BGM track id: ${trackId}`);
    }
    return trackId as RemixBgmTrackId;
  }

  async listTracks(): Promise<RemixBgmTrack[]> {
    const manifest = await this.loadManifest();
    const tracks = manifest.tracks.filter((entry) =>
      REMIX_BGM_TRACK_IDS.includes(entry.id as RemixBgmTrackId),
    );
    return Promise.all(
      tracks.map(async (entry) => {
        const id = entry.id as RemixBgmTrackId;
        const durationSec = await this.getTrackDurationSec(id);
        return {
          id,
          label: entry.label,
          previewUrl: `${BGM_PREVIEW_PATH_PREFIX}/${entry.id}/preview`,
          durationSec,
        };
      }),
    );
  }

  async getTrackDurationSec(trackId: RemixBgmTrackId): Promise<number> {
    const cached = this.durationCache.get(trackId);
    if (cached != null) return cached;
    const buffer = await this.readTrackBuffer(trackId);
    const probed = await probeAudioDurationSec(buffer, "mp3");
    const durationSec = probed ?? 0;
    this.durationCache.set(trackId, durationSec);
    return durationSec;
  }

  private async resolveTrackFile(trackId: RemixBgmTrackId): Promise<string> {
    const manifest = await this.loadManifest();
    const entry = manifest.tracks.find((track) => track.id === trackId);
    if (!entry) {
      throw new NotFoundException(`BGM track not found: ${trackId}`);
    }
    const filePath = join(this.assetsDir, entry.file);
    if (!existsSync(filePath)) {
      throw new NotFoundException(`BGM file missing for track: ${trackId}`);
    }
    return filePath;
  }

  async readTrackBuffer(trackId: RemixBgmTrackId): Promise<Buffer> {
    const id = this.assertTrackId(trackId);
    const filePath = await this.resolveTrackFile(id);
    return readFile(filePath);
  }

  async getPreviewStream(trackId: RemixBgmTrackId): Promise<{
    stream: ReturnType<typeof createReadStream>;
    size: number;
  }> {
    const id = this.assertTrackId(trackId);
    const filePath = await this.resolveTrackFile(id);
    const buffer = await readFile(filePath);
    return {
      stream: createReadStream(filePath),
      size: buffer.length,
    };
  }
}

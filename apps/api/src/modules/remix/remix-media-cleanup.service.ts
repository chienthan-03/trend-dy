import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RemixStorageService } from "./remix-storage.service";

@Injectable()
export class RemixMediaCleanupService {
  private readonly logger = new Logger(RemixMediaCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly remixStorage: RemixStorageService,
  ) {}

  async cleanupExpiredMedia(): Promise<{ deletedCount: number }> {
    const now = new Date();

    const expiredRemakes = await this.prisma.viralRemake.findMany({
      where: {
        mediaExpiresAt: {
          lt: now,
        },
        OR: [
          { mediaAudioKey: { not: null } },
          { mediaVideoKey: { not: null } },
          { mediaDubAudioKey: { not: null } },
          { renderOutputKey: { not: null } },
        ],
      },
      select: {
        id: true,
        mediaAudioKey: true,
        mediaVideoKey: true,
        mediaDubAudioKey: true,
        renderOutputKey: true,
      },
    });

    if (expiredRemakes.length === 0) {
      return { deletedCount: 0 };
    }

    this.logger.log(`Found ${expiredRemakes.length} expired media items to cleanup`);

    let deletedCount = 0;
    for (const remake of expiredRemakes) {
      try {
        const deletions: Promise<void>[] = [];

        if (remake.mediaAudioKey) {
          deletions.push(this.remixStorage.deleteAudio(remake.mediaAudioKey));
        }
        if (remake.mediaVideoKey) {
          deletions.push(this.remixStorage.deleteVideo(remake.mediaVideoKey));
        }
        if (remake.mediaDubAudioKey) {
          deletions.push(this.remixStorage.deleteDub(remake.mediaDubAudioKey));
        }
        if (remake.renderOutputKey) {
          deletions.push(this.remixStorage.deleteRender(remake.renderOutputKey));
        }

        if (deletions.length === 0) {
          continue;
        }

        await Promise.all(deletions);

        await this.prisma.viralRemake.update({
          where: { id: remake.id },
          data: {
            mediaAudioKey: null,
            mediaVideoKey: null,
            mediaDubAudioKey: null,
            renderOutputKey: null,
          },
        });

        deletedCount++;
      } catch (error) {
        this.logger.error(`Failed to cleanup media for remake ${remake.id}: ${error.message}`, error.stack);
      }
    }

    this.logger.log(`Successfully cleaned up ${deletedCount} media items`);
    return { deletedCount };
  }
}

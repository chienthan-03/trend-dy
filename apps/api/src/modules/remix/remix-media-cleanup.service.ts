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
    
    // Find viral_remakes where mediaExpiresAt < now AND mediaAudioKey IS NOT NULL
    const expiredRemakes = await this.prisma.viralRemake.findMany({
      where: {
        mediaExpiresAt: {
          lt: now,
        },
        mediaAudioKey: {
          not: null,
        },
      },
      select: {
        id: true,
        mediaAudioKey: true,
      },
    });

    if (expiredRemakes.length === 0) {
      return { deletedCount: 0 };
    }

    this.logger.log(`Found ${expiredRemakes.length} expired media items to cleanup`);

    let deletedCount = 0;
    for (const remake of expiredRemakes) {
      try {
        if (remake.mediaAudioKey) {
          await this.remixStorage.deleteAudio(remake.mediaAudioKey);
          
          await this.prisma.viralRemake.update({
            where: { id: remake.id },
            data: {
              mediaAudioKey: null,
            },
          });
          
          deletedCount++;
        }
      } catch (error) {
        this.logger.error(`Failed to cleanup media for remake ${remake.id}: ${error.message}`, error.stack);
      }
    }

    this.logger.log(`Successfully cleaned up ${deletedCount} media items`);
    return { deletedCount };
  }
}

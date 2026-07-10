import { Injectable } from "@nestjs/common";
import type { EnqueueResult } from "../jobs/jobs.service";
import { JobsService } from "../jobs/jobs.service";
import { SourcesService } from "../sources/sources.service";
import { StoriesService } from "../stories/stories.service";

@Injectable()
export class UnderstandService {
  constructor(
    private readonly storiesService: StoriesService,
    private readonly sourcesService: SourcesService,
    private readonly jobsService: JobsService,
  ) {}

  async enqueueUnderstand(storyId: string): Promise<{
    storyId: string;
    jobs: EnqueueResult[];
  }> {
    await this.sourcesService.assertStoryImportAllowed(storyId);
    const chapters = await this.storiesService.listChapters(storyId);

    const jobs: EnqueueResult[] = [];
    for (const chapter of chapters) {
      jobs.push(
        await this.jobsService.enqueue({
          type: "extract_chapter",
          storyId,
          idempotencyKey: `extract_chapter:${storyId}:${chapter.id}`,
          payload: { storyId, chapterId: chapter.id },
        }),
      );
    }

    jobs.push(
      await this.jobsService.enqueue({
        type: "rollup_arcs",
        storyId,
        idempotencyKey: `rollup_arcs:${storyId}`,
        payload: { storyId },
      }),
    );

    return { storyId, jobs };
  }
}

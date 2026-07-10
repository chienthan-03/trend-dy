import type { QueueName } from "../../queue/queues";

/**
 * Job type → BullMQ queue mapping:
 *
 * | Prefix / pattern              | Queue       |
 * |-------------------------------|-------------|
 * | import*, parse*, fetch*       | import      |
 * | known: chunk_embed            | import      |
 * | understand*                   | understand  |
 * | known: extract_chapter,       | understand  |
 * |   resolve_entities, rollup_arcs |           |
 * | gen_*                         | generate    |
 * | asset*                        | asset       |
 * | known: build_srt, scene_list, | asset       |
 * |   export_zip                  |             |
 * | douyin_*                      | discovery   |
 */
const KNOWN_JOB_TYPES: Record<string, QueueName> = {
  parse_file: "import",
  fetch_url: "import",
  chunk_embed: "import",
  extract_chapter: "understand",
  resolve_entities: "understand",
  rollup_arcs: "understand",
  build_srt: "asset",
  scene_list: "asset",
  export_zip: "asset",
};

export const resolveQueueName = (type: string): QueueName => {
  const known = KNOWN_JOB_TYPES[type];
  if (known) {
    return known;
  }

  if (
    type.startsWith("import") ||
    type.startsWith("parse") ||
    type.startsWith("fetch")
  ) {
    return "import";
  }

  if (type.startsWith("understand")) {
    return "understand";
  }

  if (type.startsWith("gen_")) {
    return "generate";
  }

  if (type.startsWith("asset")) {
    return "asset";
  }

  if (type.startsWith("douyin_")) {
    return "discovery";
  }

  throw new Error(`Unknown job type — no queue mapping for "${type}"`);
};

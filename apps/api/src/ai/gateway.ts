import { createHash } from "node:crypto";
import {
  extractChapterV1Schema,
  type ExtractChapterV1,
} from "./prompts/extract.chapter.v1";

const EMBEDDING_DIMENSIONS = 1536;

export type JsonSchema<T> = {
  parse: (data: unknown) => T;
};

export type CompleteJsonResult<T> = {
  data: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  provider: string;
};

export type CompleteTextResult = {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  provider: string;
};

export type EmbedResult = {
  embeddings: number[][];
  model: string;
  tokensIn: number;
  provider: string;
};

export const estimateEmbeddingTokens = (texts: string[]): number =>
  texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);

const fakeEmbedding = (text: string): number[] => {
  const hash = createHash("sha256").update(text).digest();
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);

  for (let i = 0; i < hash.length; i += 1) {
    vector[i % EMBEDDING_DIMENSIONS] += hash[i]! / 255;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
};

const embedWithOpenAi = async (texts: string[], model: string): Promise<number[][]> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when EMBEDDING_MODE is not fake");
  }

  const baseUrl = process.env.AI_GATEWAY_URL ?? "https://api.openai.com/v1";
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: texts }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Embedding request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return payload.data.map((item) => item.embedding);
};

export const embedTexts = async (texts: string[]): Promise<EmbedResult> => {
  if (texts.length === 0) {
    return {
      embeddings: [],
      model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
      tokensIn: 0,
      provider: "openai",
    };
  }

  const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  const tokensIn = estimateEmbeddingTokens(texts);

  if (process.env.EMBEDDING_MODE === "fake") {
    return {
      embeddings: texts.map((text) => fakeEmbedding(text)),
      model,
      tokensIn,
      provider: "fake",
    };
  }

  const embeddings = await embedWithOpenAi(texts, model);
  return {
    embeddings,
    model,
    tokensIn,
    provider: process.env.AI_GATEWAY_URL ? "gateway" : "openai",
  };
};

const NAME_HINT_RE = /(?:nhân vật|character|tên)\s*[:\-]\s*([^\n,;.]+)/gi;

const extractNameHints = (prompt: string): string[] => {
  const names = new Set<string>();
  for (const match of prompt.matchAll(NAME_HINT_RE)) {
    const name = match[1]?.trim();
    if (name) {
      names.add(name);
    }
  }
  return [...names];
};

const buildFakeChapterExtract = (prompt: string): ExtractChapterV1 => {
  const hints = extractNameHints(prompt);
  const characters =
    hints.length > 0
      ? hints.map((name) => ({ name, aliases: [] as string[] }))
      : [{ name: "Nhân vật chính", aliases: [] as string[] }];

  const primary = characters[0]!.name;
  const snippet = prompt.slice(-240).trim() || "Nội dung chương.";

  return extractChapterV1Schema.parse({
    characters,
    relationships: [],
    events: [
      {
        type: "scene",
        summary: `Sự kiện chính liên quan đến ${primary}.`,
        importance: 1,
        characters: [{ name: primary, role: "actor" }],
      },
    ],
    locations: [{ name: "Không gian chương", type: "scene" }],
    abilities: [],
    items: [],
    plot_signals: [{ kind: "hook", text: "Mở đầu hấp dẫn.", strength: 1 }],
    chapter_summary: `Tóm tắt: ${snippet}`,
  });
};

const completeJsonWithOpenAi = async <T>(
  prompt: string,
  schema: JsonSchema<T>,
  system?: string,
): Promise<{ data: T; tokensIn: number; tokensOut: number }> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when LLM_MODE is not fake");
  }

  const model = process.env.LLM_MODEL ?? "gpt-4.1-mini";
  const baseUrl = process.env.AI_GATEWAY_URL ?? "https://api.openai.com/v1";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = payload.choices[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned empty content");
  }

  return {
    data: schema.parse(JSON.parse(content)),
    tokensIn: payload.usage?.prompt_tokens ?? Math.ceil(prompt.length / 4),
    tokensOut:
      payload.usage?.completion_tokens ?? Math.ceil(content.length / 4),
  };
};

const FAKE_VI_BY_TYPE: Record<string, string> = {
  "summary.chapter": "Tóm tắt chương mẫu (VI): nhân vật chính đối mặt thử thách mới.",
  "summary.arc": "Tóm tắt cung truyện mẫu (VI): hành trình phát triển qua nhiều chương.",
  "script.narration": "Kịch bản thuyết minh mẫu (VI): Mở đầu — câu chuyện bắt đầu từ một ngày bình thường...",
  "outline.video": "1. Hook\n2. Bối cảnh\n3. Xung đột\n4. Cao trào\n5. Kết",
  "pack.title": "1. Tiêu đề A\n2. Tiêu đề B\n3. Tiêu đề C",
  "pack.thumbnail_text": "HỌ KHÔNG NGỜ\nBÍ MẬT NÀY\nXEM NGAY",
  "pack.description": "Recap đầy đủ cung truyện — theo dõi để không bỏ lỡ tập sau!",
  "pack.tags": '["recap","truyện","vi","douyin","tiktok","manhua","fantasy","hấp_dẫn"]',
  "pack.hook_3s": "Bạn có tin chuyện này lại bắt đầu từ một viên đá vô danh?",
  remix_generate: JSON.stringify({
    locale: "vi",
    script: {
      narration:
        "Một thiếu niên bất ngờ nhận được sức mạnh ẩn giấu và bước vào hành trình đổi đời.",
      duration_estimate_sec: 120,
      sections: [
        { label: "hook", text: "Bạn có tin chuyện này bắt đầu từ một viên đá?" },
        { label: "body", text: "Câu chuyện mở ra với một nhân vật bình thường..." },
      ],
    },
    hook_3s: {
      spoken: "Bạn có tin chuyện này bắt đầu từ một viên đá?",
      on_screen: "BÍ MẬT BẤT NGỜ",
      visual_hint: "close-up shocked face",
    },
    banners: {
      top: "RECAP HOT",
      bottom: "Theo dõi để xem tiếp",
      watermark: "STUDIO ALPHA",
    },
    packaging: {
      titles: ["Tiêu đề A", "Tiêu đề B", "Tiêu đề C"],
      description: "Recap đầy đủ — theo dõi để không bỏ lỡ!",
      hashtags: ["recap", "douyin", "vi"],
    },
    subtitles: {
      format: "srt",
      cues: [
        {
          start: "00:00:00,000",
          end: "00:00:03,000",
          text: "Bạn có tin chuyện này bắt đầu từ một viên đá?",
        },
      ],
    },
    transform_notes: {
      source_language: "zh",
      rewrite_strategy: "recap_vn_inspired",
      risks: [],
    },
  }),
};

const completeTextWithOpenAi = async (
  prompt: string,
  system?: string,
): Promise<{ text: string; tokensIn: number; tokensOut: number }> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when LLM_MODE is not fake");
  }

  const model = process.env.LLM_MODEL ?? "gpt-4.1-mini";
  const baseUrl = process.env.AI_GATEWAY_URL ?? "https://api.openai.com/v1";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = payload.choices[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned empty content");
  }

  return {
    text: content,
    tokensIn: payload.usage?.prompt_tokens ?? Math.ceil(prompt.length / 4),
    tokensOut:
      payload.usage?.completion_tokens ?? Math.ceil(content.length / 4),
  };
};

export const completeText = async (
  prompt: string,
  options?: { type?: string; system?: string },
): Promise<CompleteTextResult> => {
  const model = process.env.LLM_MODEL ?? "gpt-4.1-mini";
  const tokensIn = Math.ceil(prompt.length / 4);

  if (process.env.LLM_MODE === "fake") {
    const type = options?.type ?? "unknown";
    const text = FAKE_VI_BY_TYPE[type] ?? `[VI mẫu] ${type}`;
    return {
      text,
      model: "fake",
      tokensIn,
      tokensOut: Math.ceil(text.length / 4),
      provider: "fake",
    };
  }

  const result = await completeTextWithOpenAi(prompt, options?.system);
  return {
    ...result,
    model,
    provider: process.env.AI_GATEWAY_URL ? "gateway" : "openai",
  };
};

export const completeJson = async <T>(
  prompt: string,
  schema: JsonSchema<T>,
  options?: { system?: string },
): Promise<CompleteJsonResult<T>> => {
  const model = process.env.LLM_MODEL ?? "gpt-4.1-mini";
  const tokensIn = Math.ceil(prompt.length / 4);

  if (process.env.LLM_MODE === "fake") {
    const raw = prompt.includes("extract.chapter.v1")
      ? buildFakeChapterExtract(prompt)
      : {};
    return {
      data: schema.parse(raw),
      model: "fake",
      tokensIn,
      tokensOut: 120,
      provider: "fake",
    };
  }

  const result = await completeJsonWithOpenAi(prompt, schema, options?.system);
  return {
    ...result,
    model,
    provider: process.env.AI_GATEWAY_URL ? "gateway" : "openai",
  };
};

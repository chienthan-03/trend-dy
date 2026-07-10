import { createHash } from "node:crypto";

const EMBEDDING_DIMENSIONS = 1536;

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

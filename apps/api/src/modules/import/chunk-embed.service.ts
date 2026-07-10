import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { embedTexts } from "../../ai/gateway";
import { chunkText } from "../import/chunker";
import { hashContent } from "../import/import.service";
import type { PrismaService } from "../../prisma/prisma.service";

const EMBEDDING_COST_PER_1K_USD = 0.00002;

export const insertStoryChunk = async (
  prisma: PrismaService,
  input: {
    chapterId: string;
    ordinal: number;
    text: string;
    tokenEstimate: number;
    contentHash: string;
    embedding: number[];
  },
): Promise<void> => {
  const id = randomUUID();
  const vectorLiteral = `[${input.embedding.join(",")}]`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO story_chunks (
      id, chapter_id, ordinal, text, token_estimate, embedding, content_hash, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6::vector, $7, NOW())`,
    id,
    input.chapterId,
    input.ordinal,
    input.text,
    input.tokenEstimate,
    vectorLiteral,
    input.contentHash,
  );
};

export const logEmbeddingUsage = async (
  prisma: PrismaService,
  input: {
    jobId: string;
    provider: string;
    model: string;
    tokensIn: number;
  },
): Promise<void> => {
  const costUsd = (input.tokensIn / 1000) * EMBEDDING_COST_PER_1K_USD;

  await prisma.usageEvent.create({
    data: {
      jobId: input.jobId,
      provider: input.provider,
      model: input.model,
      tokensIn: input.tokensIn,
      tokensOut: 0,
      costUsd,
    },
  });
};

export const chunkAndEmbedStory = async (
  prisma: PrismaService,
  storyId: string,
  jobId: string,
): Promise<{ chaptersProcessed: number; chunksCreated: number; skipped: number }> => {
  const chapters = await prisma.chapter.findMany({
    where: { storyId },
    orderBy: { number: "asc" },
  });

  let chaptersProcessed = 0;
  let chunksCreated = 0;
  let skipped = 0;

  for (const chapter of chapters) {
    const cleanText = chapter.cleanText;
    if (!cleanText?.trim()) {
      continue;
    }

    const contentHash = chapter.contentHash ?? hashContent(cleanText);
    const existingChunk = await prisma.storyChunk.findFirst({
      where: { chapterId: chapter.id, contentHash },
    });

    if (existingChunk) {
      skipped += 1;
      continue;
    }

    await prisma.storyChunk.deleteMany({ where: { chapterId: chapter.id } });

    const chunks = chunkText(cleanText);
    if (chunks.length === 0) {
      continue;
    }

    const embedResult = await embedTexts(chunks.map((chunk) => chunk.text));
    await logEmbeddingUsage(prisma, {
      jobId,
      provider: embedResult.provider,
      model: embedResult.model,
      tokensIn: embedResult.tokensIn,
    });

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index]!;
      const embedding = embedResult.embeddings[index];
      if (!embedding) {
        throw new Error(`Missing embedding for chunk ${index} in chapter ${chapter.id}`);
      }

      await insertStoryChunk(prisma, {
        chapterId: chapter.id,
        ordinal: chunk.ordinal,
        text: chunk.text,
        tokenEstimate: chunk.tokenEstimate,
        contentHash,
        embedding,
      });
      chunksCreated += 1;
    }

    chaptersProcessed += 1;
  }

  return { chaptersProcessed, chunksCreated, skipped };
};

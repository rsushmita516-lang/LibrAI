import crypto from "crypto";
import { redis } from "../redis/redisClient.js";
import { ChatResponse } from "../types.js";
import { config } from "../config.js";

export function computeQuestionHash(question: string): string {
  const normalized = question.trim().toLowerCase().replace(/\s+/g, " ");
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export async function getCachedResponse(
  documentId: string,
  question: string
): Promise<ChatResponse | null> {
  const qHash = computeQuestionHash(question);
  const key = `cache:doc:${documentId}:q:${qHash}`;

  const cachedStr = await redis.get(key);
  if (!cachedStr) return null;

  try {
    const data = JSON.parse(cachedStr) as ChatResponse;
    return {
      ...data,
      cached: true, // Guarantee cached flag is true
    };
  } catch {
    return null;
  }
}

export async function setCachedResponse(
  documentId: string,
  question: string,
  response: ChatResponse,
  ttlSeconds = config.redis.cacheTtlSeconds
): Promise<void> {
  const qHash = computeQuestionHash(question);
  const key = `cache:doc:${documentId}:q:${qHash}`;

  // Store with cached=true inside for serialization consistency
  const dataToStore = {
    ...response,
    cached: true,
  };

  await redis.set(key, JSON.stringify(dataToStore), ttlSeconds);
}

export async function invalidateDocumentCache(documentId: string): Promise<number> {
  const pattern = `cache:doc:${documentId}:*`;
  const deletedCount = await redis.delByPattern(pattern);
  console.log(`[Cache] Invalidated ${deletedCount} cached responses for document ${documentId}`);
  return deletedCount;
}

import { redis } from "../redis/redisClient.js";
import { store } from "../db/store.js";
import { ChatMessage, Citation } from "../types.js";
import { LLMMessage } from "./llm.js";
import { RetrievalResult } from "./retrieval.js";
import { config } from "../config.js";
import { estimateTokenCount } from "./extractor.js";

const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_TOKENS = 1200;

export async function getSessionHistory(sessionId: string): Promise<ChatMessage[]> {
  const redisKey = `session:${sessionId}`;
  const raw = await redis.get(redisKey);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // Fallback
    }
  }

  // Check persistent store
  const stored = await store.getSessionMessages(sessionId);
  if (stored && stored.length > 0) {
    // Populate Redis with TTL
    await redis.set(redisKey, JSON.stringify(stored), config.redis.sessionTtlSeconds);
    return stored;
  }

  return [];
}

export async function appendSessionMessage(sessionId: string, message: ChatMessage): Promise<void> {
  const history = await getSessionHistory(sessionId);
  history.push(message);

  const redisKey = `session:${sessionId}`;
  await redis.set(redisKey, JSON.stringify(history), config.redis.sessionTtlSeconds);
  await store.saveSessionMessages(sessionId, history);
}

export async function clearSession(sessionId: string): Promise<void> {
  const redisKey = `session:${sessionId}`;
  await redis.del(redisKey);
  await store.deleteSession(sessionId);
}

/**
 * Trims conversation history to stay within bounded token and message limits
 */
export function buildBoundedHistory(messages: ChatMessage[]): LLMMessage[] {
  const recent = messages.slice(-MAX_HISTORY_MESSAGES);
  const formatted: LLMMessage[] = [];
  let tokenSum = 0;

  // Process backwards from most recent
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    const tokens = estimateTokenCount(msg.content);
    if (tokenSum + tokens > MAX_HISTORY_TOKENS && formatted.length > 0) {
      break;
    }
    tokenSum += tokens;
    formatted.unshift({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    });
  }

  return formatted;
}

/**
 * Constructs the prompt with strict document grounding and chunk citation instructions
 */
export function buildGroundingPrompt(
  question: string,
  retrievalResults: RetrievalResult[],
  history: LLMMessage[]
): LLMMessage[] {
  const contextSections = retrievalResults.map((r, i) => {
    return `[Passage ${i + 1} | Page ${r.chunk.pageNumber} | Chunk ${r.chunk.chunkIndex}]\n${r.chunk.text}`;
  });

  const contextBlock =
    contextSections.length > 0
      ? `--- CONTEXT CHUNKS START ---\n${contextSections.join("\n\n")}\n--- CONTEXT CHUNKS END ---`
      : "--- NO RELEVANT CONTEXT FOUND IN DOCUMENT ---";

  const systemInstruction = `You are LibrAI, a highly meticulous and production-grade AI Document Assistant.
Your core mission is to answer user questions truthfully and STRICTLY based on the provided document excerpts.

CRITICAL OPERATIONAL RULES:
1. STRICT DOCUMENT GROUNDING: Answer ONLY using the facts, numbers, dates, and statements directly present in the context excerpts below. Do not use outside knowledge or make assumptions.
2. ABSOLUTE REFUSAL IF UNAVAILABLE: If the question cannot be answered completely using the provided excerpts, you MUST explicitly state: "The uploaded document does not contain sufficient information to answer this question." Do NOT hallucinate or guess.
3. CITATIONS & TRANSPARENCY: Whenever you state a key fact, reference the source chunk using bracket notation: [Page X, Chunk Y] or [Passage N].
4. CONVERSATIONAL CONTINUITY: You may reference prior turns in the conversation if they clarify the user's intent, but always ground any factual answers in the retrieved excerpts.
5. OBJECTIVITY & PRECISION: Provide concise, clear, and well-formatted answers with markdown lists or bold key points where appropriate.

${contextBlock}`;

  const messages: LLMMessage[] = [
    {
      role: "system",
      content: systemInstruction,
    },
    ...history,
    {
      role: "user",
      content: question,
    },
  ];

  return messages;
}

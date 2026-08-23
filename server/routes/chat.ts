import { Router, Request, Response } from "express";
import crypto from "crypto";
import { store } from "../db/store.js";
import { retrieveRelevantChunks, formatCitations } from "../services/retrieval.js";
import { generateLLMAnswer } from "../services/llm.js";
import {
  getSessionHistory,
  appendSessionMessage,
  clearSession,
  buildBoundedHistory,
  buildGroundingPrompt,
} from "../services/contextManager.js";
import { getCachedResponse, setCachedResponse } from "../services/cache.js";
import { ChatRequest, ChatResponse, ChatMessage } from "../types.js";
import { config } from "../config.js";

export const chatRouter = Router();

chatRouter.post("/", async (req: Request, res: Response): Promise<any> => {
  const startTime = Date.now();

  try {
    const { documentId, sessionId, question, llmProviderOverride } = req.body as ChatRequest;

    // 1. Validation
    if (!documentId || typeof documentId !== "string" || documentId.trim() === "") {
      return res.status(400).json({
        error: "Bad Request",
        message: "Field 'documentId' is required.",
      });
    }

    if (!sessionId || typeof sessionId !== "string" || sessionId.trim() === "") {
      return res.status(400).json({
        error: "Bad Request",
        message: "Field 'sessionId' is required.",
      });
    }

    if (!question || typeof question !== "string" || question.trim() === "") {
      return res.status(400).json({
        error: "Bad Request",
        message: "Field 'question' cannot be empty.",
      });
    }

    if (question.length > 2000) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Question exceeds maximum length limit of 2000 characters.",
      });
    }

    // 2. Validate document
    const doc = await store.getDocument(documentId);
    if (!doc) {
      return res.status(404).json({
        error: "Not Found",
        message: `Document with ID '${documentId}' not found. Please upload a document first.`,
      });
    }

    if (doc.status !== "ready") {
      return res.status(409).json({
        error: "Conflict",
        message: `Document '${documentId}' is still in status '${doc.status}'. Please wait until ready.`,
      });
    }

    // 3. Check Redis Response Cache
    const cachedResult = await getCachedResponse(documentId, question);
    if (cachedResult) {
      // Append cached turn to session history for conversational context
      const userMsg: ChatMessage = {
        id: `msg_${crypto.randomBytes(6).toString("hex")}`,
        role: "user",
        content: question,
        timestamp: new Date().toISOString(),
      };
      const assistantMsg: ChatMessage = {
        id: `msg_${crypto.randomBytes(6).toString("hex")}`,
        role: "assistant",
        content: cachedResult.answer,
        timestamp: new Date().toISOString(),
        citations: cachedResult.citations,
        cached: true,
        evidenceStatus: cachedResult.evidenceStatus,
        confidenceScore: cachedResult.confidenceScore,
        latencyMs: Date.now() - startTime,
      };

      await appendSessionMessage(sessionId, userMsg);
      await appendSessionMessage(sessionId, assistantMsg);

      return res.status(200).json({
        ...cachedResult,
        cached: true, // Explicit mandatory cache hit flag
        sessionId,
        latencyMs: Date.now() - startTime,
      });
    }

    // 4. Session history
    const sessionHistory = await getSessionHistory(sessionId);
    const boundedHistory = buildBoundedHistory(sessionHistory);

    // 5. Retrieve relevant chunks
    const retrievalResults = await retrieveRelevantChunks(documentId, question, undefined, 4);
    const citations = formatCitations(retrievalResults);

    // Top chunk confidence score
    const topScore = retrievalResults.length > 0 ? retrievalResults[0].score : 0;
    let evidenceStatus: ChatResponse["evidenceStatus"] = "supported";

    if (retrievalResults.length === 0 || topScore < 0.15) {
      evidenceStatus = "insufficient";
    } else if (topScore < config.evidence.confidenceThreshold) {
      evidenceStatus = "insufficient";
    }

    // 6. Build prompt
    const promptMessages = buildGroundingPrompt(question, retrievalResults, boundedHistory);

    // 7. Call LLM
    const llmResult = await generateLLMAnswer({
      messages: promptMessages,
      provider: llmProviderOverride,
    });

    const latencyMs = Date.now() - startTime;

    const responsePayload: ChatResponse = {
      answer: llmResult.content,
      cached: false,
      documentId,
      sessionId,
      citations,
      evidenceStatus,
      confidenceScore: topScore,
      latencyMs,
      provider: llmResult.provider,
      model: llmResult.model,
      retrievedChunksCount: retrievalResults.length,
    };

    // 8. Record in Session History (with Redis TTL)
    const userMsg: ChatMessage = {
      id: `msg_${crypto.randomBytes(6).toString("hex")}`,
      role: "user",
      content: question,
      timestamp: new Date().toISOString(),
    };
    const assistantMsg: ChatMessage = {
      id: `msg_${crypto.randomBytes(6).toString("hex")}`,
      role: "assistant",
      content: llmResult.content,
      timestamp: new Date().toISOString(),
      citations,
      cached: false,
      evidenceStatus,
      confidenceScore: topScore,
      latencyMs,
    };

    await appendSessionMessage(sessionId, userMsg);
    await appendSessionMessage(sessionId, assistantMsg);

    // 9. Cache in Redis
    await setCachedResponse(documentId, question, responsePayload);

    return res.status(200).json(responsePayload);
  } catch (err: any) {
    console.error("[Chat Route] Error:", err);
    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message || "Failed to generate answer.",
      latencyMs: Date.now() - startTime,
    });
  }
});

// Get session history
chatRouter.get("/sessions/:sessionId/history", async (req: Request, res: Response): Promise<any> => {
  try {
    const { sessionId } = req.params;
    const history = await getSessionHistory(sessionId);
    return res.status(200).json({
      sessionId,
      messageCount: history.length,
      messages: history,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to retrieve session history" });
  }
});

// Clear session
chatRouter.delete("/sessions/:sessionId", async (req: Request, res: Response): Promise<any> => {
  try {
    const { sessionId } = req.params;
    await clearSession(sessionId);
    return res.status(200).json({
      message: `Session '${sessionId}' cleared successfully.`,
      sessionId,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to clear session" });
  }
});

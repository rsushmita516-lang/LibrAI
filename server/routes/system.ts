import { Router, Request, Response } from "express";
import { redis } from "../redis/redisClient.js";
import { store } from "../db/store.js";
import { config } from "../config.js";

export const systemRouter = Router();

// Health check
systemRouter.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "LibrAI Document Assistant",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// Readiness check
systemRouter.get("/ready", async (_req: Request, res: Response): Promise<any> => {
  try {
    const redisPing = await redis.ping();
    const redisStats = await redis.getStats();
    const docs = await store.listDocuments();

    const isReady = true;

    return res.status(200).json({
      status: isReady ? "ready" : "degraded",
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: "connected",
          type: "durable-json-store",
          documentsCount: docs.length,
        },
        redis: {
          status: "connected",
          type: redisStats.type,
          ping: redisPing,
          keysCount: redisStats.keysCount,
        },
        llm: {
          activeProvider: config.llmProvider,
          ollamaBaseUrl: config.ollama.baseUrl,
          ollamaModel: config.ollama.model,
          groqConfigured: !!config.groq.apiKey,
          openaiConfigured: !!config.openai.apiKey,
        },
      },
    });
  } catch (err: any) {
    return res.status(503).json({
      status: "unhealthy",
      error: err.message,
    });
  }
});

// System config overview (safe, no secrets exposed)
systemRouter.get("/config", async (_req: Request, res: Response): Promise<any> => {
  const redisStats = await redis.getStats();

  return res.status(200).json({
    appUrl: config.appUrl,
    llmProvider: config.llmProvider,
    ollama: {
      baseUrl: config.ollama.baseUrl,
      model: config.ollama.model,
      embedModel: config.ollama.embedModel,
    },
    redis: {
      type: redisStats.type,
      connected: redisStats.connected,
      keysCount: redisStats.keysCount,
      sessionTtlSeconds: config.redis.sessionTtlSeconds,
      cacheTtlSeconds: config.redis.cacheTtlSeconds,
      rateLimitMaxRequests: config.redis.rateLimitMaxRequests,
      rateLimitWindowSeconds: config.redis.rateLimitWindowSeconds,
    },
    chunking: {
      targetTokens: config.chunking.targetTokens,
      overlapTokens: config.chunking.overlapTokens,
      maxUploadMb: config.chunking.maxUploadMb,
    },
    evidence: {
      confidenceThreshold: config.evidence.confidenceThreshold,
    },
  });
});

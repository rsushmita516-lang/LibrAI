import dotenv from "dotenv";
dotenv.config();

export interface AppConfig {
  port: number;
  appUrl: string;
  llmProvider: "ollama" | "groq" | "openai";
  ollama: {
    baseUrl: string;
    model: string;
    embedModel: string;
  };
  groq: {
    apiKey: string;
    model: string;
  };
  openai: {
    apiKey: string;
    model: string;
  };
  redis: {
    url: string;
    sessionTtlSeconds: number;
    cacheTtlSeconds: number;
    rateLimitWindowSeconds: number;
    rateLimitMaxRequests: number;
  };
  chunking: {
    targetTokens: number;
    overlapTokens: number;
    maxUploadMb: number;
  };
  evidence: {
    confidenceThreshold: number;
  };
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || "3000", 10),
  appUrl: process.env.APP_URL || "http://localhost:3000",
  llmProvider: (process.env.LLM_PROVIDER as AppConfig["llmProvider"]) || "ollama",
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    model: process.env.OLLAMA_MODEL || "qwen2.5:3b",
    embedModel: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  },
  redis: {
    url: process.env.REDIS_URL || "",
    sessionTtlSeconds: parseInt(process.env.SESSION_TTL_SECONDS || "86400", 10),
    cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || "3600", 10),
    rateLimitWindowSeconds: parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS || "60", 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "10", 10),
  },
  chunking: {
    targetTokens: parseInt(process.env.CHUNK_SIZE_TOKENS || "800", 10),
    overlapTokens: parseInt(process.env.CHUNK_OVERLAP_TOKENS || "120", 10),
    maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || "10", 10),
  },
  evidence: {
    confidenceThreshold: parseFloat(process.env.EVIDENCE_CONFIDENCE_THRESHOLD || "0.45"),
  },
};

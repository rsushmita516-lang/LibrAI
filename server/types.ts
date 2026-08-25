export interface DocumentRecord {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  status: "processing" | "ready" | "failed";
  errorMessage?: string;
  pageCount?: number;
  totalTokens?: number;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
  summary?: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  pageNumber: number;
  startChar: number;
  endChar: number;
  tokenCount: number;
  embedding?: number[];
  keywords: string[];
}

export interface Citation {
  chunkId: string;
  pageNumber: number;
  chunkIndex: number;
  relevanceScore: number;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  citations?: Citation[];
  cached?: boolean;
  evidenceStatus?: "supported" | "insufficient" | "unsupported";
  confidenceScore?: number;
  latencyMs?: number;
}

export interface ChatRequest {
  documentId: string;
  sessionId: string;
  question: string;
  llmProviderOverride?: "ollama" | "groq" | "openai";
}

export interface ChatResponse {
  answer: string;
  cached: boolean;
  documentId: string;
  sessionId: string;
  citations: Citation[];
  evidenceStatus: "supported" | "insufficient" | "unsupported";
  confidenceScore: number;
  latencyMs: number;
  provider: string;
  model: string;
  retrievedChunksCount: number;
}

export interface SessionData {
  sessionId: string;
  documentId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

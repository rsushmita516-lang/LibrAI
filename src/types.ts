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

export interface SystemStatus {
  status: string;
  timestamp: string;
  checks: {
    database: {
      status: string;
      type: string;
      documentsCount: number;
    };
    redis: {
      status: string;
      type: string;
      ping: string;
      keysCount: number;
    };
    llm: {
      activeProvider: string;
      ollamaBaseUrl: string;
      ollamaModel: string;
      groqConfigured: boolean;
      openaiConfigured: boolean;
    };
  };
}

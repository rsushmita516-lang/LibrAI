import fs from "fs";
import path from "path";
import { DocumentRecord, DocumentChunk, ChatMessage } from "../types.js";

interface StoreSchema {
  documents: Record<string, DocumentRecord>;
  chunks: Record<string, DocumentChunk[]>;
  sessions: Record<string, ChatMessage[]>;
}

class DocumentStore {
  private dataDir: string;
  private filePath: string;
  private saveQueue: Promise<void> = Promise.resolve();
  private memoryData: StoreSchema = {
    documents: {},
    chunks: {},
    sessions: {},
  };

  constructor() {
    this.dataDir = path.join(process.cwd(), "data");
    this.filePath = path.join(this.dataDir, "librai_store.json");
    this.initStore();
  }

  private initStore() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw);
        this.memoryData = {
          documents: parsed.documents || {},
          chunks: parsed.chunks || {},
          sessions: parsed.sessions || {},
        };
      } else {
        void this.saveToDisk();
      }
    } catch (e) {
      console.warn("[Store] Could not load stored json, initializing in-memory:", e);
    }
  }

  private saveToDisk(): Promise<void> {
    const write = this.saveQueue.then(() => {
      const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.${Math.random()
        .toString(16)
        .slice(2)}.tmp`;
      try {
        if (!fs.existsSync(this.dataDir)) {
          fs.mkdirSync(this.dataDir, { recursive: true });
        }
        fs.writeFileSync(tmpPath, JSON.stringify(this.memoryData, null, 2), "utf-8");
        try {
          fs.renameSync(tmpPath, this.filePath);
        } catch (error: any) {
          if (!["EPERM", "EACCES", "EBUSY"].includes(error.code)) {
            throw error;
          }
          fs.copyFileSync(tmpPath, this.filePath);
          fs.unlinkSync(tmpPath);
        }
      } catch (e) {
        console.error("[Store] Error saving database to disk:", e);
        try {
          if (fs.existsSync(tmpPath)) {
            fs.unlinkSync(tmpPath);
          }
        } catch {
          // Ignore cleanup errors after a failed persistence attempt.
        }
      }
    });

    this.saveQueue = write;
    return write;
  }

  // Documents
  async saveDocument(doc: DocumentRecord): Promise<DocumentRecord> {
    this.memoryData.documents[doc.id] = doc;
    await this.saveToDisk();
    return doc;
  }

  async getDocument(id: string): Promise<DocumentRecord | null> {
    return this.memoryData.documents[id] || null;
  }

  async getDocumentByChecksum(checksum: string): Promise<DocumentRecord | null> {
    for (const doc of Object.values(this.memoryData.documents)) {
      if (doc.checksum === checksum) {
        return doc;
      }
    }
    return null;
  }

  async listDocuments(): Promise<DocumentRecord[]> {
    return Object.values(this.memoryData.documents).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async updateDocument(id: string, updates: Partial<DocumentRecord>): Promise<DocumentRecord | null> {
    const existing = this.memoryData.documents[id];
    if (!existing) return null;
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.memoryData.documents[id] = updated;
    await this.saveToDisk();
    return updated;
  }

  async deleteDocument(id: string): Promise<boolean> {
    if (!this.memoryData.documents[id]) return false;
    delete this.memoryData.documents[id];
    delete this.memoryData.chunks[id];
    await this.saveToDisk();
    return true;
  }

  // Chunks
  async saveChunks(documentId: string, chunks: DocumentChunk[]): Promise<DocumentChunk[]> {
    this.memoryData.chunks[documentId] = chunks;
    await this.saveToDisk();
    return chunks;
  }

  async getChunks(documentId: string): Promise<DocumentChunk[]> {
    return this.memoryData.chunks[documentId] || [];
  }

  async getChunkById(documentId: string, chunkId: string): Promise<DocumentChunk | null> {
    const chunks = this.memoryData.chunks[documentId] || [];
    return chunks.find((c) => c.id === chunkId) || null;
  }

  // Messages / Sessions
  async saveSessionMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
    this.memoryData.sessions[sessionId] = messages;
    await this.saveToDisk();
  }

  async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    return this.memoryData.sessions[sessionId] || [];
  }

  async deleteSession(sessionId: string): Promise<void> {
    delete this.memoryData.sessions[sessionId];
    await this.saveToDisk();
  }
}

export const store = new DocumentStore();

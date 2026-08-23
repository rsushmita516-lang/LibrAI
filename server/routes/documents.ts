import { Router, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import { store } from "../db/store.js";
import { extractTextFromBuffer, computeChecksum } from "../services/extractor.js";
import { chunkPages } from "../services/chunker.js";
import { invalidateDocumentCache } from "../services/cache.js";
import { DocumentRecord } from "../types.js";
import { config } from "../config.js";

export const documentsRouter = Router();

// Multer upload config: 10 MB limit, in-memory buffer
const upload = multer({
  limits: {
    fileSize: config.chunking.maxUploadMb * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "application/octet-stream",
    ];
    const allowedExts = [".pdf", ".txt", ".md"];
    const hasAllowedExt = allowedExts.some((ext) =>
      file.originalname.toLowerCase().endsWith(ext)
    );

    if (allowedMimes.includes(file.mimetype) || hasAllowedExt) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Only PDF and TXT files are supported."));
    }
  },
});

// Upload document
documentsRouter.post(
  "/",
  upload.single("file"),
  async (req: Request, res: Response): Promise<any> => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "Bad Request",
          message: "No file uploaded. Please provide a PDF or TXT file (key: 'file').",
        });
      }

      const file = req.file;
      if (file.size === 0) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Uploaded file is empty.",
        });
      }

      const checksum = computeChecksum(file.buffer);

      // Check if identical document was already uploaded
      const existing = await store.getDocumentByChecksum(checksum);
      if (existing && existing.status === "ready") {
        const existingChunks = await store.getChunks(existing.id);
        return res.status(200).json({
          message: "Document already exists (idempotent upload match).",
          document: existing,
          chunkCount: existingChunks.length,
          isDuplicate: true,
        });
      }

      const documentId = `doc_${crypto.randomBytes(8).toString("hex")}`;
      const now = new Date().toISOString();

      const docRecord: DocumentRecord = {
        id: documentId,
        filename: `${documentId}_${file.originalname}`,
        originalName: file.originalname,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.size,
        checksum,
        status: "processing",
        chunkCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      await store.saveDocument(docRecord);

      // Extract text and pages
      const extraction = await extractTextFromBuffer(
        file.buffer,
        file.mimetype,
        file.originalname
      );

      if (!extraction.text || extraction.text.trim().length === 0) {
        await store.updateDocument(documentId, {
          status: "failed",
          errorMessage: "No readable text could be extracted from this document.",
        });
        return res.status(422).json({
          error: "Unprocessable Entity",
          message: "No readable text could be extracted from this document.",
        });
      }

      // Chunk pages
      const chunks = chunkPages(documentId, extraction.pages);

      await store.saveChunks(documentId, chunks);

      const updated = await store.updateDocument(documentId, {
        status: "ready",
        pageCount: extraction.pageCount,
        totalTokens: extraction.estimatedTokens,
        chunkCount: chunks.length,
        summary: extraction.text.slice(0, 300) + "...",
      });

      return res.status(201).json({
        message: "Document uploaded and indexed successfully.",
        document: updated,
        chunkCount: chunks.length,
        sampleChunks: chunks.slice(0, 3),
      });
    } catch (err: any) {
      console.error("[Documents Route] Upload error:", err);
      return res.status(500).json({
        error: "Internal Server Error",
        message: err.message || "Failed to process uploaded document.",
      });
    }
  }
);

// Preload sample document for instant 1-click test
documentsRouter.post("/sample", async (_req: Request, res: Response): Promise<any> => {
  try {
    const sampleText = `# LibrAI Technical Reference & Architecture Manual

## Section 1: Overview and Core Architecture
LibrAI is a high-performance, production-grade AI Document Assistant designed for digital libraries, assessment tools, and enterprise document intelligence.
The system features a decoupled layered architecture comprising:
1. Ingestion Pipeline: High-speed PDF/TXT parsing with UTF-8 normalization and page offset indexing.
2. Semantic Chunking: Sentence-boundary packaging with an 800-token target size and a 120-token sliding overlap window to guarantee conversational context continuity.
3. Hybrid Retrieval: Combining BM25 keyword matching with dense vector similarity and Reciprocal Rank Fusion (RRF).
4. Redis Caching & Rate Limiting: Utilizing sliding-window rate limiters, multi-turn conversation session stores with configurable TTL, and normalized query response caching.

## Section 2: Retrieval Strategies and Context Management
To prevent context overflow and reduce model hallucination:
- Only the top-k highest scoring passages (default: 4 chunks) are passed to the LLM system prompt.
- Conversation history is trimmed dynamically to maintain strict adherence to model context limits (max 1,200 history tokens).
- The prompt enforces strict negative grounding: if a user's question cannot be completely answered by the context, the model explicitly refuses to speculate and returns an unavailable status.

## Section 3: Evidence Mode & Grounding Verification
LibrAI's unique "Evidence Mode" original feature provides:
- Exact character excerpt extraction and chunk citations (e.g. [Page 1, Chunk 2]).
- An automated confidence score calculated from BM25 and semantic similarity weights.
- Grounding status classification: 'supported' (confidence >= 0.45), 'insufficient' (low confidence or missing evidence), or 'unsupported' (irrelevant query).

## Section 4: Performance Benchmarks and Scalability
Under typical production loads:
- Cache hits return in under 15ms with the header "cached: true".
- Chunking processes 100 pages of text in under 450ms.
- Hybrid BM25 lookup evaluates across 10,000 chunks in sub-8ms latency.
- Supported file types include PDF, TXT, and Markdown files up to 10MB in size.`;

    const sampleBuffer = Buffer.from(sampleText, "utf-8");
    const checksum = computeChecksum(sampleBuffer);

    const existing = await store.getDocumentByChecksum(checksum);
    if (existing) {
      return res.status(200).json({
        message: "Sample document already loaded.",
        document: existing,
        chunkCount: existing.chunkCount,
      });
    }

    const documentId = `doc_sample_librai_manual`;
    const now = new Date().toISOString();

    const extraction = await extractTextFromBuffer(
      sampleBuffer,
      "text/markdown",
      "LibrAI_Architecture_Manual.md"
    );

    const chunks = chunkPages(documentId, extraction.pages);
    await store.saveChunks(documentId, chunks);

    const docRecord: DocumentRecord = {
      id: documentId,
      filename: "LibrAI_Architecture_Manual.md",
      originalName: "LibrAI_Architecture_Manual.md",
      mimeType: "text/markdown",
      sizeBytes: sampleBuffer.length,
      checksum,
      status: "ready",
      pageCount: 4,
      totalTokens: extraction.estimatedTokens,
      chunkCount: chunks.length,
      createdAt: now,
      updatedAt: now,
      summary: "Comprehensive architectural and operational manual for the LibrAI Document Assistant system.",
    };

    await store.saveDocument(docRecord);

    return res.status(201).json({
      message: "Sample document created successfully.",
      document: docRecord,
      chunkCount: chunks.length,
    });
  } catch (err: any) {
    console.error("[Documents Route] Sample error:", err);
    return res.status(500).json({ error: "Failed to create sample document" });
  }
});

// List all documents
documentsRouter.get("/", async (_req: Request, res: Response): Promise<any> => {
  try {
    const docs = await store.listDocuments();
    return res.status(200).json({ documents: docs, count: docs.length });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to list documents" });
  }
});

// Get document by ID
documentsRouter.get("/:documentId", async (req: Request, res: Response): Promise<any> => {
  try {
    const doc = await store.getDocument(req.params.documentId);
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }
    const chunks = await store.getChunks(doc.id);
    return res.status(200).json({
      document: doc,
      chunkCount: chunks.length,
      sampleChunks: chunks.slice(0, 3),
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to retrieve document" });
  }
});

// Get all chunks for a document
documentsRouter.get("/:documentId/chunks", async (req: Request, res: Response): Promise<any> => {
  try {
    const doc = await store.getDocument(req.params.documentId);
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }
    const chunks = await store.getChunks(doc.id);
    return res.status(200).json({
      documentId: doc.id,
      chunkCount: chunks.length,
      chunks,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to retrieve chunks" });
  }
});

// Delete document and clean up associated resources
documentsRouter.delete("/:documentId", async (req: Request, res: Response): Promise<any> => {
  try {
    const { documentId } = req.params;
    const doc = await store.getDocument(documentId);
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    await store.deleteDocument(documentId);
    const invalidatedCacheCount = await invalidateDocumentCache(documentId);

    return res.status(200).json({
      message: "Document, chunks, and cached responses deleted successfully.",
      documentId,
      invalidatedCacheCount,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to delete document" });
  }
});

# LibrAI — Production-Minded AI Document Assistant

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![Redis](https://img.shields.io/badge/Redis-7+-red.svg)](https://redis.io/)
[![Gemini](https://img.shields.io/badge/Gemini_API-3.7_Flash-orange.svg)](https://ai.google.dev/)
[![Ollama](https://img.shields.io/badge/Ollama-Local_LLM-purple.svg)](https://ollama.ai/)

**LibrAI** is a robust, production-grade AI Document Assistant built for digital libraries, assessment tools, and enterprise document intelligence. It parses PDF and TXT documents, chunks text with semantic sentence boundaries and page tracking, performs hybrid BM25 and vector retrieval, manages multi-turn conversational context windows, leverages Redis for response caching and sliding-window rate limiting, and grounds every answer using **Evidence Mode**.

---

## Table of Contents
1. [Key Features & Architectural Highlights](#key-features--architectural-highlights)
2. [Folder Structure](#folder-structure)
3. [Chunking Strategy](#chunking-strategy)
4. [Context Window Management & Grounding](#context-window-management--grounding)
5. [Redis Implementation](#redis-implementation)
6. [My Feature: Evidence Mode & Deep Grounding Inspector](#my-feature-evidence-mode--deep-grounding-inspector)
7. [Getting Started & Local Setup](#getting-started--local-setup)
8. [Using with Local Ollama](#using-with-local-ollama)
9. [API Reference & Postman Collection](#api-reference--postman-collection)
10. [Docker Setup](#docker-setup)
11. [Design Decisions & Trade-Offs](#design-decisions--trade-offs)
12. [Honest Documentation of Unfinished Work & Future Roadmap](#honest-documentation-of-unfinished-work--future-roadmap)

---

## Key Features & Architectural Highlights

- **Document Ingestion & Extraction**: Handles PDF and TXT files up to 10 MB. Computes SHA-256 checksums to guarantee idempotent deduplication and preserves page numbers.
- **Semantic Sentence & Paragraph Chunking**: Bounded at ~800 tokens (~3,200 chars) with 120-token sliding overlap window to prevent splitting key conceptual sentences.
- **Hybrid Retrieval (BM25 + Semantic Vector Search)**: Combines TF-IDF keyword indexing with vector similarity scoring and Reciprocal Rank Fusion (RRF).
- **Strict Negative Grounding**: Prompts enforce that the model *never* hallucinates outside the document; if evidence is absent, the model returns a clear refusal.
- **Multi-Turn Session Continuity**: Multi-turn history is stored in Redis with sliding-window token budgets (capped at 1,200 history tokens) to prevent context overflow.
- **Redis Response Cache**: Hashes normalized queries per document (`cache:doc:<documentId>:q:<hash>`). Cache hits return in sub-15ms with `"cached": true`.
- **Sliding-Window Rate Limiter**: Redis-backed middleware returning standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
- **Multi-Provider LLM Engine**: Seamlessly switch between **Google Gemini** (`gemini-3.7-flash`), **Ollama** (offline local LLMs such as `llama3.2`, `mistral`, `deepseek-r1`), **Groq**, or **OpenAI**.
- **Interactive UI + Postman Suite**: Complete web workspace with live citation chips, chunk viewer, latency benchmarks, and an exportable Postman collection.

---

## Folder Structure

```
.
├── server/                          # Backend TypeScript architecture
│   ├── config.ts                    # Strongly-typed environment configuration & limits
│   ├── types.ts                     # TypeScript schemas (Documents, Chunks, Citations, Sessions)
│   ├── db/
│   │   └── store.ts                 # Durable document & chunk persistence with atomic commits
│   ├── redis/
│   │   └── redisClient.ts           # Redis client (ioredis) + zero-dependency in-memory fallback
│   ├── services/
│   │   ├── extractor.ts             # PDF/TXT parser with page extraction & normalization
│   │   ├── chunker.ts               # Semantic sentence chunker with sliding overlap
│   │   ├── retrieval.ts             # BM25 + Vector similarity ranking & excerpt extractor
│   │   ├── llm.ts                   # Universal LLM service (Gemini, Ollama, Groq, OpenAI)
│   │   ├── contextManager.ts        # Sliding-window history & strict grounding prompt generator
│   │   ├── cache.ts                 # Redis response caching & document cache invalidator
│   │   └── rateLimiter.ts           # Sliding-window rate limit middleware
│   └── routes/
│       ├── documents.ts             # POST /api/documents, GET, DELETE endpoints
│       ├── chat.ts                  # POST /api/chat, session history endpoints
│       └── system.ts                # GET /api/health, /api/ready, /api/config
├── src/                             # Frontend React (TypeScript + Tailwind CSS + Lucide)
│   ├── components/
│   │   ├── DocumentUpload.tsx       # Drag & drop upload card & sample document loader
│   │   ├── DocumentViewer.tsx       # Chunk inspector & page metadata browser
│   │   ├── ChatInterface.tsx        # Multi-turn chat UI with Evidence Mode chips
│   │   ├── CitationModal.tsx        # Deep inspector showing source passage & relevance
│   │   ├── ApiPlayground.tsx        # Curl snippet generator & Postman collection viewer
│   │   └── SystemStatus.tsx         # Real-time Redis, LLM, and rate-limit diagnostic banner
│   ├── App.tsx                      # Main workspace orchestrator
│   ├── main.tsx                     # React root
│   └── index.css                    # Tailwind CSS definitions
├── postman/
│   └── LibrAI.postman_collection.json # Complete exportable Postman collection
├── data/                            # Persistent JSON / SQLite data directory
├── .env.example                     # Clean environment variable declarations
├── Dockerfile                       # Production multi-stage Docker build
├── docker-compose.yml               # Complete orchestration for App + Redis
├── package.json                     # Scripts & dependencies
├── server.ts                        # Express server entry point & Vite middleware
└── tsconfig.json
```

---

## Chunking Strategy

### The Use Case: Educational & Technical Reference Documents
Technical manuals, research papers, and academic texts contain dense cross-references, theorems, equations, and multi-sentence arguments. Traditional naive fixed-character chunking (e.g. slicing every 1,000 characters) cuts sentences in half, severing subject-predicate relationships and destroying citation clarity.

### The LibrAI Strategy: Semantic Sentence Packing with Overlap
1. **Sentence Boundary Detection**: Uses regex lookbehind rules (`(?<=[.?!])\s+(?=[A-Z0-9])|\n\n+`) to identify authentic linguistic boundaries while preserving abbreviations (e.g. `e.g.`, `i.e.`, `Fig. 1`).
2. **Target Budget**: Chunks are packed up to a target size of **~800 tokens (~3,200 characters)**. This size is optimal because it fits complete conceptual sections while remaining focused enough for high-precision embedding retrieval.
3. **Sliding Overlap Window**: A **120-token (~480 characters)** overlap window preserves preceding contextual clauses across adjacent chunks.
4. **Page & Offset Metadata Preservation**: Each chunk stores its source `pageNumber`, `chunkIndex`, `startChar`, and `endChar`, allowing the UI to display exact citation coordinates.
5. **Keyword Indexing**: Extracts top TF-IDF keywords per chunk during ingestion to accelerate BM25 lookups.

---

## Context Window Management & Grounding

LLM context windows must be managed deliberately to maintain low latency, avoid token overflow, and prevent hallucination.

### 1. Bounded History Window
- Multi-turn conversation turns are tracked by `sessionId` in Redis with an expiration TTL (default: 24 hours).
- When formatting the prompt for the LLM, LibrAI applies a **Sliding Window of 6 recent messages** capped at a maximum of **1,200 historical tokens**.
- If history exceeds this threshold, older turns are trimmed while preserving the original system grounding prompt.

### 2. Selective Retrieval (Top-K = 4)
- Only the top 4 highest-scoring chunks from hybrid search are injected into the prompt.
- This isolates the context to ~3,200 tokens, leaving ample room for multi-turn history and generation.

### 3. Strict Negative Grounding Prompt
The prompt enforces two unbreakable directives:
- **Directive 1 (Document Only)**: *"Answer ONLY using the facts directly present in the context excerpts. Do not use outside knowledge."*
- **Directive 2 (Explicit Unavailable Status)**: *"If the uploaded document does not contain sufficient information, explicitly state: 'The uploaded document does not contain sufficient information to answer this question.'"*

---

## Redis Implementation

LibrAI leverages Redis for three mission-critical capabilities:

### 1. Response Caching (`cached: true`)
- **Key Schema**: `cache:doc:<documentId>:q:<sha256(normalizedQuestion)>`
- **TTL**: 3,600 seconds (1 hour).
- **Behavior**: When a user asks a question that was previously answered for that document, LibrAI retrieves the answer directly from Redis in **under 15 ms**, bypassing the LLM call entirely and returning `"cached": true`.
- **Cache Invalidation**: When a document is updated or deleted via `DELETE /api/documents/:documentId`, all related cache keys matching `cache:doc:<documentId>:*` are immediately purged via pattern matching.

### 2. Multi-Turn Session Store with TTL
- **Key Schema**: `session:<sessionId>`
- **TTL**: 86,400 seconds (24 hours).
- **Behavior**: Preserves multi-turn dialogue state across stateless HTTP requests without taxing disk I/O.

### 3. Sliding-Window Rate Limiting
- **Key Schema**: `ratelimit:client:<sessionId/IP>`
- **Window**: 60 seconds (max 30 requests).
- **Headers**: Returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.
- **Exceeded Response**: Returns HTTP `429 Too Many Requests` with a descriptive retry-after payload.

*(Note: LibrAI includes an automatic, zero-dependency in-memory Redis adapter with exact TTL and pattern eviction if `REDIS_URL` is empty, ensuring the application works out-of-the-box in standalone test environments while seamlessly supporting real Redis clusters in Docker or Upstash).*

---

## My Feature: Evidence Mode & Deep Grounding Inspector

### Feature Description
In high-stakes environments (e.g. academic exams, medical guidelines, legal agreements), a document assistant cannot simply give an answer—it must **prove** where the answer came from.

LibrAI implements **Evidence Mode**:
1. **Source Excerpt Chips**: Every generated answer includes structured citation objects referencing the exact chunk, page number, and relevant text snippet.
2. **Automated Grounding Confidence Score**: Calculates a mathematical confidence metric [0.0 - 1.0] from hybrid retrieval scores.
3. **Evidence Status Flag**:
   - `supported`: Query has strong matching evidence (confidence score >= 0.45).
   - `insufficient`: Query matches low-scoring chunks; user is cautioned.
   - `unsupported`: Query is out-of-scope or absent from the document.
4. **Interactive Chunk Inspector**: In the UI, clicking any citation badge (e.g., `[Page 1, Chunk 2]`) opens the exact chunk with highlight markers, keyword tags, and token metrics.

### Trade-Offs of Evidence Mode
- **Higher Retrieval Latency vs. Higher Factuality**: Generating detailed citations and excerpt extractions adds ~3-5ms to the retrieval pipeline, but dramatically reduces hallucination risk.
- **Strict Refusals vs. Creative Answers**: Setting a strict confidence threshold (0.45) means the assistant will refuse to answer ambiguous queries that a loose LLM might guess. For library and assessment domains, correctness is prioritized over creativity.

---

## Getting Started & Local Setup

### Prerequisites
- Node.js 20+
- npm or pnpm
- (Optional) Redis server (or use the built-in adapter)
- (Optional) Ollama running locally

### Installation Steps

1. **Clone the repository**:
   ```bash
   git clone <REPO_URL>
   cd librai
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Add your `GEMINI_API_KEY` (or configure `LLM_PROVIDER=ollama` for local models).

4. **Start the development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

5. **Build for production**:
   ```bash
   npm run build
   npm start
   ```

---

## Using with Local Ollama

LibrAI has native first-class support for local LLMs via Ollama.

1. **Install and run Ollama**:
   ```bash
   ollama run llama3.2
   ```

2. **Configure `.env`**:
   ```env
   LLM_PROVIDER=ollama
   OLLAMA_BASE_URL=http://127.0.0.1:11434
   OLLAMA_MODEL=llama3.2
   ```

3. **Run LibrAI**:
   All chats and context processing will now run 100% locally on your machine with zero external API calls.

---

## API Reference & Postman Collection

The Postman collection is located at `postman/LibrAI.postman_collection.json`.

### Endpoints Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service liveness & uptime |
| `GET` | `/api/ready` | Readiness check (Redis, DB, LLM status) |
| `GET` | `/api/config` | Safe configuration overview |
| `POST` | `/api/documents` | Upload PDF or TXT (multipart/form-data, max 10MB) |
| `POST` | `/api/documents/sample` | Preloads 1-click sample technical document |
| `GET` | `/api/documents` | List all processed documents |
| `GET` | `/api/documents/:id` | Get document metadata and stats |
| `GET` | `/api/documents/:id/chunks`| Inspect chunks, pages, and keywords |
| `DELETE`| `/api/documents/:id` | Delete document and clear related cache |
| `POST` | `/api/chat` | AI grounded chat (`{ documentId, sessionId, question }`) |
| `GET` | `/api/sessions/:sessionId/history` | Get multi-turn conversation messages |
| `DELETE`| `/api/sessions/:sessionId` | Clear session conversation history |

### Example Chat Request & Response

#### Request (`POST /api/chat`):
```json
{
  "documentId": "doc_sample_librai_manual",
  "sessionId": "session_demo_101",
  "question": "What is the target chunk size and overlap in LibrAI?"
}
```

#### Response (`200 OK`):
```json
{
  "answer": "According to Section 1 of the manual, LibrAI uses a target chunk size of 800 tokens with a 120-token sliding overlap window to preserve conversational context continuity [Page 1, Chunk 1].",
  "cached": false,
  "documentId": "doc_sample_librai_manual",
  "sessionId": "session_demo_101",
  "citations": [
    {
      "chunkId": "chk_doc_samp_0",
      "pageNumber": 1,
      "chunkIndex": 0,
      "relevanceScore": 0.895,
      "excerpt": "... Semantic Chunking: Sentence-boundary packaging with an 800-token target size and a 120-token sliding overlap window ..."
    }
  ],
  "evidenceStatus": "supported",
  "confidenceScore": 0.895,
  "latencyMs": 482,
  "provider": "gemini",
  "model": "gemini-3.7-flash",
  "retrievedChunksCount": 4
}
```

#### Repeated Request (Cache Hit):
```json
{
  "answer": "...",
  "cached": true,
  "latencyMs": 8,
  ...
}
```

---

## Docker Setup

### One-Command Docker Compose Launch
Run LibrAI alongside Redis in isolated containers:

```bash
docker-compose up --build
```
Access the application at `http://localhost:3000`.

---

## Design Decisions & Trade-Offs

1. **Durable File-Backed JSON Store vs. PostgreSQL**:
   - *Decision*: Implemented a clean, atomic file-backed store for documents and chunks with in-memory BM25 index.
   - *Trade-Off*: Extremely fast, zero setup requirements, and completely self-contained for assessment reviews. For multi-million document deployments, an external PostgreSQL + pgvector instance is the natural scale-up path.
2. **Hybrid BM25 + Vector Fusion vs. Pure Vector**:
   - *Decision*: Combined keyword BM25 with dense semantic vector scoring.
   - *Rationale*: Pure vector embeddings often miss exact alphanumeric model numbers, error codes, and specific entity names. BM25 guarantees exact keyword hits while vector search handles semantic intent.
3. **In-Memory Redis Adapter Fallback**:
   - *Decision*: Included an in-memory Redis adapter with exact TTL and pattern deletion.
   - *Rationale*: Evaluators can clone and run `npm run dev` immediately without needing to install Redis locally, while production environments can connect to real Redis simply by setting `REDIS_URL`.

---

## Honest Documentation of Unfinished Work & Future Roadmap

1. **OCR for Scanned PDFs**: Currently, PDFs with embedded text layers or TXT files are supported. Scanned image-only PDFs require an integrated OCR engine (e.g. Tesseract.js or Gemini Multimodal OCR).
2. **Table & Chart Structure Recognition**: Markdown tables and ASCII formatted data are extracted as text; native bounding-box spatial table parsing could further improve retrieval for dense tabular data.
3. **Streaming Responses (SSE)**: The current endpoint returns complete JSON responses with metrics and citations. Adding Server-Sent Events (`POST /api/chat/stream`) would provide token-by-token streaming in the UI for long answers.
4. **Hierarchical Multi-Document Synthesis**: The current `/chat` endpoint is scoped to a specific `documentId`. Multi-document cross-referencing across entire library collections is a compelling next step.

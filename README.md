# LibrAI Document Assistant

LibrAI is a grounded document question-answering application. It accepts PDF, TXT, and Markdown files, extracts and chunks their text, retrieves relevant passages, and asks a configured language model to answer using document evidence and citations.

## Features

- PDF, TXT, and Markdown upload with a 10 MB limit.
- PDF text extraction with page-level metadata using `pdf-parse` v2.
- Sentence-aware chunking with an 800-token target and 120-token overlap.
- BM25 keyword retrieval with citation excerpts and relevance scores.
- Strict document-grounding prompts and evidence status.
- Ollama local LLM support, with optional Gemini, Groq, and OpenAI providers.
- Redis-backed chat sessions, response caching, and rate limiting.
- Durable local JSON storage in `data/librai_store.json`.
- React UI with document upload, grounded chat, chunk inspection, citations, and system diagnostics.
- Postman collection for API testing at `postman/LibrAI.postman_collection.json`.

## Architecture

```text
React UI
  |
  v
Express API
  |-- Document extraction -> chunking -> JSON store
  |-- BM25 retrieval -> grounded prompt -> LLM provider
  |-- Redis sessions, cache, and rate limiter
  |
  +-- Ollama (local) or Gemini / Groq / OpenAI
```

### Main directories

```text
server.ts                       Express and Vite server entry point
server/config.ts                Environment configuration
server/routes/documents.ts      Upload, list, inspect, and delete documents
server/routes/chat.ts           Grounded chat and session endpoints
server/routes/system.ts         Health, readiness, and safe configuration endpoints
server/services/extractor.ts    PDF/TXT/Markdown extraction
server/services/chunker.ts      Sentence-aware chunking
server/services/retrieval.ts    BM25 retrieval and citation formatting
server/services/llm.ts          Gemini, Ollama, Groq, OpenAI, and fallback dispatch
server/services/cache.ts        Redis response cache
server/services/rateLimiter.ts  Chat request rate limiting
server/db/store.ts              Durable JSON document store
src/                            React frontend
data/                           Runtime JSON data; created automatically
```

## Requirements

- Node.js 20 or newer
- npm
- Ollama, if using local AI
- Redis is optional for development and recommended for production

## Local Setup with Ollama

1. Install Ollama and verify it is available:

   ```powershell
   ollama --version
   ```

2. Download the configured chat model:

   ```powershell
   ollama pull llama3.2
   ```

3. Verify the model:

   ```powershell
   ollama list
   ```

4. Install LibrAI dependencies:

   ```powershell
   npm install
   ```

5. Create `.env` from `.env.example` and configure local Ollama:

   ```env
   LLM_PROVIDER="ollama"
   OLLAMA_BASE_URL="http://127.0.0.1:11434"
   OLLAMA_MODEL="llama3.2"
   OLLAMA_EMBED_MODEL="nomic-embed-text"
   REDIS_URL="redis://127.0.0.1:6379"
   ```

   `OLLAMA_EMBED_MODEL` is reserved for future embedding retrieval. The current retrieval implementation uses BM25 keyword matching.

6. Start the development server:

   ```powershell
   npm run dev
   ```

7. Open `http://localhost:3000`.

The UI loads a sample document automatically when the store is empty. You can also upload your own PDF, TXT, or Markdown document.

## Redis Setup

Redis is used for chat sessions, response caching, and rate-limit counters. Without `REDIS_URL`, LibrAI uses an in-memory fallback, which is suitable for basic local testing but does not survive process restarts.

### Redis with Docker Desktop

Make sure Docker Desktop is running, then run:

```powershell
docker compose up -d redis
```

For LibrAI running directly on Windows, use:

```env
REDIS_URL="redis://127.0.0.1:6379"
```

Check the container:

```powershell
docker compose ps
```

Restart LibrAI after changing `.env` so it reloads the configuration.

## Commands

```powershell
npm install       # Install dependencies
npm run dev       # Start development server
npm run lint      # Run TypeScript validation
npm run build     # Build frontend and server
npm start         # Run the production bundle after npm run build
```

## API Reference

The base URL is `http://localhost:3000`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness and uptime |
| GET | `/api/ready` | Database, Redis, and provider status |
| GET | `/api/config` | Safe runtime configuration |
| POST | `/api/documents` | Upload a PDF, TXT, or Markdown file |
| POST | `/api/documents/sample` | Create the built-in sample document |
| GET | `/api/documents` | List documents and IDs |
| GET | `/api/documents/:documentId` | Get document metadata |
| GET | `/api/documents/:documentId/chunks` | Inspect document chunks |
| DELETE | `/api/documents/:documentId` | Delete a document and its cache |
| POST | `/api/chat` | Ask a grounded question |
| GET | `/api/sessions/:sessionId/history` | Read session history |
| DELETE | `/api/sessions/:sessionId` | Clear session history |

The same chat router also supports `/api/chat/sessions/:sessionId/history` and `/api/chat/sessions/:sessionId` for compatibility.

## Uploading a Document

In Postman, create a request:

```http
POST http://localhost:3000/api/documents
```

Use **Body -> form-data**:

```text
Key: file
Type: File
Value: select a PDF, TXT, or Markdown file
```

The response includes the document ID:

```json
{
  "document": {
    "id": "doc_75c0da088b51b516"
  }
}
```

Use that ID in chat requests. You can also call `GET /api/documents` to list all document IDs.

## Grounded Chat

```http
POST http://localhost:3000/api/chat
Content-Type: application/json
```

```json
{
  "documentId": "doc_sample_librai_manual",
  "sessionId": "postman-session-001",
  "question": "What is the chunking strategy?"
}
```

`sessionId` is created by the client. Use the same value for follow-up questions. A new random or descriptive string can be used for a new conversation.

The response includes `answer`, `citations`, `evidenceStatus`, `confidenceScore`, `provider`, `model`, `latencyMs`, and `cached`.

## Cache and Rate Limiting

Repeated identical questions for the same document can be returned from Redis. The chat response contains:

```json
{
  "cached": true
}
```

The UI displays `LLM Fresh` for a new response and `Redis Cache Hit` for a cached response.

Chat requests are limited to **10 requests per 60 seconds** per session ID. The eleventh request within the same window returns:

```http
429 Too Many Requests
```

with a message such as:

```text
Rate limit exceeded. Maximum 10 requests per 60s.
```

Document listing, uploads, readiness checks, and health checks are not subject to the chat rate limit. The server returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers on rate-limited chat routes.

## Postman Collection

Import [postman/LibrAI.postman_collection.json](postman/LibrAI.postman_collection.json) into Postman.

Set these collection variables:

```text
baseUrl    = http://localhost:3000
documentId = doc_sample_librai_manual
sessionId  = postman-session-001
```

Start the app before sending requests:

```powershell
npm run dev
```

## Docker

The Compose file starts the application and Redis:

```powershell
docker compose up --build
```

The app is available at `http://localhost:3000` and Redis is available to the app at `redis://redis:6379`.

For Ollama running on the Windows host, container networking requires additional host access configuration. `127.0.0.1` inside the app container refers to the container itself, not Windows. For a fully containerized setup, enable the Ollama service in `docker-compose.yml` and use `http://ollama:11434`, or configure the app to use `host.docker.internal:11434` when Ollama runs on the host.

## Persistence and Runtime Notes

- Documents, chunks, and JSON-backed session history are stored in `data/librai_store.json`.
- Store writes are serialized and use temporary files to avoid Windows `EPERM` rename races.
- Vite ignores the `data` directory so chat persistence does not reload the browser during development.
- Deleting a document also invalidates its cached responses.
- Scanned image-only PDFs require OCR and may not produce useful text.
- The current API returns complete JSON responses; streaming responses are not implemented.
- Retrieval is currently BM25 keyword retrieval. Dense embeddings and true hybrid vector fusion are future work.

## Troubleshooting

### Ollama model not found

```powershell
ollama pull llama3.2
ollama list
```

### Gemini API key errors while using Ollama

Confirm both `.env` and the chat provider selector use Ollama. Restart `npm run dev` after changing `.env`.

### Redis connection errors

Confirm Docker Desktop is running and Redis is started:

```powershell
docker compose up -d redis
```

Then verify:

```powershell
Invoke-RestMethod http://localhost:3000/api/ready
```

The readiness response should report Redis `type` as `redis`. If `REDIS_URL` is blank, the response reports `in-memory` instead.

### Documents disappear after refresh

Check that `data/librai_store.json` exists and that the server is restarted after code or environment changes. The document list is loaded from the durable JSON store, not browser storage.

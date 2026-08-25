# LibrAI Document Assistant

LibrAI is a document-grounded Q&A app for PDF, TXT, and Markdown files. It extracts text, splits it into chunks, retrieves the most relevant passages with BM25, and answers questions using document evidence and citations.

The current project is configured to use Ollama as the default and visible model provider. The UI is intentionally Ollama-first, while the backend still contains provider logic for other LLMs in case they are enabled manually.

## Features

- PDF, TXT, and Markdown upload with a 10 MB size limit
- PDF extraction with page-level metadata using `pdf-parse`
- Sentence-aware chunking with an 800-token target and 120-token overlap
- BM25 retrieval with relevance scoring and citation excerpts
- Grounded answer generation with evidence status and confidence tracking
- Ollama-first setup for local LLM usage
- Redis-backed chat sessions, response caching, and rate limiting
- Durable JSON storage for documents and session state
- React frontend for upload, chat, citation inspection, and diagnostics
- Postman collection for testing API flows

## Architecture

```text
React UI
  |
  v
Express API
  |-- Document extraction -> chunking -> JSON store
  |-- BM25 retrieval -> grounded prompt -> Ollama LLM
  |-- Redis sessions, cache, and rate limiter
  |
  +-- Ollama (default, current app state)
```

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, React Markdown
- Backend: Node.js, Express, TypeScript, tsx
- AI: Ollama (primary/default), with additional provider logic available in the server code
- Storage: Redis + local durable JSON document store
- Document processing: `pdf-parse`, `multer`, BM25 retrieval logic
- Dev tooling: Docker Compose, npm, TypeScript, esbuild

## Project Structure

```text
server.ts                       Express + Vite server entry point
server/config.ts                Runtime configuration
server/routes/documents.ts      Upload, list, inspect, and delete documents
server/routes/chat.ts           Grounded chat and session endpoints
server/routes/system.ts         Health and readiness checks
server/services/extractor.ts    PDF/TXT/Markdown extraction
server/services/chunker.ts      Sentence-aware chunking
server/services/retrieval.ts    BM25 retrieval and citation formatting
server/services/llm.ts          LLM dispatch with Ollama-first behavior
server/services/cache.ts        Redis response cache
server/services/rateLimiter.ts  Chat rate limiting
server/db/store.ts              Durable JSON document store
src/                            React frontend
postman/                       API testing collection
```

## Requirements

- Node.js 20 or newer
- npm
- Ollama installed locally
- Redis is optional for local dev but recommended for production-like behavior

## Local Setup

1. Install Ollama and verify it is available:

   ```powershell
   ollama --version
   ```

2. Pull the default model used by the app:

   ```powershell
   ollama pull llama3.2
   ```

3. Verify the model is available:

   ```powershell
   ollama list
   ```

4. Install project dependencies:

   ```powershell
   npm install
   ```

5. Create a `.env` file with the Ollama settings:

   ```env
   PORT=3000
   LLM_PROVIDER=ollama
   OLLAMA_BASE_URL=http://127.0.0.1:11434
   OLLAMA_MODEL=llama3.2
   REDIS_URL=redis://127.0.0.1:6379
   SESSION_TTL_SECONDS=86400
   CACHE_TTL_SECONDS=3600
   RATE_LIMIT_MAX_REQUESTS=10
   RATE_LIMIT_WINDOW_SECONDS=60
   ```

6. Start the app:

   ```powershell
   npm run dev
   ```

7. Open `http://localhost:3000` in the browser.

The UI loads a sample document automatically when the store is empty. You can also upload your own PDF, TXT, or Markdown document.

## Redis Setup

Redis is used for chat sessions, response caching, and rate-limit counters. If `REDIS_URL` is not set, the app falls back to an in-memory mode for simple local testing, but it will not persist across restarts.

### Run Redis with Docker

```powershell
docker compose up -d redis
```

For local Windows development, use:

```env
REDIS_URL=redis://127.0.0.1:6379
```

Check the instance:

```powershell
docker compose ps
```

## Docker Compose

The project includes a Compose setup that runs the app and Redis together:

```powershell
docker compose up --build
```

The default app environment is set to use Ollama as the active LLM provider.

## Commands

```powershell
npm install
npm run dev
npm run lint
npm run build
npm start
```

## API Reference

Base URL: `http://localhost:3000`

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

## Uploading a Document

```http
POST http://localhost:3000/api/documents
```

Use form-data with a file field named `file` and select a PDF, TXT, or Markdown document.

Example response:

```json
{
  "document": {
    "id": "doc_75c0da088b51b516"
  }
}
```

Use the returned document ID in chat requests.

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

The server retrieves relevant chunks, builds a grounded prompt, and returns:

- `answer`
- `citations`
- `evidenceStatus`
- `confidenceScore`
- `provider`
- `model`
- `latencyMs`
- `cached`

## Cache and Rate Limiting

Repeated identical questions for the same document can be served from Redis cache. The response includes:

```json
{
  "cached": true
}
```

Chat requests are rate-limited to 10 requests per 60 seconds per session. The server responds with `429 Too Many Requests` when the limit is exceeded.

## Postman Collection

The project includes a collection in:

```text
postman/LibrAI.postman_collection.json
```

Import it into Postman and set these variables:

```text
baseUrl    = http://localhost:3000
documentId = doc_sample_librai_manual
sessionId  = postman-session-001
```

## Notes

- The app is currently optimized around Ollama as the default provider.
- The frontend exposes Ollama as the active model choice in the UI.
- The backend still includes provider code for other LLMs, but they are not the current primary configuration for this app.
- BM25-based retrieval is the current document matching strategy, while embedding-based retrieval is not the active implementation in the current build.



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

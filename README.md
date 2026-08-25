# LibrAI Document Assistant

LibrAI is a document-grounded Q&A app. Upload a PDF, TXT, or Markdown file, then ask questions about its contents. The app retrieves relevant passages with BM25 and asks Ollama to answer using those passages and citations.

## My Feature

The main feature is a local, grounded document assistant:

- Upload and extract text from PDF, TXT, and Markdown files.
- Split documents into sentence-aware chunks.
- Retrieve the two most relevant chunks with BM25 keyword search.
- Send the grounded context to Ollama using the `qwen2.5:3b` model by default.
- Keep short multi-turn chat history and show citations with each answer.
- Use Redis for response caching, chat sessions, and rate limiting.
- Check service status through `/api/health` and `/api/ready`.

### Trade-offs

- Ollama runs locally, so data stays on the development machine. The trade-off is that response speed depends on the computer and the selected model.
- Redis is optional. Without `REDIS_URL`, the app uses an in-memory adapter, which is easy to run but loses its cache, temporary session data, and rate-limit counters when the server restarts.
- Documents are stored in `data/librai_store.json`, so uploaded documents and mirrored session history can survive restarts. This simple JSON store is convenient for development but is not a replacement for a production database.
- The API returns complete answers instead of streaming tokens, which keeps the implementation simple but makes the UI wait for the full Ollama response.

## How It Works

```text
React UI
  |
  v
Express API
  |-- Extract and chunk documents -> JSON store
  |-- BM25 retrieval -> grounded prompt -> Ollama
  |-- Redis cache, sessions, and rate limiting
```

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, React Markdown
- Backend: Node.js, Express, TypeScript, tsx
- LLM: Ollama with `qwen2.5:3b` by default
- Storage: Redis when configured, plus local JSON storage
- Document processing: `pdf-parse`, `multer`, and BM25 retrieval
- Build tools: npm, esbuild, Docker Compose

## Requirements

- Node.js 20 or newer
- npm
- Ollama
- Redis is optional for local development

## Quick Start

Install and start the Ollama model:

```powershell
ollama pull qwen2.5:3b
ollama list
```

Install dependencies and start LibrAI:

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

The default configuration is:

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
```

To use Redis locally, start it with Docker:

```powershell
docker compose up -d redis
```

Then set:

```env
REDIS_URL=redis://127.0.0.1:6379
```

## Commands

```powershell
npm install       # Install dependencies
npm run dev       # Start the development server
npm run lint      # TypeScript validation
npm run build     # Build the frontend and server
npm start         # Start the production build
```

## API Reference

Base URL: `http://localhost:3000`

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Confirm that the server is running |
| GET | `/api/ready` | Check the JSON store, Redis adapter, and LLM configuration |
| GET | `/api/config` | View safe runtime configuration |
| POST | `/api/documents` | Upload a PDF, TXT, or Markdown file |
| POST | `/api/documents/sample` | Create the built-in sample document |
| GET | `/api/documents` | List documents |
| GET | `/api/documents/:documentId` | View document metadata |
| GET | `/api/documents/:documentId/chunks` | Inspect document chunks |
| DELETE | `/api/documents/:documentId` | Delete a document and its cache |
| POST | `/api/chat` | Ask a grounded question |
| GET | `/api/sessions/:sessionId/history` | Read chat history |
| DELETE | `/api/sessions/:sessionId` | Clear a chat session |

### Example chat request

```http
POST http://localhost:3000/api/chat
Content-Type: application/json
```

```json
{
  "documentId": "doc_sample_librai_manual",
  "sessionId": "local-session-001",
  "question": "Give me the summary of module 1"
}
```

The response includes the answer, citations, evidence status, confidence score, provider, model, latency, and cache status.

## Docker

Start the app and Redis together:

```powershell
docker compose up --build
```

When Ollama runs on the Windows host, use `host.docker.internal:11434` from the app container. The container's `127.0.0.1` points to the container itself, not the Windows host.

## Project Structure

```text
server.ts                       Express and Vite server entry point
server/config.ts                Runtime configuration
server/routes/                  API routes
server/services/extractor.ts    Document text extraction
server/services/chunker.ts      Text chunking
server/services/retrieval.ts    BM25 retrieval and citations
server/services/llm.ts          Ollama and other provider dispatch
server/services/cache.ts        Redis response cache
server/services/rateLimiter.ts  Request rate limiting
server/redis/redisClient.ts     Redis and in-memory adapters
server/db/store.ts              Local JSON persistence
src/                            React frontend
postman/                        API testing collection
data/                           Runtime JSON data
```

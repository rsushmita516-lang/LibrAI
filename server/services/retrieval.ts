import { DocumentChunk, Citation } from "../types.js";
import { store } from "../db/store.js";
import { config } from "../config.js";

export interface RetrievalResult {
  chunk: DocumentChunk;
  score: number;
  bm25Score: number;
  vectorScore: number;
  matchedKeywords: string[];
  bestExcerpt: string;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * BM25 Retrieval Engine for In-Memory Document Chunks
 */
export function rankChunksBM25(
  query: string,
  chunks: DocumentChunk[],
  topK = 5
): Array<{ chunk: DocumentChunk; score: number; matchedKeywords: string[]; bestExcerpt: string }> {
  if (chunks.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return chunks.slice(0, topK).map((c) => ({
      chunk: c,
      score: 0.1,
      matchedKeywords: [],
      bestExcerpt: c.text.slice(0, 200),
    }));
  }

  // Document frequencies for query terms
  const totalChunks = chunks.length;
  const df: Record<string, number> = {};
  for (const qTerm of queryTokens) {
    let count = 0;
    for (const chunk of chunks) {
      const chunkLower = chunk.text.toLowerCase();
      if (chunkLower.includes(qTerm) || chunk.keywords.includes(qTerm)) {
        count++;
      }
    }
    df[qTerm] = count;
  }

  // Average chunk length in words
  const avgDocLength =
    chunks.reduce((sum, c) => sum + tokenize(c.text).length, 0) / Math.max(1, totalChunks);

  const k1 = 1.5;
  const b = 0.75;

  const scored = chunks.map((chunk) => {
    const chunkWords = tokenize(chunk.text);
    const docLength = chunkWords.length;
    const wordFreq: Record<string, number> = {};
    for (const w of chunkWords) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }

    let score = 0;
    const matchedKeywords: string[] = [];

    for (const qTerm of queryTokens) {
      const freq = wordFreq[qTerm] || 0;
      if (freq > 0 || chunk.keywords.includes(qTerm)) {
        matchedKeywords.push(qTerm);
        const effectiveFreq = Math.max(freq, 1);
        const docFreq = df[qTerm] || 1;
        // Standard BM25 IDF
        const idf = Math.log((totalChunks - docFreq + 0.5) / (docFreq + 0.5) + 1);
        const tf =
          (effectiveFreq * (k1 + 1)) /
          (effectiveFreq + k1 * (1 - b + (b * docLength) / avgDocLength));
        score += Math.max(0, idf * tf);
      }
    }

    // Exact phrase bonus
    const queryLower = query.toLowerCase().trim();
    if (chunk.text.toLowerCase().includes(queryLower) && queryLower.length > 5) {
      score += 3.0;
    }

    // Extract best excerpt surrounding the first matched keyword
    let bestExcerpt = chunk.text.slice(0, 260);
    if (matchedKeywords.length > 0) {
      const firstMatch = matchedKeywords[0];
      const matchIndex = chunk.text.toLowerCase().indexOf(firstMatch);
      if (matchIndex >= 0) {
        const start = Math.max(0, matchIndex - 60);
        const end = Math.min(chunk.text.length, matchIndex + 200);
        bestExcerpt = (start > 0 ? "... " : "") + chunk.text.slice(start, end).trim() + (end < chunk.text.length ? " ..." : "");
      }
    }

    return {
      chunk,
      score,
      matchedKeywords,
      bestExcerpt,
    };
  });

  // Normalize score between 0 and 1
  const maxScore = Math.max(...scored.map((s) => s.score), 1);
  const normalized = scored.map((s) => ({
    ...s,
    score: Math.min(1.0, Number((s.score / maxScore).toFixed(4))),
  }));

  return normalized
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Hybrid search combining BM25 keyword matching + vector similarity
 */
export async function retrieveRelevantChunks(
  documentId: string,
  query: string,
  queryEmbedding?: number[],
  topK = 2
): Promise<RetrievalResult[]> {
  const chunks = await store.getChunks(documentId);
  if (chunks.length === 0) return [];

  const bm25Results = rankChunksBM25(query, chunks, topK * 2);

  const results: RetrievalResult[] = bm25Results.map((item) => {
    let vectorScore = 0;
    if (queryEmbedding && item.chunk.embedding) {
      vectorScore = computeCosineSimilarity(queryEmbedding, item.chunk.embedding);
    }

    // Hybrid score
    const combinedScore = queryEmbedding
      ? Number((item.score * 0.45 + vectorScore * 0.55).toFixed(4))
      : item.score;

    return {
      chunk: item.chunk,
      score: combinedScore,
      bm25Score: item.score,
      vectorScore,
      matchedKeywords: item.matchedKeywords,
      bestExcerpt: item.bestExcerpt,
    };
  });

  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}

export function formatCitations(retrievalResults: RetrievalResult[]): Citation[] {
  return retrievalResults.map((r) => ({
    chunkId: r.chunk.id,
    pageNumber: r.chunk.pageNumber,
    chunkIndex: r.chunk.chunkIndex,
    relevanceScore: r.score,
    excerpt: r.bestExcerpt,
  }));
}

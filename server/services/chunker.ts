import crypto from "crypto";
import { DocumentChunk } from "../types.js";
import { ExtractedPage, estimateTokenCount } from "./extractor.js";
import { config } from "../config.js";

// Stop words for keyword extraction
const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
  "below", "between", "both", "but", "by", "can", "can't", "cannot", "could",
  "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down",
  "during", "each", "few", "for", "from", "further", "had", "hadn't", "has",
  "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her",
  "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's",
  "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it",
  "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
  "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other",
  "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shan't",
  "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such",
  "than", "that", "that's", "the", "their", "theirs", "them", "themselves",
  "then", "there", "there's", "these", "they", "they'd", "they'll", "they're",
  "they've", "this", "those", "through", "to", "too", "under", "until", "up",
  "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were",
  "weren't", "what", "what's", "when", "when's", "where", "where's", "which",
  "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would",
  "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
  "yourself", "yourselves"
]);

export function extractKeywords(text: string, maxKeywords = 15): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const frequency: Record<string, number> = {};
  for (const w of words) {
    frequency[w] = (frequency[w] || 0) + 1;
  }

  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([w]) => w);
}

/**
 * Splits text into sentences while respecting abbreviations and numbering
 */
function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  // Split on paragraph or sentence boundaries (. ! ? \n\n)
  const rawParts = text.split(/(?<=[.?!])\s+(?=[A-Z0-9])|\n\n+/);
  for (const part of rawParts) {
    const trimmed = part.trim();
    if (trimmed.length > 0) {
      sentences.push(trimmed);
    }
  }
  return sentences.length > 0 ? sentences : [text];
}

/**
 * Chunks a list of extracted pages using semantic boundary packing with sliding window overlap
 */
export function chunkPages(
  documentId: string,
  pages: ExtractedPage[],
  targetTokens = config.chunking.targetTokens,
  overlapTokens = config.chunking.overlapTokens
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let globalChunkIndex = 0;
  const targetChars = targetTokens * 4;
  const overlapChars = overlapTokens * 4;

  for (const page of pages) {
    const pageText = page.text;
    if (!pageText || pageText.trim().length === 0) continue;

    const sentences = splitIntoSentences(pageText);
    let currentChunkSentences: string[] = [];
    let currentChunkLength = 0;
    let charOffsetInPage = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceLength = sentence.length;

      // If a single sentence exceeds target size, split it into fixed-size slices
      if (sentenceLength > targetChars * 1.5) {
        if (currentChunkSentences.length > 0) {
          const chunkText = currentChunkSentences.join(" ");
          const chunkId = `chk_${documentId.slice(0, 8)}_${globalChunkIndex}`;
          chunks.push({
            id: chunkId,
            documentId,
            chunkIndex: globalChunkIndex++,
            text: chunkText,
            pageNumber: page.pageNumber,
            startChar: charOffsetInPage,
            endChar: charOffsetInPage + chunkText.length,
            tokenCount: estimateTokenCount(chunkText),
            keywords: extractKeywords(chunkText),
          });
          charOffsetInPage += chunkText.length;
          currentChunkSentences = [];
          currentChunkLength = 0;
        }

        // Slice large sentence
        let sliceStart = 0;
        while (sliceStart < sentenceLength) {
          const sliceEnd = Math.min(sliceStart + targetChars, sentenceLength);
          const sliceText = sentence.slice(sliceStart, sliceEnd);
          const chunkId = `chk_${documentId.slice(0, 8)}_${globalChunkIndex}`;
          chunks.push({
            id: chunkId,
            documentId,
            chunkIndex: globalChunkIndex++,
            text: sliceText,
            pageNumber: page.pageNumber,
            startChar: charOffsetInPage + sliceStart,
            endChar: charOffsetInPage + sliceEnd,
            tokenCount: estimateTokenCount(sliceText),
            keywords: extractKeywords(sliceText),
          });
          sliceStart += targetChars - overlapChars;
        }
        charOffsetInPage += sentenceLength;
        continue;
      }

      if (currentChunkLength + sentenceLength > targetChars && currentChunkSentences.length > 0) {
        // Emit current chunk
        const chunkText = currentChunkSentences.join(" ");
        const chunkId = `chk_${documentId.slice(0, 8)}_${globalChunkIndex}`;
        chunks.push({
          id: chunkId,
          documentId,
          chunkIndex: globalChunkIndex++,
          text: chunkText,
          pageNumber: page.pageNumber,
          startChar: charOffsetInPage,
          endChar: charOffsetInPage + chunkText.length,
          tokenCount: estimateTokenCount(chunkText),
          keywords: extractKeywords(chunkText),
        });

        // Compute overlap: keep trailing sentences that fit within overlapChars
        const overlapSentences: string[] = [];
        let accumulatedOverlap = 0;
        for (let j = currentChunkSentences.length - 1; j >= 0; j--) {
          const s = currentChunkSentences[j];
          if (accumulatedOverlap + s.length <= overlapChars) {
            overlapSentences.unshift(s);
            accumulatedOverlap += s.length;
          } else {
            break;
          }
        }

        charOffsetInPage += chunkText.length - accumulatedOverlap;
        currentChunkSentences = [...overlapSentences, sentence];
        currentChunkLength = accumulatedOverlap + sentenceLength;
      } else {
        currentChunkSentences.push(sentence);
        currentChunkLength += sentenceLength;
      }
    }

    // Flush any remaining sentences on this page
    if (currentChunkSentences.length > 0) {
      const chunkText = currentChunkSentences.join(" ");
      if (chunkText.trim().length > 0) {
        const chunkId = `chk_${documentId.slice(0, 8)}_${globalChunkIndex}`;
        chunks.push({
          id: chunkId,
          documentId,
          chunkIndex: globalChunkIndex++,
          text: chunkText,
          pageNumber: page.pageNumber,
          startChar: charOffsetInPage,
          endChar: charOffsetInPage + chunkText.length,
          tokenCount: estimateTokenCount(chunkText),
          keywords: extractKeywords(chunkText),
        });
      }
    }
  }

  return chunks;
}

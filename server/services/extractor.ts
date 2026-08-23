import crypto from "crypto";
import { PDFParse } from "pdf-parse";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface ExtractionResult {
  text: string;
  pages: ExtractedPage[];
  pageCount: number;
  checksum: string;
  charCount: number;
  estimatedTokens: number;
}

export function computeChecksum(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function normalizeText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0\u2000-\u200b]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function estimateTokenCount(text: string): number {
  // Common heuristic: ~4 characters per token in English text or ~0.75 tokens per word
  const words = text.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, Math.ceil(Math.max(words.length * 1.33, text.length / 4)));
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ExtractionResult> {
  const checksum = computeChecksum(buffer);

  if (mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    let parser: PDFParse | undefined;
    try {
      parser = new PDFParse({ data: buffer });
      const data = await parser.getText();

      const fullText = normalizeText(data.text || "");

      let finalPages: ExtractedPage[] = data.pages
        .map((page) => ({
          pageNumber: page.num,
          text: normalizeText(page.text || ""),
        }))
        .filter((page) => page.text.length > 0);

      if (finalPages.length === 0) {
        if (fullText.includes("\f")) {
          const split = fullText.split("\f");
          finalPages = split.map((pText, i) => ({
            pageNumber: i + 1,
            text: normalizeText(pText),
          })).filter((p) => p.text.length > 0);
        } else {
          finalPages = [
            {
              pageNumber: 1,
              text: fullText,
            },
          ];
        }
      }

      return {
        text: fullText,
        pages: finalPages,
        pageCount: Math.max(data.total || 1, finalPages.length),
        checksum,
        charCount: fullText.length,
        estimatedTokens: estimateTokenCount(fullText),
      };
    } catch (err: any) {
      console.warn("[Extractor] pdf-parse failed, attempting plain text fallback:", err.message);
      const text = normalizeText(buffer.toString("utf-8"));
      return {
        text,
        pages: [{ pageNumber: 1, text }],
        pageCount: 1,
        checksum,
        charCount: text.length,
        estimatedTokens: estimateTokenCount(text),
      };
    } finally {
      await parser?.destroy();
    }
  }

  // Plain text or markdown
  const text = normalizeText(buffer.toString("utf-8"));
  return {
    text,
    pages: [{ pageNumber: 1, text }],
    pageCount: 1,
    checksum,
    charCount: text.length,
    estimatedTokens: estimateTokenCount(text),
  };
}

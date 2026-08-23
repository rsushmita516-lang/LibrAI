import React, { useState, useEffect } from "react";
import { Database, Search, Hash, Bookmark, BookOpen, Layers } from "lucide-react";
import { DocumentRecord, DocumentChunk } from "../types";

interface DocumentViewerProps {
  activeDoc: DocumentRecord | null;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ activeDoc }) => {
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!activeDoc) {
      setChunks([]);
      return;
    }

    const fetchChunks = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/documents/${activeDoc.id}/chunks`);
        const data = await res.json();
        if (data.chunks) {
          setChunks(data.chunks);
        }
      } catch (err) {
        console.error("Error loading chunks:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChunks();
  }, [activeDoc?.id]);

  const filteredChunks = chunks.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.text.toLowerCase().includes(q) ||
      c.keywords.some((k) => k.toLowerCase().includes(q)) ||
      c.pageNumber.toString() === q
    );
  });

  if (!activeDoc) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
        <Database className="w-12 h-12 mx-auto text-slate-300 mb-3" />
        <p className="font-medium text-slate-700">No Document Selected</p>
        <p className="text-xs text-slate-400 mt-1">Please select or upload a document to inspect its chunk index.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-semibold text-slate-900">{activeDoc.originalName}</h2>
            <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-slate-100 text-slate-700">
              {chunks.length} Total Chunks
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Checksum: <code className="text-slate-600 font-mono text-[11px]">{activeDoc.checksum.slice(0, 16)}...</code> • Strategy: Semantic Sentence Packing (~800 tokens, 120 overlap)
          </p>
        </div>

        {/* Filter Input */}
        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search chunks or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
          />
        </div>
      </div>

      {/* Chunks List */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-500">Loading chunk index...</div>
      ) : filteredChunks.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500">
          No chunks matched your filter query.
        </div>
      ) : (
        <div className="space-y-4 max-h-[620px] overflow-y-auto pr-2">
          {filteredChunks.map((chunk) => (
            <div
              key={chunk.id}
              id={`chunk-card-${chunk.id}`}
              className="p-4 border border-slate-200 rounded-xl bg-slate-50/40 hover:bg-white hover:border-indigo-200 transition-all shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100 text-xs">
                <div className="flex items-center space-x-3">
                  <span className="flex items-center gap-1 font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    Chunk #{chunk.chunkIndex + 1}
                  </span>
                  <span className="flex items-center gap-1 text-slate-600">
                    <Bookmark className="w-3.5 h-3.5 text-slate-400" />
                    Page {chunk.pageNumber}
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    ~{chunk.tokenCount} tokens ({chunk.endChar - chunk.startChar} chars)
                  </span>
                </div>
                <code className="text-[10px] text-slate-400 font-mono">{chunk.id}</code>
              </div>

              {/* Chunk Text */}
              <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-sans bg-white p-3 rounded-lg border border-slate-100">
                {chunk.text}
              </p>

              {/* Keywords */}
              {chunk.keywords && chunk.keywords.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-slate-400 font-medium mr-1">Keywords:</span>
                  {chunk.keywords.slice(0, 8).map((kw, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 text-[10px] rounded-md bg-indigo-50/80 text-indigo-700 border border-indigo-100 font-mono"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

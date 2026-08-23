import React, { useState, useRef } from "react";
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, Sparkles, Trash2 } from "lucide-react";
import { DocumentRecord } from "../types";

interface DocumentUploadProps {
  documents: DocumentRecord[];
  activeDoc: DocumentRecord | null;
  onSelectDoc: (doc: DocumentRecord) => void;
  onRefreshDocs: () => Promise<void>;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({
  documents,
  activeDoc,
  onSelectDoc,
  onRefreshDocs,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Check size limit (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("File exceeds 10 MB limit.");
      return;
    }

    // Check mime or extension
    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".pdf") && !ext.endsWith(".txt") && !ext.endsWith(".md")) {
      setErrorMessage("Unsupported file format. Please upload a PDF or TXT document.");
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to upload document");
      }

      setSuccessMessage(`Document indexed: ${data.document.originalName} (${data.chunkCount} chunks)`);
      await onRefreshDocs();
      if (data.document) {
        onSelectDoc(data.document);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Error processing file.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleLoadSample = async () => {
    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/documents/sample", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load sample document");

      setSuccessMessage("Sample Architecture Manual loaded and ready for evaluation.");
      await onRefreshDocs();
      if (data.document) {
        onSelectDoc(data.document);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Could not load sample document");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDoc = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this document and all its chunks and cached responses?")) return;

    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (res.ok) {
        await onRefreshDocs();
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-indigo-600" />
            Document Ingestion
          </h2>
          <p className="text-xs text-slate-500">PDF or TXT (Max 10 MB) with semantic sentence chunking</p>
        </div>

        <button
          id="btn-load-sample"
          onClick={handleLoadSample}
          disabled={isUploading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>Load Sample Doc (1-Click)</span>
        </button>
      </div>

      {/* Drag & Drop Zone */}
      <div
        id="drop-zone"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileUpload(e.dataTransfer.files[0]);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-indigo-500 bg-indigo-50/50"
            : "border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileUpload(e.target.files[0]);
            }
          }}
        />

        <div className="flex flex-col items-center justify-center space-y-2">
          {isUploading ? (
            <div className="flex flex-col items-center space-y-2 text-indigo-600">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-xs font-medium">Extracting text & generating semantic chunks...</p>
            </div>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                <UploadCloud className="w-5 h-5 text-slate-700" />
              </div>
              <p className="text-xs text-slate-700 font-medium">
                <span className="text-indigo-600 hover:underline">Click to upload</span> or drag and drop
              </p>
              <p className="text-[11px] text-slate-400">PDF, TXT, or Markdown documents</p>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Uploaded Documents List */}
      {documents.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-semibold text-slate-700">Indexed Documents ({documents.length}):</p>
          <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
            {documents.map((doc) => {
              const isSelected = activeDoc?.id === doc.id;
              return (
                <div
                  key={doc.id}
                  id={`doc-card-${doc.id}`}
                  onClick={() => onSelectDoc(doc)}
                  className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50/50 shadow-xs"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <FileText className={`w-4 h-4 shrink-0 ${isSelected ? "text-indigo-600" : "text-slate-400"}`} />
                    <div className="min-w-0">
                      <p className={`font-medium truncate ${isSelected ? "text-indigo-950 font-semibold" : "text-slate-800"}`}>
                        {doc.originalName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {doc.chunkCount} chunks • {(doc.sizeBytes / 1024).toFixed(1)} KB • {doc.pageCount || 1} pages
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Ready
                    </span>
                    <button
                      title="Delete document"
                      onClick={(e) => handleDeleteDoc(doc.id, e)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

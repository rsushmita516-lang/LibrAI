import React from "react";
import { BookOpen, Server, Zap, Database, Terminal, ShieldCheck } from "lucide-react";
import { DocumentRecord, SystemStatus } from "../types";

interface NavbarProps {
  documents: DocumentRecord[];
  activeDoc: DocumentRecord | null;
  onSelectDoc: (doc: DocumentRecord) => void;
  activeTab: "chat" | "chunks" | "api" | "system";
  setActiveTab: (tab: "chat" | "chunks" | "api" | "system") => void;
  systemStatus: SystemStatus | null;
  rateLimitInfo: { limit: number; remaining: number; reset: number } | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  documents,
  activeDoc,
  onSelectDoc,
  activeTab,
  setActiveTab,
  systemStatus,
  rateLimitInfo,
}) => {
  return (
    <header id="app-header" className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and branding */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-sm ring-1 ring-slate-800">
              <BookOpen className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold tracking-tight text-slate-900">LibrAI</span>
                <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Assistant v1.0
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Grounded Document Intelligence & Evidence Engine
              </p>
            </div>
          </div>

          {/* Document Selector */}
          <div className="hidden md:flex items-center space-x-2">
            <label htmlFor="doc-select" className="text-xs font-medium text-slate-500">
              Target Doc:
            </label>
            <select
              id="doc-select"
              value={activeDoc?.id || ""}
              onChange={(e) => {
                const found = documents.find((d) => d.id === e.target.value);
                if (found) onSelectDoc(found);
              }}
              className="text-xs font-medium text-slate-800 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-xs truncate"
            >
              {documents.length === 0 && <option value="">No documents loaded</option>}
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.originalName} ({doc.chunkCount} chunks)
                </option>
              ))}
            </select>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center space-x-1 sm:space-x-2">
            <button
              id="tab-chat"
              onClick={() => setActiveTab("chat")}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "chat"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>AI Chat</span>
            </button>

            <button
              id="tab-chunks"
              onClick={() => setActiveTab("chunks")}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "chunks"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Chunks ({activeDoc?.chunkCount || 0})</span>
            </button>

            <button
              id="tab-api"
              onClick={() => setActiveTab("api")}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "api"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>API & Postman</span>
            </button>

            <button
              id="tab-system"
              onClick={() => setActiveTab("system")}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "system"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">System</span>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

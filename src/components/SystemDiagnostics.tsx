import React, { useEffect, useState } from "react";
import { Server, Database, Cpu, ShieldCheck, RefreshCw, Layers, CheckCircle2, Clock } from "lucide-react";
import { SystemStatus } from "../types";

export const SystemDiagnostics: React.FC = () => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [configData, setConfigData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchDiagnostics = async () => {
    setIsLoading(true);
    try {
      const [readyRes, configRes] = await Promise.all([fetch("/api/ready"), fetch("/api/config")]);
      const readyJson = await readyRes.json();
      const configJson = await configRes.json();
      setStatus(readyJson);
      setConfigData(configJson);
    } catch (err) {
      console.error("Error loading diagnostics:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Server className="w-5 h-5 text-indigo-600" />
            Infrastructure & Runtime Diagnostics
          </h2>
          <p className="text-xs text-slate-500">Live health monitoring for Redis, LLM, storage, and rate-limiting</p>
        </div>

        <button
          onClick={fetchDiagnostics}
          disabled={isLoading}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Grid of Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Redis Service Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-red-500" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Redis Adapter</h3>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
              Active
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span>Adapter Type:</span>
              <span className="font-semibold text-slate-800 uppercase font-mono">
                {status?.checks?.redis?.type || "In-Memory"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span>Ping Response:</span>
              <span className="font-mono text-emerald-600">{status?.checks?.redis?.ping || "PONG"}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span>Active Keys in Cache:</span>
              <span className="font-bold text-slate-900">{status?.checks?.redis?.keysCount ?? 0}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Session TTL:</span>
              <span className="font-mono text-slate-700">{configData?.redis?.sessionTtlSeconds || 86400}s</span>
            </div>
          </div>
        </div>

        {/* LLM Engine Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-indigo-500" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">LLM Provider</h3>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
              {configData?.llmProvider?.toUpperCase() || "GEMINI"}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span>Active Engine:</span>
              <span className="font-semibold text-slate-800">
                {configData?.llmProvider === "gemini" ? "Google Gemini 3.7 Flash" : configData?.llmProvider}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span>Ollama Local URL:</span>
              <span className="font-mono text-slate-600 text-[11px]">
                {configData?.ollama?.baseUrl || "http://127.0.0.1:11434"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span>Ollama Default Model:</span>
              <span className="font-mono text-slate-700">{configData?.ollama?.model || "llama3.2"}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Grounding Fallback:</span>
              <span className="text-emerald-600 font-medium">Enabled (Extractive Synthesizer)</span>
            </div>
          </div>
        </div>

        {/* Retrieval & Grounding Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Retrieval Strategy</h3>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
              Hybrid BM25
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span>Target Chunk Size:</span>
              <span className="font-mono text-slate-800">{configData?.chunking?.targetTokens || 800} tokens</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span>Chunk Overlap Window:</span>
              <span className="font-mono text-slate-800">{configData?.chunking?.overlapTokens || 120} tokens</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span>Confidence Threshold:</span>
              <span className="font-mono text-slate-800">{configData?.evidence?.confidenceThreshold || 0.45}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Rate Limit Policy:</span>
              <span className="font-mono text-slate-800">
                {configData?.redis?.rateLimitMaxRequests || 30} req / {configData?.redis?.rateLimitWindowSeconds || 60}s
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

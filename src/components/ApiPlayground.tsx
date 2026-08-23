import React, { useState } from "react";
import { Download, Terminal, Play, Copy, Check, Code, Shield, Zap } from "lucide-react";
import { DocumentRecord } from "../types";

interface ApiPlaygroundProps {
  activeDoc: DocumentRecord | null;
  sessionId: string;
}

export const ApiPlayground: React.FC<ApiPlaygroundProps> = ({ activeDoc, sessionId }) => {
  const [selectedEndpoint, setSelectedEndpoint] = useState<"chat" | "upload" | "ready" | "history">("chat");
  const [customQuestion, setCustomQuestion] = useState("What is the chunking strategy in LibrAI?");
  const [responseOutput, setResponseOutput] = useState<string | null>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const docId = activeDoc?.id || "doc_sample_librai_manual";

  const getCurlSnippet = () => {
    const origin = window.location.origin;
    if (selectedEndpoint === "chat") {
      return `curl -X POST "${origin}/api/chat" \\
  -H "Content-Type: application/json" \\
  -d '{
    "documentId": "${docId}",
    "sessionId": "${sessionId}",
    "question": "${customQuestion.replace(/"/g, '\\"')}"
  }'`;
    } else if (selectedEndpoint === "ready") {
      return `curl -X GET "${origin}/api/ready"`;
    } else if (selectedEndpoint === "history") {
      return `curl -X GET "${origin}/api/sessions/${sessionId}/history"`;
    } else {
      return `curl -X POST "${origin}/api/documents" \\
  -F "file=@/path/to/document.pdf"`;
    }
  };

  const handleExecuteRequest = async () => {
    setIsRunning(true);
    setResponseOutput(null);
    setResponseStatus(null);
    setResponseHeaders({});

    try {
      let res: Response;

      if (selectedEndpoint === "chat") {
        res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: docId,
            sessionId,
            question: customQuestion,
          }),
        });
      } else if (selectedEndpoint === "ready") {
        res = await fetch("/api/ready");
      } else if (selectedEndpoint === "history") {
        res = await fetch(`/api/sessions/${sessionId}/history`);
      } else {
        res = await fetch("/api/documents/sample", { method: "POST" });
      }

      setResponseStatus(res.status);

      const headers: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        headers[key] = val;
      });
      setResponseHeaders(headers);

      const json = await res.json();
      setResponseOutput(JSON.stringify(json, null, 2));
    } catch (err: any) {
      setResponseOutput(JSON.stringify({ error: err.message }, null, 2));
      setResponseStatus(500);
    } finally {
      setIsRunning(false);
    }
  };

  const handleDownloadPostman = () => {
    const postmanJson = {
      info: {
        _postman_id: "c1f85e49-8c43-471a-9653-librai-assignment",
        name: "LibrAI - AI Document Assistant API",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      variable: [
        { key: "baseUrl", value: window.location.origin, type: "string" },
        { key: "documentId", value: docId, type: "string" },
        { key: "sessionId", value: sessionId, type: "string" },
      ],
      item: [
        {
          name: "Health & Readiness",
          item: [
            {
              name: "Health Check",
              request: { method: "GET", url: "{{baseUrl}}/api/health" },
            },
            {
              name: "Readiness & Redis Status",
              request: { method: "GET", url: "{{baseUrl}}/api/ready" },
            },
          ],
        },
        {
          name: "Document Ingestion",
          item: [
            {
              name: "Load Sample Document",
              request: { method: "POST", url: "{{baseUrl}}/api/documents/sample" },
            },
            {
              name: "List Documents",
              request: { method: "GET", url: "{{baseUrl}}/api/documents" },
            },
          ],
        },
        {
          name: "Chat & Grounding",
          item: [
            {
              name: "Grounded Chat (POST /chat)",
              request: {
                method: "POST",
                header: [{ key: "Content-Type", value: "application/json" }],
                body: {
                  mode: "raw",
                  raw: JSON.stringify(
                    {
                      documentId: "{{documentId}}",
                      sessionId: "{{sessionId}}",
                      question: "What is the chunking strategy and overlap?",
                    },
                    null,
                    2
                  ),
                },
                url: "{{baseUrl}}/api/chat",
              },
            },
            {
              name: "Cache Hit Test (Repeat Question)",
              request: {
                method: "POST",
                header: [{ key: "Content-Type", value: "application/json" }],
                body: {
                  mode: "raw",
                  raw: JSON.stringify(
                    {
                      documentId: "{{documentId}}",
                      sessionId: "{{sessionId}}",
                      question: "What is the chunking strategy and overlap?",
                    },
                    null,
                    2
                  ),
                },
                url: "{{baseUrl}}/api/chat",
              },
            },
          ],
        },
      ],
    };

    const blob = new Blob([JSON.stringify(postmanJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "LibrAI.postman_collection.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(getCurlSnippet());
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Postman Exporter */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold">LibrAI API & Postman Suite</h2>
          </div>
          <p className="text-xs text-slate-300">
            Export the official Postman collection or test live endpoints with interactive cURL requests.
          </p>
        </div>

        <button
          onClick={handleDownloadPostman}
          className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Download Postman Collection (.json)</span>
        </button>
      </div>

      {/* Endpoint Playground */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Request Configurator */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">1. Select Endpoint</h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={() => setSelectedEndpoint("chat")}
              className={`p-2 rounded-lg text-xs font-medium border text-center transition-all ${
                selectedEndpoint === "chat"
                  ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-semibold"
                  : "border-slate-200 hover:border-slate-300 text-slate-700"
              }`}
            >
              POST /api/chat
            </button>
            <button
              onClick={() => setSelectedEndpoint("ready")}
              className={`p-2 rounded-lg text-xs font-medium border text-center transition-all ${
                selectedEndpoint === "ready"
                  ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-semibold"
                  : "border-slate-200 hover:border-slate-300 text-slate-700"
              }`}
            >
              GET /api/ready
            </button>
            <button
              onClick={() => setSelectedEndpoint("history")}
              className={`p-2 rounded-lg text-xs font-medium border text-center transition-all ${
                selectedEndpoint === "history"
                  ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-semibold"
                  : "border-slate-200 hover:border-slate-300 text-slate-700"
              }`}
            >
              GET /api/sessions/...
            </button>
            <button
              onClick={() => setSelectedEndpoint("upload")}
              className={`p-2 rounded-lg text-xs font-medium border text-center transition-all ${
                selectedEndpoint === "upload"
                  ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-semibold"
                  : "border-slate-200 hover:border-slate-300 text-slate-700"
              }`}
            >
              POST /api/documents
            </button>
          </div>

          {selectedEndpoint === "chat" && (
            <div className="space-y-2 pt-2">
              <label className="text-xs font-semibold text-slate-700">Question Body Parameter:</label>
              <input
                type="text"
                value={customQuestion}
                onChange={(e) => setCustomQuestion(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
              />
              <p className="text-[11px] text-slate-400">
                Target doc: <code className="font-mono text-slate-600">{docId}</code> • Session:{" "}
                <code className="font-mono text-slate-600">{sessionId}</code>
              </p>
            </div>
          )}

          {/* cURL Snippet */}
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Generated cURL Command:</span>
              <button
                onClick={handleCopyCurl}
                className="flex items-center space-x-1 text-indigo-600 hover:text-indigo-800 text-[11px] font-medium"
              >
                {copiedCurl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCurl ? "Copied!" : "Copy cURL"}</span>
              </button>
            </div>
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono overflow-x-auto leading-relaxed">
              {getCurlSnippet()}
            </pre>
          </div>

          <button
            onClick={handleExecuteRequest}
            disabled={isRunning}
            className="w-full flex items-center justify-center space-x-2 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isRunning ? "Sending HTTP Request..." : "Send Request from Browser"}</span>
          </button>
        </div>

        {/* Live Response Viewer */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col h-full min-h-[360px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">2. Live Response Output</h3>
            {responseStatus && (
              <span
                className={`px-2 py-0.5 text-xs font-bold font-mono rounded-md ${
                  responseStatus >= 200 && responseStatus < 300
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                HTTP {responseStatus}
              </span>
            )}
          </div>

          {/* Rate limit headers if present */}
          {responseHeaders["x-ratelimit-remaining"] && (
            <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 bg-slate-50 p-2 rounded-lg mb-3">
              <span>Limit: {responseHeaders["x-ratelimit-limit"]}</span>
              <span>Remaining: {responseHeaders["x-ratelimit-remaining"]}</span>
              <span>Reset: {responseHeaders["x-ratelimit-reset"]}s</span>
            </div>
          )}

          {responseOutput ? (
            <pre className="flex-1 p-3 bg-slate-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-y-auto max-h-[380px] leading-relaxed whitespace-pre-wrap">
              {responseOutput}
            </pre>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 text-xs">
              <Code className="w-8 h-8 mb-2 text-slate-300" />
              <p>Execute an endpoint above to inspect the live response body and headers.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

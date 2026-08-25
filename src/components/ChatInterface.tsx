import React, { useState, useRef, useEffect } from "react";
import Markdown from "react-markdown";
import {
  Send,
  Sparkles,
  Bot,
  User,
  Zap,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Cpu,
} from "lucide-react";
import { DocumentRecord, ChatMessage, Citation } from "../types";

interface ChatInterfaceProps {
  activeDoc: DocumentRecord | null;
  sessionId: string;
  onResetSession: () => void;
  onOpenCitation: (citation: Citation) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  activeDoc,
  sessionId,
  onResetSession,
  onOpenCitation,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuestion, setInputQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [providerOverride] = useState<"ollama">("ollama");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load session history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/history`);
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        } else {
          setMessages([]);
        }
      } catch (err) {
        console.error("Error loading session history:", err);
      }
    };

    fetchHistory();
  }, [sessionId, activeDoc?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSendMessage = async (customQuestion?: string) => {
    const q = (customQuestion || inputQuestion).trim();
    if (!q || isLoading) return;

    if (!activeDoc) {
      alert("Please upload or select a document first.");
      return;
    }

    const userMessage: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: "user",
      content: q,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuestion("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: activeDoc.id,
          sessionId,
          question: q,
          llmProviderOverride: providerOverride,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to get AI answer.");
      }

      const assistantMessage: ChatMessage = {
        id: `ast_${Date.now()}`,
        role: "assistant",
        content: data.answer,
        timestamp: new Date().toISOString(),
        citations: data.citations || [],
        cached: data.cached,
        evidenceStatus: data.evidenceStatus,
        confidenceScore: data.confidenceScore,
        latencyMs: data.latencyMs,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage: ChatMessage = {
        id: `err_${Date.now()}`,
        role: "assistant",
        content: `**Error:** ${err.message || "An unexpected error occurred."}`,
        timestamp: new Date().toISOString(),
        evidenceStatus: "insufficient",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const sampleQuestions = [
    {
      label: "1. Supported Question",
      text: "What is the target chunk size and overlap used in LibrAI's chunking strategy?",
    },
    {
      label: "2. Multi-turn Follow-up",
      text: "Why is that specific overlap window used?",
    },
    {
      label: "3. Negative Grounding Test",
      text: "What is the CEO's favorite pizza topping and personal stock portfolio?",
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col h-[740px] overflow-hidden">
      {/* Chat Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-indigo-600" />
              Grounded AI Chat
            </h2>
            {activeDoc && (
              <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                {activeDoc.originalName}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Session: <code className="font-mono text-slate-700">{sessionId}</code> • Redis TTL: 24h
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] font-medium text-slate-700">Ollama (Local)</span>
          </div>

          <button
            title="Reset multi-turn session"
            onClick={onResetSession}
            className="flex items-center space-x-1 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Session</span>
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Ask Anything About Your Document</h3>
              <p className="text-xs text-slate-500 mt-1">
                LibrAI uses BM25 and vector search to answer strictly from document evidence. Try a sample question below:
              </p>
            </div>

            {/* Suggested Sample Prompts */}
            <div className="w-full space-y-2 pt-2">
              {sampleQuestions.map((sq, i) => (
                <button
                  key={i}
                  onClick={() => handleSendMessage(sq.text)}
                  className="w-full text-left p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-indigo-50/50 hover:border-indigo-200 transition-all text-xs text-slate-700 flex items-center justify-between group"
                >
                  <div>
                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">
                      {sq.label}
                    </span>
                    <span className="font-medium text-slate-800">{sq.text}</span>
                  </div>
                  <Send className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0 ml-2" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                id={`chat-msg-${msg.id}`}
                className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-slate-900 text-indigo-400 flex items-center justify-center shrink-0 shadow-xs ring-1 ring-slate-800">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className={`max-w-[85%] sm:max-w-[80%] space-y-2 ${isUser ? "items-end" : "items-start"}`}>
                  {/* Bubble */}
                  <div
                    className={`p-4 rounded-2xl text-xs leading-relaxed ${
                      isUser
                        ? "bg-slate-900 text-white rounded-tr-xs"
                        : "bg-slate-50 border border-slate-200/90 text-slate-800 rounded-tl-xs shadow-2xs"
                    }`}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="markdown-body prose-xs prose-slate max-w-none">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    )}
                  </div>

                  {/* Metadata and Citations for Assistant */}
                  {!isUser && (
                    <div className="space-y-2 px-1">
                      {/* Metric Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        {/* Cache Hit Badge */}
                        {msg.cached !== undefined && (
                          <span
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold border ${
                              msg.cached
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            <Zap className="w-3 h-3 text-amber-600" />
                            {msg.cached ? `⚡ Redis Cache Hit (${msg.latencyMs || 8}ms)` : `LLM Fresh (${msg.latencyMs || 400}ms)`}
                          </span>
                        )}

                        {/* Evidence Status */}
                        {msg.evidenceStatus && (
                          <span
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-medium border ${
                              msg.evidenceStatus === "supported"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : msg.evidenceStatus === "insufficient"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-red-50 text-red-800 border-red-200"
                            }`}
                          >
                            <ShieldCheck className="w-3 h-3" />
                            Evidence: {msg.evidenceStatus}
                          </span>
                        )}
                      </div>

                      {/* Evidence Citations Chips */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] text-slate-500 font-medium mr-1">Sources:</span>
                          {msg.citations.map((cit, idx) => (
                            <button
                              key={idx}
                              onClick={() => onOpenCitation(cit)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50/90 text-indigo-800 border border-indigo-200 text-[10px] font-medium hover:bg-indigo-100 transition-colors shadow-2xs"
                            >
                              <BookOpen className="w-3 h-3 text-indigo-600" />
                              <span>
                                Page {cit.pageNumber} (Chunk #{cit.chunkIndex + 1})
                              </span>
                              <span className="text-[9px] text-indigo-500 font-mono">
                                {Math.round(cit.relevanceScore * 100)}%
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {isLoading && (
          <div className="flex gap-3 items-center text-xs text-slate-500">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-indigo-400 flex items-center justify-center shrink-0 shadow-xs animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center space-x-2">
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-600 animate-bounce"></span>
              <span
                className="inline-block w-2 h-2 rounded-full bg-indigo-600 animate-bounce"
                style={{ animationDelay: "150ms" }}
              ></span>
              <span
                className="inline-block w-2 h-2 rounded-full bg-indigo-600 animate-bounce"
                style={{ animationDelay: "300ms" }}
              ></span>
              <span className="text-[11px] text-slate-600 font-medium pl-1">
                Retrieving chunks & generating grounded answer...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/50 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            id="chat-input"
            type="text"
            placeholder={
              activeDoc
                ? `Ask about "${activeDoc.originalName}"... (Repeat a question to test Redis cache)`
                : "Please upload or select a document first..."
            }
            disabled={!activeDoc || isLoading}
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            className="flex-1 px-4 py-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-slate-100"
          />

          <button
            id="btn-send-chat"
            type="submit"
            disabled={!activeDoc || !inputQuestion.trim() || isLoading}
            className="flex items-center justify-center px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 transition-colors text-xs font-medium shrink-0"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
};

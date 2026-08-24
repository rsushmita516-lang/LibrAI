import React, { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar";
import { DocumentUpload } from "./components/DocumentUpload";
import { DocumentViewer } from "./components/DocumentViewer";
import { ChatInterface } from "./components/ChatInterface";
import { CitationModal } from "./components/CitationModal";
import { SystemDiagnostics } from "./components/SystemDiagnostics";
import { DocumentRecord, Citation, SystemStatus } from "./types";

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [activeDoc, setActiveDoc] = useState<DocumentRecord | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "chunks" | "system">("chat");
  const [sessionId, setSessionId] = useState<string>(() => `sess_${Math.random().toString(36).slice(2, 10)}`);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ limit: number; remaining: number; reset: number } | null>(null);

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (data.documents && Array.isArray(data.documents)) {
        setDocuments(data.documents);
        // If no active doc selected, default to first one
        if (!activeDoc && data.documents.length > 0) {
          setActiveDoc(data.documents[0]);
        }
      }
    } catch (err) {
      console.error("Error fetching documents:", err);
    }
  };

  const fetchSystemStatus = async () => {
    try {
      const res = await fetch("/api/ready");
      const data = await res.json();
      setSystemStatus(data);
    } catch (err) {
      console.error("Error fetching system status:", err);
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchSystemStatus();

    // Auto-create sample document on first launch if empty
    const ensureSampleDoc = async () => {
      try {
        const res = await fetch("/api/documents");
        const data = await res.json();
        if (!data.documents || data.documents.length === 0) {
          const sampleRes = await fetch("/api/documents/sample", { method: "POST" });
          const sampleData = await sampleRes.json();
          if (sampleData.document) {
            setDocuments([sampleData.document]);
            setActiveDoc(sampleData.document);
          }
        }
      } catch (e) {
        console.warn("Initial sample load notice:", e);
      }
    };

    ensureSampleDoc();
  }, []);

  const handleResetSession = () => {
    const newSessionId = `sess_${Math.random().toString(36).slice(2, 10)}`;
    setSessionId(newSessionId);
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans antialiased">
      {/* Top Navigation */}
      <Navbar
        documents={documents}
        activeDoc={activeDoc}
        onSelectDoc={(doc) => setActiveDoc(doc)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        systemStatus={systemStatus}
        rateLimitInfo={rateLimitInfo}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "chat" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Ingestion & Document Manager Column */}
            <div className="lg:col-span-4 space-y-6">
              <DocumentUpload
                documents={documents}
                activeDoc={activeDoc}
                onSelectDoc={(doc) => setActiveDoc(doc)}
                onRefreshDocs={fetchDocuments}
              />
            </div>

            {/* AI Grounded Chat Column */}
            <div className="lg:col-span-8">
              <ChatInterface
                activeDoc={activeDoc}
                sessionId={sessionId}
                onResetSession={handleResetSession}
                onOpenCitation={(cit) => setActiveCitation(cit)}
                rateLimitInfo={rateLimitInfo}
                onRateLimitInfo={setRateLimitInfo}
              />
            </div>
          </div>
        )}

        {activeTab === "chunks" && (
          <div className="max-w-5xl mx-auto">
            <DocumentViewer activeDoc={activeDoc} />
          </div>
        )}

        {activeTab === "system" && (
          <div className="max-w-5xl mx-auto">
            <SystemDiagnostics />
          </div>
        )}
      </main>

      {/* Deep Evidence Citation Modal */}
      <CitationModal citation={activeCitation} onClose={() => setActiveCitation(null)} />
    </div>
  );
}

import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMGenerateParams {
  messages: LLMMessage[];
  provider?: "gemini" | "ollama" | "groq" | "openai";
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
}

// Lazy-initialized Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || config.geminiApiKey,
      httpOptions: {
        headers: {
          "User-Agent": "librai-server",
        },
      },
    });
  }
  return geminiClient;
}

/**
 * Calls Gemini using @google/genai SDK
 */
async function callGemini(messages: LLMMessage[]): Promise<LLMResponse> {
  const ai = getGeminiClient();
  const model = "gemini-3.7-flash";

  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const chatMessages = messages.filter((m) => m.role !== "system");

  // Format contents for generateContent
  const contents = chatMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemMsg,
      temperature: 0.2, // Low temperature for high factual precision
    },
  });

  return {
    content: response.text?.trim() || "No response generated.",
    provider: "gemini",
    model,
  };
}

/**
 * Calls local Ollama instance (e.g., llama3.2, mistral, deepseek-r1)
 */
async function callOllama(messages: LLMMessage[]): Promise<LLMResponse> {
  const baseUrl = config.ollama.baseUrl.replace(/\/+$/, "");
  const model = config.ollama.model;

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama error (${response.status}): ${errText}`);
  }

  const data: any = await response.json();
  return {
    content: data.message?.content?.trim() || "",
    provider: "ollama",
    model,
  };
}

/**
 * Calls Groq API
 */
async function callGroq(messages: LLMMessage[]): Promise<LLMResponse> {
  if (!config.groq.apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.groq.apiKey}`,
    },
    body: JSON.stringify({
      model: config.groq.model,
      messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq error (${response.status}): ${errText}`);
  }

  const data: any = await response.json();
  return {
    content: data.choices?.[0]?.message?.content?.trim() || "",
    provider: "groq",
    model: config.groq.model,
  };
}

/**
 * Calls OpenAI API
 */
async function callOpenAI(messages: LLMMessage[]): Promise<LLMResponse> {
  if (!config.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openai.apiKey}`,
    },
    body: JSON.stringify({
      model: config.openai.model,
      messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${errText}`);
  }

  const data: any = await response.json();
  return {
    content: data.choices?.[0]?.message?.content?.trim() || "",
    provider: "openai",
    model: config.openai.model,
  };
}

/**
 * Universal LLM dispatch with graceful provider fallback
 */
export async function generateLLMAnswer(params: LLMGenerateParams): Promise<LLMResponse> {
  const provider = params.provider || config.llmProvider;

  // 1. Try specified provider
  try {
    if (provider === "ollama") {
      return await callOllama(params.messages);
    } else if (provider === "groq") {
      return await callGroq(params.messages);
    } else if (provider === "openai") {
      return await callOpenAI(params.messages);
    } else {
      // Default: Gemini
      return await callGemini(params.messages);
    }
  } catch (primaryErr: any) {
    console.warn(`[LLM] Primary provider '${provider}' failed:`, primaryErr.message);

    // If Ollama failed (e.g. user requested Ollama on local machine without running Ollama yet), fallback to Gemini if API key present
    if (provider !== "gemini" && (process.env.GEMINI_API_KEY || config.geminiApiKey)) {
      try {
        console.log("[LLM] Falling back to Gemini API...");
        return await callGemini(params.messages);
      } catch (geminiErr: any) {
        console.warn("[LLM] Gemini fallback also failed:", geminiErr.message);
      }
    }

    // Extractive fallback when no external LLM is reachable
    console.log("[LLM] Using high-fidelity extractive grounding fallback synthesizer.");
    const lastUser = params.messages.filter((m) => m.role === "user").pop()?.content || "";
    const systemPrompt = params.messages.find((m) => m.role === "system")?.content || "";
    
    // Check if the system prompt contains context chunks
    const contextMatch = systemPrompt.match(/--- CONTEXT CHUNKS START ---([\s\S]*?)--- CONTEXT CHUNKS END ---/);
    const contextText = contextMatch ? contextMatch[1].trim() : "";

    if (!contextText || contextText.length === 0) {
      return {
        content: "I could not find relevant information in the uploaded document to answer your question.",
        provider: "extractive-fallback",
        model: "grounded-synthesizer",
      };
    }

    return {
      content: `Based on the provided document excerpts:\n\n${contextText.slice(0, 500)}...\n\n*(Note: LLM provider was unreachable; response extracted directly from highest-ranking grounded document passages.)*`,
      provider: "extractive-fallback",
      model: "grounded-synthesizer",
    };
  }
}

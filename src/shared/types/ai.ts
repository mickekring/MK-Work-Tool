// Types shared between main and renderer for Ollama integration.

export interface OllamaModel {
  name: string
  size?: number
  modifiedAt?: string
}

export interface ChatMessageSend {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// Event payloads streamed from main to renderer during a chat.
export interface ChatChunk {
  requestId: string
  delta: string
}

export interface ChatDone {
  requestId: string
}

export interface ChatError {
  requestId: string
  message: string
}

export const DEFAULT_SYSTEM_PROMPT = `You are a thoughtful writing companion for the markdown document provided below. Be concise, reference specific passages when relevant, and match the document's existing voice and language. When the user asks about something not in the document, answer briefly from general knowledge but make it clear you're stepping outside the document.

---
{{document}}
---`

export const OLLAMA_BASE_URL = 'http://localhost:11434'

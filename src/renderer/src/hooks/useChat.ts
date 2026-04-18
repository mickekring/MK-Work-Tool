import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  OllamaModel,
  ChatMessageSend,
  ChatChunk,
  ChatDone,
  ChatError
} from '@shared/types/ai'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  // True while the assistant is still streaming this message.
  streaming?: boolean
  // Set if this message ended with an error instead of a completion.
  error?: string
}

export interface UseChatOptions {
  // Unique per document — used to reset state when the file changes.
  filePath: string | null
  model: string | null
  // Raw system-prompt template from settings. May contain {{document}}.
  systemPromptTemplate: string
  // Current full text of the document being edited.
  documentText: string
}

function buildSystemPrompt(template: string, doc: string): string {
  if (template.includes('{{document}}')) {
    return template.replace('{{document}}', doc)
  }
  // If the user removed the placeholder, append the doc so the model
  // still has context instead of silently losing it.
  return `${template}\n\n---\nDocument:\n---\n${doc}`
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export interface UseChatResult {
  messages: ChatMessage[]
  isStreaming: boolean
  sendMessage: (text: string) => void
  abort: () => void
  clear: () => void
}

export function useChat({
  filePath,
  model,
  systemPromptTemplate,
  documentText
}: UseChatOptions): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const requestIdRef = useRef<string | null>(null)

  // Keep latest doc + prompt in refs so sendMessage closures aren't stale.
  const docRef = useRef(documentText)
  const promptRef = useRef(systemPromptTemplate)
  const modelRef = useRef(model)
  useEffect(() => {
    docRef.current = documentText
  }, [documentText])
  useEffect(() => {
    promptRef.current = systemPromptTemplate
  }, [systemPromptTemplate])
  useEffect(() => {
    modelRef.current = model
  }, [model])

  // Reset chat when the file changes.
  useEffect(() => {
    setMessages([])
    setIsStreaming(false)
    requestIdRef.current = null
  }, [filePath])

  // Subscribe to streaming events once.
  useEffect(() => {
    const unsubChunk = window.api.on('ai:chat-chunk', (raw) => {
      const { requestId, delta } = raw as ChatChunk
      if (requestId !== requestIdRef.current) return
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          next[next.length - 1] = {
            ...last,
            content: last.content + delta
          }
        }
        return next
      })
    })

    const unsubDone = window.api.on('ai:chat-done', (raw) => {
      const { requestId } = raw as ChatDone
      if (requestId !== requestIdRef.current) return
      requestIdRef.current = null
      setIsStreaming(false)
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          next[next.length - 1] = { ...last, streaming: false }
        }
        return next
      })
    })

    const unsubError = window.api.on('ai:chat-error', (raw) => {
      const { requestId, message } = raw as ChatError
      if (requestId !== requestIdRef.current) return
      requestIdRef.current = null
      setIsStreaming(false)
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          next[next.length - 1] = {
            ...last,
            streaming: false,
            error: message
          }
        } else {
          next.push({
            id: makeId(),
            role: 'assistant',
            content: '',
            error: message
          })
        }
        return next
      })
    })

    return () => {
      unsubChunk()
      unsubDone()
      unsubError()
    }
  }, [])

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const currentModel = modelRef.current
      if (!currentModel) return

      const userMsg: ChatMessage = {
        id: makeId(),
        role: 'user',
        content: trimmed
      }
      const assistantMsg: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        content: '',
        streaming: true
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])

      // Build the IPC payload using the latest assembled history.
      setIsStreaming(true)
      const requestId = makeId()
      requestIdRef.current = requestId

      setMessages((prev) => {
        // `prev` here already includes the two we just appended above
        // because React batches state updates — but to be safe, build
        // the outgoing messages from the previous snapshot plus the
        // new user message, not the one in `prev`.
        const priorUserAssistant: ChatMessageSend[] = prev
          .filter((m) => !(m.role === 'assistant' && m.streaming))
          .map((m) => ({ role: m.role, content: m.content }))

        const outgoing: ChatMessageSend[] = [
          {
            role: 'system',
            content: buildSystemPrompt(promptRef.current, docRef.current)
          },
          ...priorUserAssistant
        ]

        window.api
          .invoke('ai:chat-start', requestId, currentModel, outgoing)
          .catch((err) => {
            console.error('ai:chat-start invoke failed', err)
          })

        return prev
      })
    },
    []
  )

  const abort = useCallback(() => {
    const id = requestIdRef.current
    if (!id) return
    window.api.invoke('ai:chat-abort', id).catch(() => {})
    requestIdRef.current = null
    setIsStreaming(false)
    setMessages((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        next[next.length - 1] = {
          ...last,
          streaming: false,
          error: 'Cancelled'
        }
      }
      return next
    })
  }, [])

  const clear = useCallback(() => {
    abort()
    setMessages([])
  }, [abort])

  return { messages, isStreaming, sendMessage, abort, clear }
}

// Hook to fetch the Ollama model list. Returns { ok, models } or
// { ok: false, error }. Re-fetches on demand via refetch().
export function useOllamaModels(): {
  models: OllamaModel[]
  error: string | null
  loading: boolean
  refetch: () => void
} {
  const [models, setModels] = useState<OllamaModel[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.api.invoke<
        { ok: true; models: OllamaModel[] } | { ok: false; error: string }
      >('ai:list-models')
      if (result.ok) {
        setModels(result.models)
        setError(null)
      } else {
        setModels([])
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { models, error, loading, refetch }
}

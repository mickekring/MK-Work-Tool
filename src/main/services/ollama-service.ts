import type {
  OllamaModel,
  ChatMessageSend
} from '@shared/types/ai'
import { OLLAMA_BASE_URL } from '@shared/types/ai'

export interface ListModelsResult {
  ok: true
  models: OllamaModel[]
}

export interface ListModelsError {
  ok: false
  error: string
}

/**
 * Fetch the list of locally-installed Ollama models. Returns a
 * discriminated union so callers can surface a friendly message when
 * Ollama is not running or is unreachable.
 */
export async function listModels(): Promise<ListModelsResult | ListModelsError> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    })
    if (!res.ok) {
      return { ok: false, error: `Ollama returned ${res.status}` }
    }
    const data = (await res.json()) as {
      models?: Array<{ name: string; size?: number; modified_at?: string }>
    }
    const models: OllamaModel[] = (data.models ?? []).map((m) => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at
    }))
    return { ok: true, models }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
      return {
        ok: false,
        error: 'Could not reach Ollama at localhost:11434 — is it running?'
      }
    }
    return { ok: false, error: msg }
  }
}

/**
 * Stream a chat completion. Calls onDelta for each text chunk, onDone
 * when the stream finishes, and onError if anything goes wrong.
 * Uses the provided AbortSignal so the caller can cancel mid-stream.
 */
export async function streamChat(
  model: string,
  messages: ChatMessageSend[],
  signal: AbortSignal,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void
): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') return
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
      onError('Could not reach Ollama at localhost:11434 — is it running?')
    } else {
      onError(msg)
    }
    return
  }

  if (!res.ok || !res.body) {
    let detail = `Ollama returned ${res.status}`
    try {
      const body = await res.text()
      if (body) detail = `${detail}: ${body}`
    } catch {
      /* ignore */
    }
    onError(detail)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line) continue
        try {
          const obj = JSON.parse(line) as {
            message?: { content?: string }
            done?: boolean
            error?: string
          }
          if (obj.error) {
            onError(obj.error)
            return
          }
          if (obj.message?.content) onDelta(obj.message.content)
          if (obj.done) {
            onDone()
            return
          }
        } catch {
          /* skip malformed line */
        }
      }
    }
    onDone()
  } catch (error) {
    if ((error as Error).name === 'AbortError') return
    onError(error instanceof Error ? error.message : String(error))
  }
}

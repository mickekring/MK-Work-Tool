import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '@/hooks/useChat'

export interface AIChatSectionProps {
  model: string | null
  availableModels: string[]
  modelError: string | null
  onChangeModel?: (model: string) => void
  onOpenSettings?: () => void
  messages: ChatMessage[]
  isStreaming: boolean
  onSend?: (text: string) => void
  onAbort?: () => void
  onClear?: () => void
  canSend: boolean
  emptyState?: string
}

export function AIChatSection({
  model,
  availableModels,
  modelError,
  onChangeModel,
  onOpenSettings,
  messages,
  isStreaming,
  onSend,
  onAbort,
  onClear,
  canSend,
  emptyState
}: AIChatSectionProps) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Auto-scroll to bottom on new messages/streaming chunks.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  // Autosize textarea up to a reasonable cap.
  const resizeTextarea = (): void => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }
  useEffect(resizeTextarea, [draft])

  const handleSend = (): void => {
    if (!draft.trim() || !canSend) return
    onSend?.(draft)
    setDraft('')
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Cmd/Ctrl+Enter or plain Enter (without Shift) to send.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const showSetupHint = !model || availableModels.length === 0

  return (
    <div className="space-y-2">
      {/* Model selector row */}
      <div className="flex items-center gap-1.5">
        <select
          className="flex-1 min-w-0 text-xs bg-muted text-foreground px-2 py-1 rounded border border-border-subtle focus:outline-none focus:ring-1 focus:ring-primary"
          value={model ?? ''}
          onChange={(e) => onChangeModel?.(e.target.value)}
          disabled={availableModels.length === 0}
        >
          {availableModels.length === 0 ? (
            <option value="">No models</option>
          ) : (
            <>
              {!model && <option value="">Select a model…</option>}
              {availableModels.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </>
          )}
        </select>
        <button
          className="btn-ghost p-1 flex items-center justify-center"
          onClick={onOpenSettings}
          title="AI settings"
          aria-label="AI settings"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24" />
          </svg>
        </button>
      </div>

      {modelError && (
        <p className="text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded">
          {modelError}
        </p>
      )}

      {/* Messages */}
      <div
        ref={listRef}
        className="max-h-[420px] min-h-[80px] overflow-y-auto rounded bg-muted/30 p-2 text-sm space-y-2"
      >
        {messages.length === 0 ? (
          <p className="text-muted-foreground text-xs py-2 text-center">
            {showSetupHint
              ? emptyState ??
                'Pick a model above to chat with this document.'
              : 'Ask anything about this document.'}
          </p>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
      </div>

      {/* Input */}
      <div className="flex items-stretch gap-1.5">
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={canSend ? 'Ask about this note…' : 'Open a file first'}
          disabled={!canSend}
          className="flex-1 resize-none text-sm bg-muted text-foreground px-2 py-1.5 rounded border border-border-subtle focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          style={{ maxHeight: 160 }}
        />
        {isStreaming ? (
          <button
            className="self-end aspect-square rounded flex items-center justify-center transition-colors"
            style={{
              height: '2.125rem',
              color: 'var(--color-primary)',
              background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)'
            }}
            onClick={onAbort}
            title="Stop"
            aria-label="Stop streaming"
          >
            <svg
              className="animate-spin"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M12 2 A10 10 0 0 1 22 12" />
              <circle cx="12" cy="12" r="10" opacity="0.25" />
            </svg>
          </button>
        ) : (
          <button
            className="self-end aspect-square rounded flex items-center justify-center transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              height: '2.125rem',
              background: 'var(--color-primary)',
              color: 'var(--color-primary-foreground)'
            }}
            onClick={handleSend}
            disabled={!canSend || !draft.trim()}
            title="Send (Enter)"
            aria-label="Send"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>

      {messages.length > 0 && (
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={onClear}
        >
          Clear conversation
        </button>
      )}
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div
      className={`px-2 py-1.5 rounded ${
        isUser
          ? 'bg-sidebar-hover text-foreground'
          : 'bg-transparent text-foreground/95'
      }`}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {isUser ? 'You' : 'Assistant'}
      </div>
      <div className="chat-markdown break-words leading-snug">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.content}
        </ReactMarkdown>
        {message.streaming && (
          <span className="inline-block w-1.5 h-3 ml-0.5 align-baseline bg-foreground/60 animate-pulse-subtle" />
        )}
      </div>
      {message.error && (
        <div className="text-destructive mt-1 text-xs">
          {message.error}
        </div>
      )}
    </div>
  )
}

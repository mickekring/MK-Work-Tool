import { useEffect, useRef, useState } from 'react'
import type { SearchHit, SearchResults } from '@shared/types/search'

interface SearchPanelProps {
  onClose: () => void
  onOpenFile: (filePath: string) => void
}

const DEBOUNCE_MS = 150
const RESULT_LIMIT = 40

export function SearchPanel({ onClose, onOpenFile }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Autofocus when the panel mounts.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounced query → IPC. Each new query supersedes the previous.
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults(null)
      setPending(false)
      return
    }
    setPending(true)
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await window.api.invoke<SearchResults>(
          'search:query',
          trimmed,
          RESULT_LIMIT
        )
        if (!cancelled) {
          setResults(res)
          setPending(false)
        }
      } catch (err) {
        console.error('Search failed:', err)
        if (!cancelled) {
          setResults(null)
          setPending(false)
        }
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const filenameHits = results?.filenameHits ?? []
  const contentHits = results?.contentHits ?? []
  const totalContent = results?.totalContentMatches ?? 0
  const hasResults = filenameHits.length > 0 || contentHits.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Search input row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle titlebar-no-drag">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground flex-shrink-0"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search notes…"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button
          className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-hover transition-colors"
          onClick={onClose}
          title="Close search (Esc)"
          aria-label="Close search"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!query.trim() ? (
          <p className="px-4 py-6 text-xs text-muted-foreground text-center">
            Start typing to search titles and content.
          </p>
        ) : pending && !results ? (
          <p className="px-4 py-6 text-xs text-muted-foreground text-center">
            Searching…
          </p>
        ) : !hasResults ? (
          <p className="px-4 py-6 text-xs text-muted-foreground text-center">
            No matches for "{query.trim()}".
          </p>
        ) : (
          <>
            {filenameHits.length > 0 && (
              <Section label="Filenames">
                {filenameHits.map((hit) => (
                  <ResultRow
                    key={'fn:' + hit.filePath}
                    hit={hit}
                    query={query.trim()}
                    onClick={() => onOpenFile(hit.filePath)}
                  />
                ))}
              </Section>
            )}
            {contentHits.length > 0 && (
              <Section label="Matches">
                {contentHits.map((hit) => (
                  <ResultRow
                    key={'ct:' + hit.filePath}
                    hit={hit}
                    query={query.trim()}
                    onClick={() => onOpenFile(hit.filePath)}
                  />
                ))}
                {totalContent > contentHits.length && (
                  <p className="px-4 py-2 text-xs text-muted-foreground">
                    +{totalContent - contentHits.length} more
                    {totalContent - contentHits.length === 1
                      ? ' match'
                      : ' matches'}{' '}
                    — refine your query
                  </p>
                )}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Section({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="px-4 pt-3 pb-1 text-xs uppercase tracking-wider text-muted-foreground/80 font-medium">
        {label}
      </h3>
      {children}
    </section>
  )
}

function ResultRow({
  hit,
  query,
  onClick
}: {
  hit: SearchHit
  query: string
  onClick: () => void
}) {
  const relative = hit.relativePath
  const slash = relative.lastIndexOf('/')
  const name = (slash >= 0 ? relative.slice(slash + 1) : relative).replace(
    /\.md$/,
    ''
  )
  const folder = slash >= 0 ? relative.slice(0, slash) : ''

  return (
    <button
      className="w-full text-left px-4 py-2 hover:bg-sidebar-hover transition-colors border-b border-border-subtle/40"
      onClick={onClick}
      title={relative}
    >
      <div className="text-sm text-foreground truncate">
        <Highlighted text={name} query={query} />
      </div>
      {folder && (
        <div className="text-xs text-muted-foreground truncate font-mono">
          {folder}
        </div>
      )}
      {hit.snippet && (
        <div className="text-xs text-muted-foreground/90 mt-1 line-clamp-2">
          <Highlighted text={hit.snippet} query={query} />
        </div>
      )}
    </button>
  )
}

/** Case-insensitive highlight of every occurrence of `query` inside `text`. */
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const q = query.toLowerCase()
  const lower = text.toLowerCase()
  const parts: React.ReactNode[] = []
  let cursor = 0
  let idx = lower.indexOf(q, cursor)
  while (idx !== -1) {
    if (idx > cursor) parts.push(text.slice(cursor, idx))
    parts.push(
      <mark
        key={idx}
        className="rounded-sm px-0.5 font-medium"
        style={{
          background: 'color-mix(in srgb, var(--color-primary) 28%, transparent)',
          color: 'var(--color-foreground)'
        }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>
    )
    cursor = idx + query.length
    idx = lower.indexOf(q, cursor)
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

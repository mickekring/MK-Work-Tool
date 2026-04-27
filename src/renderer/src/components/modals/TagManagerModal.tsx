import { useEffect, useMemo, useState } from 'react'
import type { TagIndexSnapshot } from '@shared/types/tags'

interface TagManagerModalProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Called after a tag deletion completes with the list of absolute
   * file paths that were modified. Lets the parent reload the editor
   * if the currently-open file was one of them.
   */
  onTagRemoved?: (filesModified: string[]) => void
}

type SortMode = 'count' | 'name'

interface TagRow {
  display: string
  lower: string
  count: number
}

interface RecentResult {
  tag: string
  filesModified: number
  occurrencesRemoved: number
}

export function TagManagerModal({
  isOpen,
  onClose,
  onTagRemoved
}: TagManagerModalProps) {
  const [index, setIndex] = useState<TagIndexSnapshot | null>(null)
  const [filter, setFilter] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('count')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [busyTag, setBusyTag] = useState<string | null>(null)
  const [recentResult, setRecentResult] = useState<RecentResult | null>(null)

  // Initial load + live updates
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const snap = await window.api.invoke<TagIndexSnapshot>('tags:get-index')
        if (!cancelled) setIndex(snap)
      } catch (err) {
        console.error('TagManager: failed to load tag index', err)
      }
    }
    load()
    const off = window.api.on('tags:index-changed', (snap) => {
      if (!cancelled) setIndex(snap as TagIndexSnapshot)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [isOpen])

  // Reset transient UI state whenever the modal opens
  useEffect(() => {
    if (!isOpen) return
    setFilter('')
    setPendingDelete(null)
    setBusyTag(null)
    setRecentResult(null)
  }, [isOpen])

  // Escape: clear filter / pending confirm first, close last
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (pendingDelete) {
        setPendingDelete(null)
      } else if (filter) {
        setFilter('')
      } else {
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose, filter, pendingDelete])

  const rows: TagRow[] = useMemo(() => {
    if (!index) return []
    const items: TagRow[] = []
    for (const display of index.allTags) {
      const files = index.filesByTag[display] ?? []
      items.push({
        display,
        lower: display.toLowerCase(),
        count: files.length
      })
    }
    const q = filter.trim().toLowerCase().replace(/^#+/, '')
    const filtered = q ? items.filter((r) => r.lower.includes(q)) : items
    filtered.sort((a, b) => {
      if (sortMode === 'count' && a.count !== b.count) return b.count - a.count
      return a.display.localeCompare(b.display)
    })
    return filtered
  }, [index, filter, sortMode])

  if (!isOpen) return null

  const totalTags = index?.allTags.length ?? 0

  const handleConfirmDelete = async (tag: string): Promise<void> => {
    setBusyTag(tag)
    try {
      const result = await window.api.invoke<{
        filesModified: string[]
        occurrencesRemoved: number
      }>('tags:remove-tag', tag)
      setRecentResult({
        tag,
        filesModified: result.filesModified.length,
        occurrencesRemoved: result.occurrencesRemoved
      })
      onTagRemoved?.(result.filesModified)
    } catch (err) {
      console.error('TagManager: failed to remove tag', err)
    } finally {
      setBusyTag(null)
      setPendingDelete(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative bg-background rounded-lg shadow-2xl w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div>
            <h1 className="text-base font-semibold text-foreground">
              Tag Manager
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalTags === 0
                ? 'No tags in this vault yet.'
                : `${totalTags} tag${totalTags === 1 ? '' : 's'} in this vault`}
            </p>
          </div>
          <button
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border-subtle">
          <div className="relative flex-1">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              autoFocus
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter tags…"
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md bg-muted/50 border border-border-subtle focus:outline-none focus:border-primary placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex items-center rounded-md border border-border-subtle overflow-hidden text-xs">
            <button
              className={`px-2.5 py-1.5 transition-colors ${
                sortMode === 'count'
                  ? 'bg-accent text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-hover'
              }`}
              onClick={() => setSortMode('count')}
              title="Sort by note count (descending)"
            >
              Count
            </button>
            <button
              className={`px-2.5 py-1.5 transition-colors ${
                sortMode === 'name'
                  ? 'bg-accent text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-hover'
              }`}
              onClick={() => setSortMode('name')}
              title="Sort A–Z"
            >
              A–Z
            </button>
          </div>
        </div>

        {/* Recent-action banner */}
        {recentResult && (
          <div className="px-5 py-2 text-xs text-muted-foreground bg-muted/30 border-b border-border-subtle">
            Removed{' '}
            <span className="text-primary font-medium">#{recentResult.tag}</span>{' '}
            from {recentResult.filesModified} note
            {recentResult.filesModified === 1 ? '' : 's'} (
            {recentResult.occurrencesRemoved} occurrence
            {recentResult.occurrencesRemoved === 1 ? '' : 's'}).
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-5 py-10 text-sm text-center text-muted-foreground">
              {totalTags === 0
                ? 'Add #tags to your notes and they’ll show up here.'
                : 'No tags match the filter.'}
            </div>
          ) : (
            <ul>
              {rows.map((row) => {
                const isPending = pendingDelete === row.display
                const isBusy = busyTag === row.display
                return (
                  <li
                    key={row.display}
                    className="px-5 py-2 flex items-center gap-3 border-b border-border-subtle last:border-b-0 hover:bg-sidebar-hover/50 transition-colors"
                  >
                    {isPending ? (
                      <>
                        <div className="flex-1 text-sm text-foreground">
                          Remove the{' '}
                          <span className="text-primary font-medium">#</span>{' '}
                          from{' '}
                          <span className="font-medium">{row.display}</span> in{' '}
                          {row.count} note{row.count === 1 ? '' : 's'}? The word
                          stays.
                        </div>
                        <button
                          className="px-2.5 py-1 text-xs rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          onClick={() => setPendingDelete(null)}
                          disabled={isBusy}
                        >
                          Cancel
                        </button>
                        <button
                          className="px-2.5 py-1 text-xs rounded bg-destructive/90 hover:bg-destructive text-white transition-colors disabled:opacity-50"
                          onClick={() => handleConfirmDelete(row.display)}
                          disabled={isBusy}
                        >
                          {isBusy ? 'Removing…' : 'Remove'}
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-primary truncate">
                          #{row.display}
                        </span>
                        <span className="text-xs text-muted-foreground flex-1">
                          {row.count} note{row.count === 1 ? '' : 's'}
                        </span>
                        <button
                          className="px-2.5 py-1 text-xs rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={() => setPendingDelete(row.display)}
                          title={`Remove # from ${row.count} note(s)`}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-2.5 text-[11px] text-muted-foreground border-t border-border-subtle bg-muted/20">
          Deleting a tag strips the leading <code>#</code> from every
          occurrence — the word itself is preserved. Each modified note gets
          a snapshot in History so the change is reversible per file.
        </div>
      </div>
    </div>
  )
}

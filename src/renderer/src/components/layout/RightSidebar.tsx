import { useRef, useState, type ReactNode } from 'react'
import type { FileRelations } from '@shared/types/tags'
import type { FileHistory, SnapshotMeta } from '@shared/types/history'
import { AIChatSection, type AIChatSectionProps } from './AIChatSection'

// IDs used to persist section expand state globally (across files and
// across restarts). Keep string literals stable — renaming would lose
// the user's persisted preferences.
export const SECTION_DOCUMENT_INFO = 'document-info'
export const SECTION_RELATIONS = 'relations'
export const SECTION_HISTORY = 'history'
export const SECTION_AI_CHAT = 'ai-chat'

// Default render order. User reorderings are merged on top of this,
// with any unknown-to-the-user new sections appended at the end.
const DEFAULT_SECTION_ORDER = [
  SECTION_DOCUMENT_INFO,
  SECTION_RELATIONS,
  SECTION_HISTORY,
  SECTION_AI_CHAT
]

interface DocumentStats {
  wordCount: number
  characterCount: number
  readingTimeMinutes: number
  paragraphs: number
  sentences: number
}

interface RightSidebarProps {
  width: number
  isVisible: boolean
  stats: DocumentStats | null
  fileName?: string | null
  lastModified?: Date | null
  relations?: FileRelations | null
  onOpenFile?: (path: string) => void
  expandedRelations?: string[]
  onToggleRelationExpanded?: (tag: string) => void
  sectionsExpanded?: Record<string, boolean>
  onSetSectionExpanded?: (sectionId: string, expanded: boolean) => void
  sectionOrder?: string[]
  onSetSectionOrder?: (order: string[]) => void
  history?: FileHistory | null
  canSnapshot?: boolean
  onCreateSnapshot?: () => void
  onRestoreSnapshot?: (snapshotId: string) => void
  onDeleteSnapshot?: (snapshotId: string) => void
  chat?: AIChatSectionProps
}

export function RightSidebar({
  width,
  isVisible,
  stats,
  fileName,
  lastModified,
  relations,
  onOpenFile,
  expandedRelations,
  onToggleRelationExpanded,
  sectionsExpanded,
  onSetSectionExpanded,
  sectionOrder,
  onSetSectionOrder,
  history,
  canSnapshot,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  chat
}: RightSidebarProps) {
  // Drag state lives in a ref so the drop handler always sees the
  // current value regardless of React's render timing. We also stamp
  // the dragged id into dataTransfer so the drop is self-describing.
  const draggingIdRef = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  if (!isVisible) return null

  const expandedDefaults: Record<string, boolean> = {
    [SECTION_DOCUMENT_INFO]: false,
    [SECTION_RELATIONS]: true,
    [SECTION_HISTORY]: false,
    [SECTION_AI_CHAT]: false
  }

  // Build the list of sections the sidebar currently knows how to
  // render. AI Chat is conditional on `chat` being provided.
  const availableIds = [
    SECTION_DOCUMENT_INFO,
    SECTION_RELATIONS,
    SECTION_HISTORY,
    ...(chat ? [SECTION_AI_CHAT] : [])
  ]

  // Merge user order with defaults: keep persisted order, drop
  // unknown ids, append any new sections the user hasn't seen yet.
  const userOrder = (sectionOrder ?? []).filter((id) =>
    availableIds.includes(id)
  )
  const missing = availableIds.filter((id) => !userOrder.includes(id))
  const orderedIds =
    userOrder.length === 0
      ? DEFAULT_SECTION_ORDER.filter((id) => availableIds.includes(id))
      : [...userOrder, ...missing]

  const renderSection = (id: string): ReactNode => {
    const expanded = sectionsExpanded?.[id] ?? expandedDefaults[id] ?? false
    const common = {
      id,
      expanded,
      onToggle: onSetSectionExpanded,
      dragging: draggingId === id,
      isDropTarget: dropTargetId === id && draggingId !== id,
      onDragStart: () => {
        draggingIdRef.current = id
        setDraggingId(id)
      },
      onDragEnd: () => {
        draggingIdRef.current = null
        setDraggingId(null)
        setDropTargetId(null)
      },
      onDragEnter: () => {
        const src = draggingIdRef.current
        if (src && src !== id) setDropTargetId(id)
      },
      onDropHere: (draggedIdFromEvent?: string) => {
        const src = draggedIdFromEvent || draggingIdRef.current
        if (!src || src === id || !availableIds.includes(src)) return
        const next = orderedIds.filter((s) => s !== src)
        const targetIdx = next.indexOf(id)
        if (targetIdx < 0) return
        next.splice(targetIdx, 0, src)
        onSetSectionOrder?.(next)
        draggingIdRef.current = null
        setDraggingId(null)
        setDropTargetId(null)
      }
    }

    switch (id) {
      case SECTION_DOCUMENT_INFO:
        return (
          <CollapsibleSection key={id} title="Document Info" {...common}>
            <DocumentInfoBody
              stats={stats}
              fileName={fileName ?? null}
              lastModified={lastModified ?? null}
            />
          </CollapsibleSection>
        )
      case SECTION_RELATIONS:
        return (
          <CollapsibleSection key={id} title="Relations" {...common}>
            <RelationsBody
              relations={relations ?? null}
              onOpenFile={onOpenFile}
              expandedRelations={expandedRelations ?? []}
              onToggleRelationExpanded={onToggleRelationExpanded}
            />
          </CollapsibleSection>
        )
      case SECTION_HISTORY:
        return (
          <CollapsibleSection key={id} title="History" {...common}>
            <HistoryBody
              history={history ?? null}
              canSnapshot={canSnapshot ?? false}
              onCreateSnapshot={onCreateSnapshot}
              onRestoreSnapshot={onRestoreSnapshot}
              onDeleteSnapshot={onDeleteSnapshot}
            />
          </CollapsibleSection>
        )
      case SECTION_AI_CHAT:
        return chat ? (
          <CollapsibleSection key={id} title="AI Chat" {...common}>
            <AIChatSection {...chat} />
          </CollapsibleSection>
        ) : null
      default:
        return null
    }
  }

  // Delegated handler: figures out which section the cursor is over
  // by walking up the DOM. This catches drops that land on child
  // elements (like a button or another section's grip span) which
  // might not bubble the section-level drop handler reliably.
  const resolveSectionIdFromEvent = (target: EventTarget | null): string | null => {
    if (!(target instanceof HTMLElement)) return null
    const node = target.closest('[data-section-id]')
    return node?.getAttribute('data-section-id') ?? null
  }

  return (
    <aside
      className="flex flex-col border-l border-border-subtle overflow-hidden"
      style={{ width, background: 'var(--color-sidebar-alt)' }}
    >
      {/* Top spacer for title bar alignment */}
      <div className="pt-[52px] titlebar-drag-region">
        <div className="titlebar-no-drag" />
      </div>

      {/* Scrollable content area */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 space-y-5"
        onDragOver={(e) => {
          // Only preventDefault when we have a live reorder drag going,
          // otherwise we'd hijack unrelated drags (e.g. file drops on
          // the editor further down the tree).
          if (draggingIdRef.current) {
            e.preventDefault()
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
          }
        }}
        onDrop={(e) => {
          const draggedId =
            e.dataTransfer?.getData('text/plain') || draggingIdRef.current
          if (!draggedId) return
          const targetId = resolveSectionIdFromEvent(e.target)
          if (!targetId || targetId === draggedId) return
          e.preventDefault()
          const next = orderedIds.filter((s) => s !== draggedId)
          const targetIdx = next.indexOf(targetId)
          if (targetIdx < 0) return
          next.splice(targetIdx, 0, draggedId)
          onSetSectionOrder?.(next)
          draggingIdRef.current = null
          setDraggingId(null)
          setDropTargetId(null)
        }}
      >
        {orderedIds.map(renderSection)}
      </div>
    </aside>
  )
}

// --- CollapsibleSection ---------------------------------------------------

function CollapsibleSection({
  id,
  title,
  expanded,
  onToggle,
  dragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDropHere,
  children
}: {
  id: string
  title: string
  expanded: boolean
  onToggle?: (id: string, expanded: boolean) => void
  dragging?: boolean
  isDropTarget?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onDragEnter?: () => void
  onDropHere?: (draggedId?: string) => void
  children: ReactNode
}) {
  return (
    <section
      data-section-id={id}
      className={`rounded-lg border overflow-hidden transition-all ${
        isDropTarget ? 'border-primary' : 'border-border-subtle'
      } ${dragging ? 'opacity-40' : ''}`}
      style={{
        background: isDropTarget
          ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)'
          : 'color-mix(in srgb, var(--color-muted) 30%, transparent)'
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        onDragEnter?.()
      }}
      onDragOver={(e) => {
        // Required to allow drop.
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(e) => {
        e.preventDefault()
        const droppedId = e.dataTransfer?.getData('text/plain') || undefined
        onDropHere?.(droppedId)
      }}
    >
      <div className="w-full flex items-center gap-1 pr-3 hover:bg-sidebar-hover transition-colors">
        <span
          className="flex-shrink-0 pl-2 py-2 cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-muted-foreground"
          draggable
          onDragStart={(e) => {
            if (e.dataTransfer) {
              e.dataTransfer.effectAllowed = 'move'
              // Some browsers require data to be set for drag to fire.
              e.dataTransfer.setData('text/plain', id)
            }
            onDragStart?.()
          }}
          onDragEnd={() => onDragEnd?.()}
          title="Drag to reorder"
          aria-label="Drag to reorder section"
        >
          <svg
            width="10"
            height="14"
            viewBox="0 0 10 14"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="2.5" cy="2" r="1.2" />
            <circle cx="7.5" cy="2" r="1.2" />
            <circle cx="2.5" cy="7" r="1.2" />
            <circle cx="7.5" cy="7" r="1.2" />
            <circle cx="2.5" cy="12" r="1.2" />
            <circle cx="7.5" cy="12" r="1.2" />
          </svg>
        </span>
        <button
          className="flex-1 flex items-center justify-between py-2 pl-1"
          onClick={() => onToggle?.(id, !expanded)}
          aria-expanded={expanded}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            {title}
          </h2>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-muted-foreground transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
      {expanded && (
        <div className="px-3 pt-3 pb-3 border-t border-border-subtle">
          {children}
        </div>
      )}
    </section>
  )
}

// --- Document Info body ---------------------------------------------------

function DocumentInfoBody({
  stats,
  fileName,
  lastModified
}: {
  stats: DocumentStats | null
  fileName: string | null
  lastModified: Date | null
}) {
  if (!stats) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        Open a document to see stats.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {fileName && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
            File
          </h3>
          <p className="text-sm text-foreground truncate font-mono">
            {fileName}
          </p>
          {lastModified && (
            <p className="text-xs text-muted-foreground mt-1">
              Modified {formatRelativeTime(lastModified)}
            </p>
          )}
        </div>
      )}

      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
          Statistics
        </h3>
        <div className="space-y-1.5">
          <StatRow label="Words" value={formatNumber(stats.wordCount)} />
          <StatRow label="Characters" value={formatNumber(stats.characterCount)} />
          <StatRow label="Paragraphs" value={formatNumber(stats.paragraphs)} />
          <StatRow label="Sentences" value={formatNumber(stats.sentences)} />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
          Reading Time
        </h3>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-foreground font-mono">
            {stats.readingTimeMinutes}
          </span>
          <span className="text-sm text-muted-foreground">
            {stats.readingTimeMinutes === 1 ? 'minute' : 'minutes'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Based on 200 wpm average
        </p>
      </div>
    </div>
  )
}

// --- Relations body -------------------------------------------------------

function RelationsBody({
  relations,
  onOpenFile,
  expandedRelations,
  onToggleRelationExpanded
}: {
  relations: FileRelations | null
  onOpenFile?: (path: string) => void
  expandedRelations: string[]
  onToggleRelationExpanded?: (tag: string) => void
}) {
  if (!relations) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        Open a document to see its relations.
      </p>
    )
  }

  if (relations.tags.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        Add <code className="text-[0.9em]">#tag</code> anywhere in this note
        to see related documents.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {relations.tags.map((tagInfo) => (
        <TagRelationGroup
          key={tagInfo.tag}
          tag={tagInfo.tag}
          taggedIn={tagInfo.taggedIn}
          mentionedIn={tagInfo.mentionedIn}
          onOpenFile={onOpenFile}
          expanded={expandedRelations.includes(tagInfo.tag)}
          onToggle={onToggleRelationExpanded}
        />
      ))}
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground font-mono tabular-nums">{value}</span>
    </div>
  )
}

function TagRelationGroup({
  tag,
  taggedIn,
  mentionedIn,
  onOpenFile,
  expanded,
  onToggle
}: {
  tag: string
  taggedIn: string[]
  mentionedIn: string[]
  onOpenFile?: (path: string) => void
  expanded: boolean
  onToggle?: (tag: string) => void
}) {
  const total = taggedIn.length + mentionedIn.length

  return (
    <div className="border border-border-subtle rounded-md">
      <button
        className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-sidebar-hover rounded-md transition-colors"
        onClick={() => onToggle?.(tag)}
      >
        <span className="flex items-center gap-2 min-w-0">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-muted-foreground flex-shrink-0 transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span
            className="text-sm font-medium truncate"
            style={{ color: 'var(--color-primary)' }}
          >
            #{tag}
          </span>
        </span>
        <span className="text-xs text-muted-foreground font-mono tabular-nums pl-2">
          {total}
        </span>
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-2">
          {taggedIn.length > 0 && (
            <RelationList
              label="Also tagged"
              files={taggedIn}
              onOpenFile={onOpenFile}
            />
          )}
          {mentionedIn.length > 0 && (
            <RelationList
              label="Mentioned"
              files={mentionedIn}
              onOpenFile={onOpenFile}
            />
          )}
          {total === 0 && (
            <p className="text-xs text-muted-foreground px-1">
              No other documents yet.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function RelationList({
  label,
  files,
  onOpenFile
}: {
  label: string
  files: string[]
  onOpenFile?: (path: string) => void
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground/70 px-1 py-1">
        {label}
      </div>
      <ul className="space-y-0.5">
        {files.map((path) => (
          <li key={path}>
            <button
              className="w-full text-left text-sm text-foreground/90 hover:text-foreground hover:bg-sidebar-hover rounded px-1.5 py-1 truncate transition-colors"
              onClick={() => onOpenFile?.(path)}
              title={path}
            >
              {fileDisplayName(path)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function fileDisplayName(absPath: string): string {
  const name = absPath.substring(absPath.lastIndexOf('/') + 1)
  return name.replace(/\.md$/, '')
}

function formatNumber(num: number): string {
  return num.toLocaleString()
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

// --- History body ---------------------------------------------------------

function HistoryBody({
  history,
  canSnapshot,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot
}: {
  history: FileHistory | null
  canSnapshot: boolean
  onCreateSnapshot?: () => void
  onRestoreSnapshot?: (snapshotId: string) => void
  onDeleteSnapshot?: (snapshotId: string) => void
}) {
  const snapshots = history?.snapshots ?? []

  return (
    <div className="space-y-2">
      <button
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        style={{
          background: canSnapshot
            ? 'color-mix(in srgb, var(--color-primary) 18%, transparent)'
            : 'var(--color-muted)',
          color: canSnapshot ? 'var(--color-primary)' : 'var(--color-muted-foreground)'
        }}
        onClick={onCreateSnapshot}
        disabled={!canSnapshot}
        title={canSnapshot ? 'Save a snapshot of the current file' : 'Open a file first'}
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
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="12" cy="12" r="3" />
          <path d="M8 4V2M16 4V2" />
        </svg>
        Save snapshot
      </button>

      {snapshots.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No snapshots yet. Click "Save snapshot" to mark a version you
          can return to.
        </p>
      ) : (
        <ul className="space-y-1">
          {snapshots.map((snap) => (
            <SnapshotRow
              key={snap.id}
              snapshot={snap}
              onRestore={() => onRestoreSnapshot?.(snap.id)}
              onDelete={() => onDeleteSnapshot?.(snap.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function SnapshotRow({
  snapshot,
  onRestore,
  onDelete
}: {
  snapshot: SnapshotMeta
  onRestore?: () => void
  onDelete?: () => void
}) {
  const date = new Date(snapshot.timestamp)
  return (
    <li className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-sidebar-hover transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground/90 truncate font-mono">
          {formatSnapshotDate(date)}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatRelativeTime(date)} · {formatBytes(snapshot.size)}
        </div>
      </div>
      <button
        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-60 group-hover:opacity-100 transition-opacity"
        onClick={onRestore}
        title="Restore this snapshot"
        aria-label="Restore snapshot"
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
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>
      <button
        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted opacity-60 group-hover:opacity-100 transition-opacity"
        onClick={onDelete}
        title="Delete this snapshot"
        aria-label="Delete snapshot"
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
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        </svg>
      </button>
    </li>
  )
}

function formatSnapshotDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${h}:${m}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

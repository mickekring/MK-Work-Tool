import type { ReactNode } from 'react'
import type { FileRelations } from '@shared/types/tags'

// IDs used to persist section expand state globally (across files and
// across restarts). Keep string literals stable — renaming would lose
// the user's persisted preferences.
export const SECTION_DOCUMENT_INFO = 'document-info'
export const SECTION_RELATIONS = 'relations'

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
  onSetSectionExpanded
}: RightSidebarProps) {
  if (!isVisible) return null

  const infoExpanded =
    sectionsExpanded?.[SECTION_DOCUMENT_INFO] ?? false // default collapsed
  const relationsExpanded =
    sectionsExpanded?.[SECTION_RELATIONS] ?? true // default expanded

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
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        <CollapsibleSection
          id={SECTION_DOCUMENT_INFO}
          title="Document Info"
          expanded={infoExpanded}
          onToggle={onSetSectionExpanded}
        >
          <DocumentInfoBody
            stats={stats}
            fileName={fileName ?? null}
            lastModified={lastModified ?? null}
          />
        </CollapsibleSection>

        <CollapsibleSection
          id={SECTION_RELATIONS}
          title="Relations"
          expanded={relationsExpanded}
          onToggle={onSetSectionExpanded}
        >
          <RelationsBody
            relations={relations ?? null}
            onOpenFile={onOpenFile}
            expandedRelations={expandedRelations ?? []}
            onToggleRelationExpanded={onToggleRelationExpanded}
          />
        </CollapsibleSection>
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
  children
}: {
  id: string
  title: string
  expanded: boolean
  onToggle?: (id: string, expanded: boolean) => void
  children: ReactNode
}) {
  return (
    <section className="rounded-md">
      <button
        className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-sidebar-hover transition-colors"
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
      {expanded && <div className="px-2 pt-2 pb-1">{children}</div>}
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
          <h3 className="text-[11px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
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
        <h3 className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">
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
        <h3 className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">
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
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-1 py-1">
        {label}
      </div>
      <ul className="space-y-0.5">
        {files.map((path) => (
          <li key={path}>
            <button
              className="w-full text-left text-xs text-foreground/90 hover:text-foreground hover:bg-sidebar-hover rounded px-1.5 py-1 truncate transition-colors"
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

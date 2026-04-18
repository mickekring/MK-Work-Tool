import { useState } from 'react'
import type { FileRelations } from '@shared/types/tags'

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
}

export function RightSidebar({
  width,
  isVisible,
  stats,
  fileName,
  lastModified,
  relations,
  onOpenFile
}: RightSidebarProps) {
  if (!isVisible) return null

  return (
    <aside
      className="flex flex-col border-l border-border-subtle overflow-hidden"
      style={{ width, background: 'var(--color-sidebar-alt)' }}
    >
      {/* Header spacer for title bar alignment */}
      <div className="pt-[52px] px-4 pb-3 titlebar-drag-region">
        <div className="titlebar-no-drag">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Document Info
          </h2>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border-subtle mx-3" />

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Relations (tags + related files) */}
        <RelationsSection relations={relations ?? null} onOpenFile={onOpenFile} />

        {stats ? (
          <div className="space-y-6 mt-6">
            {/* File info */}
            {fileName && (
              <section>
                <h3 className="text-xs font-medium text-muted-foreground mb-2">
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
              </section>
            )}

            {/* Statistics */}
            <section>
              <h3 className="text-xs font-medium text-muted-foreground mb-3">
                Statistics
              </h3>
              <div className="space-y-2">
                <StatRow label="Words" value={formatNumber(stats.wordCount)} />
                <StatRow label="Characters" value={formatNumber(stats.characterCount)} />
                <StatRow label="Paragraphs" value={formatNumber(stats.paragraphs)} />
                <StatRow label="Sentences" value={formatNumber(stats.sentences)} />
              </div>
            </section>

            {/* Reading time */}
            <section>
              <h3 className="text-xs font-medium text-muted-foreground mb-3">
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
            </section>
          </div>
        ) : (
          <div className="py-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-muted flex items-center justify-center">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-muted-foreground"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
            </div>
            <p className="text-sm text-muted-foreground">
              Open a document to see stats
            </p>
          </div>
        )}
      </div>
    </aside>
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

function RelationsSection({
  relations,
  onOpenFile
}: {
  relations: FileRelations | null
  onOpenFile?: (path: string) => void
}) {
  if (!relations) return null

  return (
    <section>
      <h3 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
        Relations
      </h3>
      {relations.tags.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add <code className="text-[0.9em]">#tag</code> anywhere in this note
          to see related documents.
        </p>
      ) : (
        <div className="space-y-3">
          {relations.tags.map((tagInfo) => (
            <TagRelationGroup
              key={tagInfo.tag}
              tag={tagInfo.tag}
              taggedIn={tagInfo.taggedIn}
              mentionedIn={tagInfo.mentionedIn}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function TagRelationGroup({
  tag,
  taggedIn,
  mentionedIn,
  onOpenFile
}: {
  tag: string
  taggedIn: string[]
  mentionedIn: string[]
  onOpenFile?: (path: string) => void
}) {
  const total = taggedIn.length + mentionedIn.length
  const [expanded, setExpanded] = useState(total > 0 && total <= 10)

  return (
    <div className="border border-border-subtle rounded-md">
      <button
        className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-sidebar-hover rounded-md transition-colors"
        onClick={() => setExpanded((e) => !e)}
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

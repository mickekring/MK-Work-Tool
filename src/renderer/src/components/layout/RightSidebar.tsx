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
}

export function RightSidebar({
  width,
  isVisible,
  stats,
  fileName,
  lastModified
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

      {/* Stats content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {stats ? (
          <div className="space-y-6">
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

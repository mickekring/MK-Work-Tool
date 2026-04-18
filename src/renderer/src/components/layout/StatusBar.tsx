interface StatusBarProps {
  filePath: string | null
  isDirty: boolean
  isSaving: boolean
  cursorLine: number
  cursorColumn: number
  theme: 'dark' | 'light'
  onThemeToggle: () => void
  leftSidebarVisible: boolean
  rightSidebarVisible: boolean
  onToggleLeftSidebar: () => void
  onToggleRightSidebar: () => void
}

export function StatusBar({
  filePath,
  isDirty,
  isSaving,
  cursorLine,
  cursorColumn,
  theme,
  onThemeToggle,
  leftSidebarVisible,
  rightSidebarVisible,
  onToggleLeftSidebar,
  onToggleRightSidebar
}: StatusBarProps) {
  return (
    <div className="h-6 bg-sidebar border-t border-border-subtle flex items-center justify-between px-2 text-xs">
      {/* Left section - sidebar toggle + file path */}
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <button
          className="btn-ghost flex items-center justify-center p-0.5"
          onClick={onToggleLeftSidebar}
          title={leftSidebarVisible ? 'Hide left sidebar' : 'Show left sidebar'}
          aria-label={leftSidebarVisible ? 'Hide left sidebar' : 'Show left sidebar'}
        >
          <PanelLeftIcon active={leftSidebarVisible} />
        </button>
        {filePath ? (
          <span className="text-muted-foreground truncate font-mono pl-1">
            {formatPath(filePath)}
          </span>
        ) : (
          <span className="text-muted-foreground pl-1">No file open</span>
        )}
      </div>

      {/* Center section - save status */}
      <div className="flex items-center gap-1.5 px-4">
        {isSaving ? (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning animate-pulse-subtle" />
            <span className="text-muted-foreground">Saving...</span>
          </>
        ) : isDirty ? (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning" />
            <span className="text-muted-foreground">Unsaved</span>
          </>
        ) : filePath ? (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
            <span className="text-muted-foreground">Saved</span>
          </>
        ) : null}
      </div>

      {/* Right section - cursor position, theme toggle, right sidebar toggle */}
      <div className="flex items-center gap-2">
        {filePath && (
          <span className="text-muted-foreground font-mono tabular-nums">
            Ln {cursorLine}, Col {cursorColumn}
          </span>
        )}

        <button
          className="btn-ghost flex items-center gap-1.5 py-0.5"
          onClick={onThemeToggle}
        >
          {theme === 'dark' ? (
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
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
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
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>

        <button
          className="btn-ghost flex items-center justify-center p-0.5"
          onClick={onToggleRightSidebar}
          title={rightSidebarVisible ? 'Hide right sidebar' : 'Show right sidebar'}
          aria-label={rightSidebarVisible ? 'Hide right sidebar' : 'Show right sidebar'}
        >
          <PanelRightIcon active={rightSidebarVisible} />
        </button>
      </div>
    </div>
  )
}

function PanelLeftIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: active ? 1 : 0.55 }}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      {active && <rect x="3.5" y="3.5" width="5.5" height="17" rx="1.5" fill="currentColor" opacity="0.35" stroke="none" />}
    </svg>
  )
}

function PanelRightIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: active ? 1 : 0.55 }}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
      {active && <rect x="15" y="3.5" width="5.5" height="17" rx="1.5" fill="currentColor" opacity="0.35" stroke="none" />}
    </svg>
  )
}

function formatPath(path: string): string {
  // Show just the filename and parent folder
  const parts = path.split('/')
  if (parts.length <= 2) return path
  return parts.slice(-2).join('/')
}

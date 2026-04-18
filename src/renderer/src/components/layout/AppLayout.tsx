import { useState, useCallback, useEffect, type ReactNode } from 'react'
import {
  useStore,
  useStoreActions,
  useFileRelations,
  useFileHistory
} from '@/hooks/useStore'
import { useChat, useOllamaModels } from '@/hooks/useChat'
import { fontSizeValues } from '@shared/types/store'
import { LeftSidebar } from './LeftSidebar'
import { RightSidebar } from './RightSidebar'
import { StatusBar } from './StatusBar'
import { ResizeHandle } from './ResizeHandle'
import { SettingsModal } from '../modals/SettingsModal'

interface AppLayoutProps {
  children: ReactNode
  onFileSelect?: (path: string) => void
  onNewFile?: (path: string) => void
  onNewFolder?: (path: string) => void
  onDeleteFile?: (path: string) => Promise<boolean>
  onDeleteFolder?: (path: string) => Promise<boolean>
  onRename?: (oldPath: string, newPath: string) => Promise<boolean>
  onMove?: (oldPath: string, newPath: string) => Promise<boolean>
  onRefresh?: () => void
  selectedFile?: string | null
  isDirty?: boolean
  isSaving?: boolean
  cursorLine?: number
  cursorColumn?: number
  documentStats?: {
    wordCount: number
    characterCount: number
    readingTimeMinutes: number
    paragraphs: number
    sentences: number
  } | null
  onSnapshotCurrent?: () => void
  onRestoreSnapshot?: (snapshotId: string) => void
  onDeleteSnapshot?: (snapshotId: string) => void
  documentContent?: string
}

export function AppLayout({
  children,
  onFileSelect,
  onNewFile,
  onNewFolder,
  onDeleteFile,
  onDeleteFolder,
  onRename,
  onMove,
  onRefresh,
  selectedFile,
  isDirty = false,
  isSaving = false,
  cursorLine = 1,
  cursorColumn = 1,
  documentStats = null,
  onSnapshotCurrent,
  onRestoreSnapshot,
  onDeleteSnapshot,
  documentContent = ''
}: AppLayoutProps) {
  const { settings, ui, fileTree, isLoading } = useStore()
  const {
    setTheme,
    setSidebarWidth,
    toggleFolderExpanded,
    toggleLeftSidebar,
    toggleRightSidebar,
    toggleRelationExpanded,
    setSectionExpanded,
    setAIModel
  } = useStoreActions()

  const relations = useFileRelations(selectedFile ?? null)
  const history = useFileHistory(selectedFile ?? null)
  const [showSettings, setShowSettings] = useState(false)
  const openSettings = useCallback(() => setShowSettings(true), [])

  // AI chat — model list + per-file chat session
  const { models: ollamaModels, error: ollamaError } = useOllamaModels()
  const chat = useChat({
    filePath: selectedFile ?? null,
    model: settings.ai.model,
    systemPromptTemplate: settings.ai.systemPrompt,
    documentText: documentContent
  })

  // Local state for immediate resize feedback. Keeps a local mirror so
  // dragging feels instant, but re-syncs whenever the store reports a
  // new value (notably after the initial IPC hydration on reload).
  const [leftWidth, setLeftWidth] = useState(ui.leftSidebarWidth)
  const [rightWidth, setRightWidth] = useState(ui.rightSidebarWidth)

  useEffect(() => {
    setLeftWidth(ui.leftSidebarWidth)
  }, [ui.leftSidebarWidth])

  useEffect(() => {
    setRightWidth(ui.rightSidebarWidth)
  }, [ui.rightSidebarWidth])

  // Handle resize with debounced persistence
  const handleLeftResize = useCallback(
    (width: number) => {
      setLeftWidth(width)
      setSidebarWidth('left', width)
    },
    [setSidebarWidth]
  )

  const handleRightResize = useCallback(
    (width: number) => {
      setRightWidth(width)
      setSidebarWidth('right', width)
    },
    [setSidebarWidth]
  )

  // Extract vault name from path
  const vaultName = settings.vaultPath
    ? settings.vaultPath.split('/').pop() || null
    : null

  // Extract file name
  const fileName = selectedFile ? selectedFile.split('/').pop() || null : null

  // Theme toggle
  const handleThemeToggle = useCallback(() => {
    const newTheme = settings.theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
    document.documentElement.classList.toggle('light', newTheme === 'light')
  }, [settings.theme, setTheme])

  // Apply accent color and font size to CSS variables
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--color-accent', settings.accentColor)
    root.style.setProperty('--color-primary', settings.accentColor)
    const fontSizePx = fontSizeValues[settings.fontSize] || 16
    root.style.setProperty('--font-size-base', `${fontSizePx}px`)
    root.style.setProperty('--editor-font-size', `${fontSizePx}px`)
    // Set font-size directly on html element so all rem-based sizing scales
    root.style.fontSize = `${fontSizePx}px`
  }, [settings.accentColor, settings.fontSize])

  // Apply theme class on initial load
  useEffect(() => {
    document.documentElement.classList.toggle('light', settings.theme === 'light')
  }, [settings.theme])

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse-subtle">
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div
      className={`h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden ${settings.theme === 'light' ? 'light' : ''}`}
    >
      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <LeftSidebar
          width={leftWidth}
          isVisible={ui.leftSidebarVisible}
          vaultName={vaultName}
          vaultPath={settings.vaultPath}
          fileTree={fileTree}
          onFileSelect={onFileSelect}
          onNewFile={onNewFile}
          onNewFolder={onNewFolder}
          onDeleteFile={onDeleteFile}
          onDeleteFolder={onDeleteFolder}
          onRename={onRename}
          onMove={onMove}
          onRefresh={onRefresh}
          selectedFile={selectedFile}
          expandedFolders={ui.expandedFolders}
          onToggleFolderExpanded={toggleFolderExpanded}
          onOpenSettings={openSettings}
        />

        {/* Left resize handle */}
        {ui.leftSidebarVisible && (
          <ResizeHandle
            side="left"
            onResize={handleLeftResize}
            currentWidth={leftWidth}
            minWidth={200}
            maxWidth={400}
          />
        )}

        {/* Main editor area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-background">
          {/* Title bar drag region */}
          <div className="h-[52px] titlebar-drag-region flex-shrink-0" />

          {/* Editor content */}
          <div className="flex-1 overflow-hidden">{children}</div>
        </main>

        {/* Right resize handle */}
        {ui.rightSidebarVisible && (
          <ResizeHandle
            side="right"
            onResize={handleRightResize}
            currentWidth={rightWidth}
            minWidth={200}
            maxWidth={400}
          />
        )}

        {/* Right sidebar */}
        <RightSidebar
          width={rightWidth}
          isVisible={ui.rightSidebarVisible}
          stats={documentStats}
          fileName={fileName}
          lastModified={null}
          relations={relations}
          onOpenFile={onFileSelect}
          expandedRelations={
            selectedFile ? ui.expandedRelations?.[selectedFile] ?? [] : []
          }
          onToggleRelationExpanded={(tag) => {
            if (selectedFile) toggleRelationExpanded(selectedFile, tag)
          }}
          sectionsExpanded={ui.sectionsExpanded}
          onSetSectionExpanded={setSectionExpanded}
          history={history}
          canSnapshot={!!selectedFile}
          onCreateSnapshot={onSnapshotCurrent}
          onRestoreSnapshot={onRestoreSnapshot}
          onDeleteSnapshot={onDeleteSnapshot}
          chat={{
            model: settings.ai.model,
            availableModels: ollamaModels.map((m) => m.name),
            modelError: ollamaError,
            onChangeModel: (next) => setAIModel(next || null),
            onOpenSettings: openSettings,
            messages: chat.messages,
            isStreaming: chat.isStreaming,
            onSend: chat.sendMessage,
            onAbort: chat.abort,
            onClear: chat.clear,
            canSend: !!selectedFile && !!settings.ai.model && !chat.isStreaming
          }}
        />
      </div>

      {/* Status bar */}
      <StatusBar
        filePath={selectedFile ?? null}
        isDirty={isDirty}
        isSaving={isSaving}
        cursorLine={cursorLine}
        cursorColumn={cursorColumn}
        theme={settings.theme}
        onThemeToggle={handleThemeToggle}
        leftSidebarVisible={ui.leftSidebarVisible}
        rightSidebarVisible={ui.rightSidebarVisible}
        onToggleLeftSidebar={toggleLeftSidebar}
        onToggleRightSidebar={toggleRightSidebar}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  )
}

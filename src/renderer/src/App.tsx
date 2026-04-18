import React, { useState, useCallback, useEffect, useRef } from 'react'
import { AppLayout } from '@/components/layout'
import { MarkdownEditor, type MarkdownEditorHandle } from '@/components/editor/MarkdownEditor'
import { WelcomeModal } from '@/components/modals/WelcomeModal'
import { EditableTitle } from '@/components/editor/EditableTitle'
import { useStore, useFileOperations, useHistoryActions } from '@/hooks/useStore'
import { ConfirmModal } from '@/components/modals/ConfirmModal'

function App(): React.JSX.Element {
  const { settings, isLoading } = useStore()
  const {
    readFile,
    writeFile,
    createFile,
    deleteFile,
    renameFile,
    createFolder,
    deleteFolder,
    selectVault,
    openVault,
    initVault,
    saveAttachment
  } = useFileOperations()
  const { createSnapshot, restoreSnapshot, deleteSnapshot } = useHistoryActions()

  // Editor state
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [cursorLine, setCursorLine] = useState(1)
  const [cursorColumn, setCursorColumn] = useState(1)
  const [restorePending, setRestorePending] = useState<{
    snapshotId: string
  } | null>(null)

  // Refs for latest values (to avoid stale closures)
  const contentRef = useRef(content)
  const currentFileRef = useRef(currentFile)
  const isDirtyRef = useRef(isDirty)
  const editorRef = useRef<MarkdownEditorHandle>(null)

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    currentFileRef.current = currentFile
  }, [currentFile])

  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  // Load file tree on startup if vault path exists
  useEffect(() => {
    if (!isLoading && settings.vaultPath) {
      openVault(settings.vaultPath)
    }
  }, [isLoading, settings.vaultPath, openVault])

  // Handle file selection from sidebar - save current file first if dirty
  const handleFileSelect = useCallback(
    async (path: string) => {
      try {
        // Wait a tick to ensure any pending keystrokes are processed
        await new Promise(resolve => setTimeout(resolve, 0))

        // Save current file first if dirty - read directly from CodeMirror to get latest content
        if (currentFileRef.current && isDirtyRef.current) {
          const latestContent = editorRef.current?.getValue() ?? contentRef.current
          await writeFile(currentFileRef.current, latestContent)
        }

        const fileContent = await readFile(path)
        // Update refs immediately (sync)
        currentFileRef.current = path
        contentRef.current = fileContent
        isDirtyRef.current = false
        // Then update state
        setCurrentFile(path)
        setContent(fileContent)
        setIsDirty(false)
      } catch (error) {
        console.error('Failed to read file:', error)
      }
    },
    [readFile, writeFile]
  )

  // Handle content changes - update refs immediately for sync access
  const handleContentChange = useCallback((newContent: string) => {
    contentRef.current = newContent // Update ref immediately (sync)
    isDirtyRef.current = true       // Update ref immediately (sync)
    setContent(newContent)
    setIsDirty(true)
  }, [])

  // Handle cursor position changes
  const handleCursorChange = useCallback((line: number, column: number) => {
    setCursorLine(line)
    setCursorColumn(column)
  }, [])

  // Handle save — read everything from refs so the callback is stable and
  // can never capture stale `isDirty` / `content`. Fixes a bug where the
  // first keystroke after a save was never auto-saved because the debounce
  // timer's closure held the pre-dirty `handleSave`.
  const handleSave = useCallback(async () => {
    const path = currentFileRef.current
    if (!path || !isDirtyRef.current) return

    const latestContent =
      editorRef.current?.getValue() ?? contentRef.current

    setIsSaving(true)
    try {
      await writeFile(path, latestContent)
      isDirtyRef.current = false
      setIsDirty(false)
    } catch (error) {
      console.error('Failed to save file:', error)
    } finally {
      setIsSaving(false)
    }
  }, [writeFile])

  // Handle vault selection
  const handleVaultSelected = useCallback(
    async (path: string) => {
      // Initialize vault structure (creates default folders if needed)
      await initVault(path)
      // Open the vault (loads file tree)
      await openVault(path)
    },
    [initVault, openVault]
  )

  // Handle new file creation
  const handleNewFile = useCallback(
    async (path: string) => {
      const frontmatter = `---
title: Untitled
created: ${new Date().toISOString()}
---

`
      try {
        await createFile(path, frontmatter)
        // Refresh the vault to show new file
        if (settings.vaultPath) {
          await openVault(settings.vaultPath)
        }
        // Open the new file
        setCurrentFile(path)
        setContent(frontmatter)
        setIsDirty(false)
      } catch (error) {
        console.error('Failed to create file:', error)
      }
    },
    [createFile, openVault, settings.vaultPath]
  )

  // Handle new folder creation
  const handleNewFolder = useCallback(
    async (path: string) => {
      try {
        await createFolder(path)
        // Refresh the vault to show new folder
        if (settings.vaultPath) {
          await openVault(settings.vaultPath)
        }
      } catch (error) {
        console.error('Failed to create folder:', error)
      }
    },
    [createFolder, openVault, settings.vaultPath]
  )

  // Handle file deletion
  const handleDeleteFile = useCallback(
    async (path: string) => {
      try {
        const success = await deleteFile(path)
        if (success) {
          // Clear editor if the deleted file was open
          if (currentFile === path) {
            setCurrentFile(null)
            setContent('')
            setIsDirty(false)
          }
        }
        return success
      } catch (error) {
        console.error('Failed to delete file:', error)
        return false
      }
    },
    [deleteFile, currentFile]
  )

  // Handle folder deletion
  const handleDeleteFolder = useCallback(
    async (path: string) => {
      try {
        const success = await deleteFolder(path)
        if (success && currentFile?.startsWith(path)) {
          // Clear editor if the current file was in the deleted folder
          setCurrentFile(null)
          setContent('')
          setIsDirty(false)
        }
        return success
      } catch (error) {
        console.error('Failed to delete folder:', error)
        return false
      }
    },
    [deleteFolder, currentFile]
  )

  // Handle file/folder rename
  const handleRename = useCallback(
    async (oldPath: string, newPath: string) => {
      try {
        const success = await renameFile(oldPath, newPath)
        if (success && currentFile) {
          // If the open file (or a folder containing it) was moved, remap
          // the current file path to the new location so it stays open.
          if (currentFile === oldPath) {
            setCurrentFile(newPath)
            currentFileRef.current = newPath
          } else if (currentFile.startsWith(`${oldPath}/`)) {
            const remapped = newPath + currentFile.slice(oldPath.length)
            setCurrentFile(remapped)
            currentFileRef.current = remapped
          }
        }
        return success
      } catch (error) {
        console.error('Failed to rename:', error)
        return false
      }
    },
    [renameFile, currentFile]
  )

  // Handle file move (drag & drop)
  const handleMove = useCallback(
    async (oldPath: string, newPath: string) => {
      return handleRename(oldPath, newPath)
    },
    [handleRename]
  )

  // Snapshot the currently open file. Flushes pending changes to disk
  // first (via handleSave) so the snapshot reflects what the user sees.
  const handleSnapshot = useCallback(async () => {
    const path = currentFileRef.current
    if (!path) return
    try {
      if (isDirtyRef.current) {
        const latest = editorRef.current?.getValue() ?? contentRef.current
        await writeFile(path, latest)
        isDirtyRef.current = false
        setIsDirty(false)
      }
      await createSnapshot(path)
    } catch (error) {
      console.error('Failed to create snapshot:', error)
    }
  }, [createSnapshot, writeFile])

  // Called when the user clicks the rewind icon on a snapshot row.
  // Opens a confirmation modal; the actual restore runs in
  // confirmRestoreSnapshot below.
  const handleRequestRestore = useCallback((snapshotId: string) => {
    setRestorePending({ snapshotId })
  }, [])

  const confirmRestoreSnapshot = useCallback(async () => {
    if (!restorePending || !currentFile) {
      setRestorePending(null)
      return
    }
    try {
      const result = await restoreSnapshot(currentFile, restorePending.snapshotId)
      if (result) {
        // Replace in-memory content with the restored text so the editor
        // re-renders from the new initialValue.
        contentRef.current = result.content
        isDirtyRef.current = false
        setContent(result.content)
        setIsDirty(false)
      }
    } catch (error) {
      console.error('Failed to restore snapshot:', error)
    } finally {
      setRestorePending(null)
    }
  }, [restorePending, currentFile, restoreSnapshot])

  const handleDeleteSnapshot = useCallback(
    async (snapshotId: string) => {
      if (!currentFile) return
      try {
        await deleteSnapshot(currentFile, snapshotId)
      } catch (error) {
        console.error('Failed to delete snapshot:', error)
      }
    },
    [currentFile, deleteSnapshot]
  )

  // Refresh vault
  const handleRefresh = useCallback(async () => {
    if (settings.vaultPath) {
      await openVault(settings.vaultPath)
    }
  }, [openVault, settings.vaultPath])

  // Handle title change (rename file)
  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      if (!currentFile) return

      const parentPath = currentFile.substring(0, currentFile.lastIndexOf('/'))
      const newPath = `${parentPath}/${newTitle}.md`

      if (newPath !== currentFile) {
        const success = await handleRename(currentFile, newPath)
        if (success) {
          await handleRefresh()
        }
      }
    },
    [currentFile, handleRename, handleRefresh]
  )

  // Get current file title (without extension)
  const currentTitle = currentFile
    ? currentFile.substring(currentFile.lastIndexOf('/') + 1).replace(/\.md$/, '')
    : null

  // Calculate document stats
  const documentStats = content
    ? {
        wordCount: countWords(content),
        characterCount: content.length,
        readingTimeMinutes: Math.max(1, Math.ceil(countWords(content) / 200)),
        paragraphs: countParagraphs(content),
        sentences: countSentences(content)
      }
    : null

  // Show welcome modal if no vault is selected
  const showWelcomeModal = !isLoading && !settings.vaultPath

  return (
    <>
      <AppLayout
        onFileSelect={handleFileSelect}
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
        onDeleteFile={handleDeleteFile}
        onDeleteFolder={handleDeleteFolder}
        onRename={handleRename}
        onMove={handleMove}
        onRefresh={handleRefresh}
        selectedFile={currentFile}
        isDirty={isDirty}
        isSaving={isSaving}
        cursorLine={cursorLine}
        cursorColumn={cursorColumn}
        documentStats={documentStats}
        onSnapshotCurrent={handleSnapshot}
        onRestoreSnapshot={handleRequestRestore}
        onDeleteSnapshot={handleDeleteSnapshot}
        documentContent={content}
      >
        {/* Main editor area content */}
        {currentFile ? (
          <div className="h-full flex flex-col overflow-hidden">
            {/* Editable title */}
            <div className="flex-shrink-0 max-w-4xl mx-auto w-full px-10">
              <EditableTitle value={currentTitle ?? ''} onChange={handleTitleChange} />
            </div>
            {/* Editor */}
            <div className="flex-1 max-w-4xl mx-auto w-full overflow-hidden">
              <MarkdownEditor
                ref={editorRef}
                value={content}
                onChange={handleContentChange}
                onCursorChange={handleCursorChange}
                onSave={handleSave}
                onDropFile={saveAttachment}
              />
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md px-6">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-muted flex items-center justify-center">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-muted-foreground"
                >
                  <path d="M12 19l7-7 3 3-7 7-3-3z" />
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                  <path d="M2 2l7.586 7.586" />
                  <circle cx="11" cy="11" r="2" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold mb-3 text-foreground">
                {settings.vaultPath ? 'Ready to Write' : 'Welcome to Arbetsyta'}
              </h1>
              <p className="text-muted-foreground mb-6">
                {settings.vaultPath
                  ? 'Select a file from the sidebar to start editing, or create a new note.'
                  : 'Select a vault to get started with your workspace.'}
              </p>

              {!settings.vaultPath && (
                <button
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-accent-muted transition-colors"
                  onClick={async () => {
                    const path = await selectVault()
                    if (path) {
                      await handleVaultSelected(path)
                    }
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  Select Vault
                </button>
              )}
            </div>
          </div>
        )}
      </AppLayout>

      {/* Welcome modal for first-time users */}
      <WelcomeModal
        isOpen={showWelcomeModal}
        onSelectVault={selectVault}
        onVaultSelected={handleVaultSelected}
      />

      {/* Snapshot restore confirmation */}
      <ConfirmModal
        isOpen={restorePending !== null}
        title="Restore snapshot"
        message="This will replace the current file content with the snapshot. Your latest edits will be overwritten — save a snapshot first if you want to keep them."
        confirmLabel="Restore"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={confirmRestoreSnapshot}
        onCancel={() => setRestorePending(null)}
      />
    </>
  )
}

// Utility functions for document stats
function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length
}

function countParagraphs(text: string): number {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0).length
}

function countSentences(text: string): number {
  return (text.match(/[.!?]+/g) || []).length
}

export default App

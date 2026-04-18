import { useEffect, useCallback, useRef, forwardRef, useImperativeHandle, useState } from 'react'
import { useCodeMirror } from '@/editor/useCodeMirror'

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.avif'
])

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  onCursorChange?: (line: number, column: number) => void
  onSave?: () => void
  onDropFile?: (sourcePath: string) => Promise<{
    filename: string
    relativePath: string
  } | null>
  placeholder?: string
  readOnly?: boolean
  autoFocus?: boolean
}

export interface MarkdownEditorHandle {
  getValue: () => string
  focus: () => void
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor({
  value,
  onChange,
  onCursorChange,
  onSave,
  onDropFile,
  placeholder = 'Start writing...',
  readOnly = false,
  autoFocus = true
}, ref) {
  const [isDragOver, setIsDragOver] = useState(false)
  const onSaveRef = useRef(onSave)

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Debounced auto-save. Reads the latest onSave from the ref so the
  // closure here can never go stale.
  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue)

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      saveTimeoutRef.current = setTimeout(() => {
        onSaveRef.current?.()
      }, 1000)
    },
    [onChange]
  )

  const { containerRef, view, focus, getValue } = useCodeMirror({
    initialValue: value,
    placeholder,
    onChange: handleChange,
    onCursorChange,
    readOnly
  })

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!onDropFile || readOnly) return
    // Only react to OS-level file drags (not text selection drags)
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }, [onDropFile, readOnly])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!onDropFile || readOnly) return
      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return
      e.preventDefault()
      setIsDragOver(false)

      const snippets: string[] = []
      for (const file of files) {
        // Electron 28+ exposes absolute drop paths via preload's webUtils wrapper
        const sourcePath = window.api.getFilePath(file)
        if (!sourcePath) continue
        const result = await onDropFile(sourcePath)
        if (!result) continue
        const ext = result.filename.slice(result.filename.lastIndexOf('.')).toLowerCase()
        const isImage = IMAGE_EXTENSIONS.has(ext)
        const name = result.filename.slice(0, ext.length ? -ext.length : undefined)
        // encodeURI preserves "/" while escaping spaces and unicode —
        // required for the markdown parser to see a valid link destination.
        const link = encodeURI(result.relativePath)
        snippets.push(isImage ? `![${name}](${link})` : `[${name}](${link})`)
      }

      if (snippets.length === 0) return

      const currentView = view
      if (!currentView) return
      const pos = currentView.state.selection.main.head
      const insert = `${snippets.join('\n')}\n`
      currentView.dispatch({
        changes: { from: pos, to: pos, insert },
        selection: { anchor: pos + insert.length }
      })
      currentView.focus()
    },
    [onDropFile, readOnly, view]
  )

  // Expose getValue and focus to parent via ref
  useImperativeHandle(ref, () => ({
    getValue,
    focus
  }), [getValue, focus])

  // Auto-focus on mount
  useEffect(() => {
    if (!autoFocus || !view) return
    const timer = setTimeout(() => {
      focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [autoFocus, view, focus])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Handle keyboard shortcuts — always dispatches to the latest onSave
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
        }
        onSaveRef.current?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Save eagerly when the window loses focus or the page is hidden.
  // Cheap insurance against data loss if the user Cmd+Tabs away or quits
  // before the 1-second debounce fires.
  useEffect(() => {
    const flush = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = undefined
      }
      onSaveRef.current?.()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('blur', flush)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('blur', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', flush)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`h-full w-full overflow-auto focus-within:outline-none relative ${
        isDragOver ? 'editor-drop-target' : ''
      }`}
      style={
        {
          '--editor-font-size': '16px'
        } as React.CSSProperties
      }
    />
  )
})

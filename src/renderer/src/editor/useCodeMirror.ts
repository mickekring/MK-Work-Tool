import { useEffect, useRef, useState, useCallback } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, placeholder, drawSelection, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { theme } from './theme'
import { hideMarkdownMarks } from './markHiding'
import { inlineImages } from './inlineImages'
import { linkClicks, imageWidgetClicks } from './linkClicks'
import { tagHighlight } from './tagHighlight'
import { taskList } from './taskList'
import { tableStyling } from './tableStyling'
import { markdownShortcuts } from './markdownShortcuts'

export interface UseCodeMirrorOptions {
  initialValue?: string
  placeholder?: string
  onChange?: (value: string) => void
  onCursorChange?: (line: number, column: number) => void
  extensions?: Extension[]
  readOnly?: boolean
}

export interface UseCodeMirrorReturn {
  containerRef: React.RefObject<HTMLDivElement | null>
  view: EditorView | null
  getValue: () => string
  setValue: (value: string) => void
  focus: () => void
}

export function useCodeMirror({
  initialValue = '',
  placeholder: placeholderText = 'Start writing...',
  onChange,
  onCursorChange,
  extensions: userExtensions = [],
  readOnly = false
}: UseCodeMirrorOptions = {}): UseCodeMirrorReturn {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [view, setView] = useState<EditorView | null>(null)

  // Use refs to always have latest callbacks (avoids stale closure issue)
  const onChangeRef = useRef(onChange)
  const onCursorChangeRef = useRef(onCursorChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onCursorChangeRef.current = onCursorChange
  }, [onCursorChange])

  // Create update listener using refs for latest callbacks
  const updateListener = useCallback(() => {
    return EditorView.updateListener.of((update) => {
      if (update.docChanged && onChangeRef.current) {
        onChangeRef.current(update.state.doc.toString())
      }

      if (update.selectionSet && onCursorChangeRef.current) {
        const pos = update.state.selection.main.head
        const line = update.state.doc.lineAt(pos)
        onCursorChangeRef.current(line.number, pos - line.from + 1)
      }
    })
  }, [])

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return

    const extensions: Extension[] = [
      // Basic editor setup
      history(),
      drawSelection(),
      highlightActiveLine(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      placeholder(placeholderText),
      EditorView.lineWrapping,

      // Keymaps (custom shortcuts first so they win over defaults)
      keymap.of([
        ...markdownShortcuts,
        ...defaultKeymap,
        ...historyKeymap,
        ...closeBracketsKeymap,
        indentWithTab
      ]),

      // Markdown language support
      markdown({
        base: markdownLanguage,
        codeLanguages: languages
      }),

      // Theme
      ...theme,

      // Hide markdown marks on inactive lines (Obsidian-style live preview)
      hideMarkdownMarks,

      // Render inline images for ![alt](vault_media/...) when not editing
      inlineImages,

      // Highlight #tag tokens (outside headings) as clickable links
      tagHighlight,

      // Interactive [ ] / [x] task-list checkboxes
      taskList,

      // GFM pipe-table styling (monospaced columns, dimmed delimiters)
      tableStyling,

      // Cmd/Ctrl-click opens links + inline images
      linkClicks,
      imageWidgetClicks,

      // Default syntax highlighting as fallback
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

      // Update listener
      updateListener(),

      // Read-only mode
      EditorState.readOnly.of(readOnly),

      // User extensions
      ...userExtensions
    ]

    const state = EditorState.create({
      doc: initialValue,
      extensions
    })

    const editorView = new EditorView({
      state,
      parent: containerRef.current
    })

    viewRef.current = editorView
    setView(editorView)

    // Initial cursor position callback
    if (onCursorChangeRef.current) {
      onCursorChangeRef.current(1, 1)
    }

    return () => {
      editorView.destroy()
      viewRef.current = null
      setView(null)
    }
  }, []) // Only run on mount

  // Update content when initialValue changes externally
  useEffect(() => {
    const currentView = viewRef.current
    if (!currentView) return

    const currentValue = currentView.state.doc.toString()
    if (currentValue !== initialValue) {
      currentView.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: initialValue
        }
      })
    }
  }, [initialValue])

  // Helper functions
  const getValue = useCallback(() => {
    const view = viewRef.current
    if (!view) return ''

    // Force flush any pending DOM mutations before reading state
    // This ensures we get the complete content including the last keystroke
    // @ts-expect-error - observer.flush() is internal but necessary for this use case
    view.observer?.flush()

    return view.state.doc.toString()
  }, [])

  const setValue = useCallback((value: string) => {
    const currentView = viewRef.current
    if (!currentView) return

    currentView.dispatch({
      changes: {
        from: 0,
        to: currentView.state.doc.length,
        insert: value
      }
    })
  }, [])

  const focus = useCallback(() => {
    viewRef.current?.focus()
  }, [])

  return {
    containerRef,
    view,
    getValue,
    setValue,
    focus
  }
}

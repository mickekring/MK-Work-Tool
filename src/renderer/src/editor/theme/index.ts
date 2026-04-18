import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

// Base editor theme (structural only — no token styling here).
// Token styles come from the HighlightStyle below, which uses inline style
// properties so they're actually applied by CodeMirror's highlighter.
export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--editor-font-size, 16px)',
    fontFamily: 'var(--font-sans)',
    backgroundColor: 'transparent'
  },
  '.cm-content': {
    padding: '1rem 0',
    caretColor: 'var(--color-primary)',
    fontFamily: 'var(--font-sans)',
    lineHeight: '1.7'
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--color-primary)',
    borderLeftWidth: '2px'
  },
  '.cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--color-primary) 25%, transparent) !important'
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--color-primary) 30%, transparent) !important'
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--color-muted) 30%, transparent)'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    borderRight: 'none',
    color: 'var(--color-muted-foreground)',
    paddingRight: '1rem'
  },
  '.cm-lineNumbers .cm-gutterElement': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8em',
    minWidth: '2.5em',
    textAlign: 'right'
  },
  '.cm-foldGutter': {
    width: '1em'
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'inherit'
  },
  '.cm-line': {
    padding: '0 1rem'
  },
  '.cm-placeholder': {
    color: 'var(--color-muted-foreground)',
    fontStyle: 'italic'
  }
})

// Markdown + code syntax styling.
// Uses inline style properties (fontSize, fontWeight, color, etc.) so
// CodeMirror's highlighter generates real scoped CSS for each tag.
export const editorHighlightStyle = HighlightStyle.define([
  // Headings
  {
    tag: t.heading1,
    fontSize: '1.9em',
    fontWeight: '700',
    color: 'var(--color-foreground)'
  },
  {
    tag: t.heading2,
    fontSize: '1.55em',
    fontWeight: '700',
    color: 'var(--color-foreground)'
  },
  {
    tag: t.heading3,
    fontSize: '1.3em',
    fontWeight: '600',
    color: 'var(--color-foreground)'
  },
  {
    tag: t.heading4,
    fontSize: '1.15em',
    fontWeight: '600',
    color: 'var(--color-foreground)'
  },
  {
    tag: t.heading5,
    fontSize: '1.05em',
    fontWeight: '600',
    color: 'var(--color-foreground)'
  },
  {
    tag: t.heading6,
    fontSize: '1em',
    fontWeight: '600',
    color: 'var(--color-muted-foreground)'
  },

  // Inline emphasis
  { tag: t.strong, fontWeight: '700', color: 'var(--color-foreground)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  {
    tag: t.strikethrough,
    textDecoration: 'line-through',
    color: 'var(--color-muted-foreground)'
  },

  // Links
  {
    tag: t.link,
    color: 'var(--color-primary)',
    textDecoration: 'underline'
  },
  { tag: t.url, color: 'var(--color-muted-foreground)' },

  // Inline code + code blocks
  {
    tag: t.monospace,
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-foreground)'
  },

  // Block quotes
  {
    tag: t.quote,
    color: 'var(--color-muted-foreground)',
    fontStyle: 'italic'
  },

  // Lists
  { tag: t.list, color: 'var(--color-foreground)' },

  // Markdown formatting marks (the literal #, **, _, `, >, -, etc.)
  // Dimmed so the content reads cleanly while marks stay visible.
  {
    tag: t.processingInstruction,
    color: 'var(--color-muted-foreground)',
    opacity: '0.6'
  },
  {
    tag: t.meta,
    color: 'var(--color-muted-foreground)',
    opacity: '0.6'
  },

  // Code syntax colors (inside fenced code blocks)
  { tag: t.keyword, color: 'var(--color-primary)' },
  { tag: t.string, color: '#a5d6a7' },
  { tag: t.number, color: '#f48fb1' },
  {
    tag: t.comment,
    color: 'var(--color-muted-foreground)',
    fontStyle: 'italic'
  },
  { tag: t.function(t.variableName), color: '#90caf9' },
  { tag: t.className, color: '#ce93d8' },
  { tag: t.propertyName, color: '#80cbc4' },
  { tag: t.operator, color: 'var(--color-foreground)' },
  { tag: t.punctuation, color: 'var(--color-muted-foreground)' }
])

// Combined theme extension
export const theme = [editorTheme, syntaxHighlighting(editorHighlightStyle)]

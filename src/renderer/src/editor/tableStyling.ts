import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

// Add line-level classes to GFM pipe-table rows so CSS can render them
// as proper tables (monospaced alignment + dimmed pipe delimiters).
// This keeps the source text fully editable; we just decorate the lines.

const tableRowLine = Decoration.line({ class: 'cm-table-row' })
const tableHeaderLine = Decoration.line({ class: 'cm-table-row cm-table-header' })
const tableDelimLine = Decoration.line({ class: 'cm-table-row cm-table-delim' })
const pipeMark = Decoration.mark({ class: 'cm-table-pipe' })

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const state = view.state

  // RangeSetBuilder requires additions in sorted (from, startSide) order.
  // Line decorations share the same `from` (line start) as any mark
  // decorations that begin on that line, and must be added first.
  type Pending = { line: number; lineDeco: Decoration; pipes: { from: number; to: number }[] }
  const pending: Pending[] = []
  const byLine = new Map<number, Pending>()

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'TableHeader' || node.name === 'TableRow' || node.name === 'TableDelimiter') {
          const line = state.doc.lineAt(node.from)
          let entry = byLine.get(line.from)
          if (!entry) {
            const deco =
              node.name === 'TableHeader'
                ? tableHeaderLine
                : node.name === 'TableDelimiter'
                  ? tableDelimLine
                  : tableRowLine
            entry = { line: line.from, lineDeco: deco, pipes: [] }
            byLine.set(line.from, entry)
            pending.push(entry)
          }
        }
      }
    })
  }

  // Collect pipe positions per table line.
  for (const entry of pending) {
    const line = state.doc.lineAt(entry.line)
    const text = line.text
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '|') {
        entry.pipes.push({ from: line.from + i, to: line.from + i + 1 })
      }
    }
  }

  pending.sort((a, b) => a.line - b.line)
  for (const entry of pending) {
    builder.add(entry.line, entry.line, entry.lineDeco)
    for (const p of entry.pipes) {
      builder.add(p.from, p.to, pipeMark)
    }
  }

  return builder.finish()
}

export const tableStyling = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
)

import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

// Matches #TagName where # is preceded by start-of-line or a non-word /
// non-hash character, and the tag name is ≥2 letters/digits (unicode),
// and contains at least one letter (excludes #000000 hex colors etc.).
const TAG_REGEX = /(?<=^|[^\w#])#((?=[\p{L}\p{N}_-]*\p{L})[\p{L}\p{N}_-]{2,})/gu

const HEADING_NODES = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2'
])

const tagMark = Decoration.mark({ class: 'cm-tag' })

function isInsideHeading(
  view: EditorView,
  pos: number
): boolean {
  const node = syntaxTree(view.state).resolveInner(pos, 1)
  let cur: typeof node | null = node
  while (cur) {
    if (HEADING_NODES.has(cur.name)) return true
    cur = cur.parent
  }
  return false
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    TAG_REGEX.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = TAG_REGEX.exec(text)) !== null) {
      // match.index points at the char that preceded `#` (or -1 for BOF).
      // We want the `#` itself as the start.
      const hashOffset = match.index + (match[0].length - match[1].length - 1)
      const start = from + hashOffset
      const end = start + match[1].length + 1 // include the '#'
      if (isInsideHeading(view, start)) continue
      builder.add(start, end, tagMark)
    }
  }
  return builder.finish()
}

export const tagHighlight = ViewPlugin.fromClass(
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

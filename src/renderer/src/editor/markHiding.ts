import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

const hideMark = Decoration.replace({})

const MARK_NODES = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'LinkMark',
  'StrikethroughMark',
  'LinkTitle'
])

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const state = view.state
  const sel = state.selection.main

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        let shouldHide = MARK_NODES.has(node.name)

        if (!shouldHide && node.name === 'URL') {
          if (node.node.parent?.name === 'Link') shouldHide = true
        }

        if (!shouldHide) return

        const parent = node.node.parent
        if (!parent) return

        if (sel.from <= parent.to && sel.to >= parent.from) return

        builder.add(node.from, node.to, hideMark)
      }
    })
  }

  return builder.finish()
}

export const hideMarkdownMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
)

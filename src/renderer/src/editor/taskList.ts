import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

// Interactive checkbox widget for GFM task list items.
// Rendered in place of the literal `[ ]` / `[x]` marker when the caret
// is not on that line, mirroring Obsidian's live-preview behavior.

class TaskMarkerWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number
  ) {
    super()
  }

  eq(other: TaskMarkerWidget): boolean {
    return other.checked === this.checked && other.from === this.from && other.to === this.to
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.className = 'cm-task-checkbox'
    input.checked = this.checked
    input.setAttribute('aria-label', 'Task')

    input.addEventListener('mousedown', (e) => {
      // Prevent the editor from stealing focus / moving the caret onto
      // the widget position before we dispatch the toggle.
      e.preventDefault()
    })

    input.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const nextMarker = this.checked ? '[ ]' : '[x]'
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: nextMarker }
      })
    })

    return input
  }

  ignoreEvent(): boolean {
    // Let the click/mousedown handlers above fire.
    return false
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const state = view.state
  const sel = state.selection.main

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'TaskMarker') return

        // Show raw markdown while the caret is on the marker's line so
        // the user can edit it directly.
        const line = state.doc.lineAt(node.from)
        if (sel.from <= line.to && sel.to >= line.from) return

        const text = state.doc.sliceString(node.from, node.to)
        const checked = /\[[xX]\]/.test(text)

        builder.add(
          node.from,
          node.to,
          Decoration.replace({
            widget: new TaskMarkerWidget(checked, node.from, node.to)
          })
        )
      }
    })
  }

  return builder.finish()
}

export const taskList = ViewPlugin.fromClass(
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

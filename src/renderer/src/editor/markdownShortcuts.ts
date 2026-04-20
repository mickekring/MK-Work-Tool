import type { EditorView, KeyBinding } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'

// Toggle a symmetric inline wrapper (e.g. `**` for bold, `_` for italic)
// around every selection range. Empty selection -> insert wrapper pair
// and place caret between. If the selection (or its immediate neighbors)
// already has the wrapper, strip it instead of re-wrapping.
function toggleWrap(view: EditorView, wrapper: string): boolean {
  const { state } = view
  const wlen = wrapper.length

  const newSelections = state.changeByRange((range) => {
    const { from, to } = range
    const doc = state.doc

    // Empty selection: insert wrapper and place caret in the middle.
    if (from === to) {
      return {
        changes: [{ from, insert: wrapper + wrapper }],
        range: EditorSelection.cursor(from + wlen)
      }
    }

    const selected = doc.sliceString(from, to)

    // Case A: the selection itself is wrapped — e.g. user selected `**word**`
    if (
      selected.length >= wlen * 2 &&
      selected.startsWith(wrapper) &&
      selected.endsWith(wrapper)
    ) {
      const inner = selected.slice(wlen, selected.length - wlen)
      return {
        changes: [{ from, to, insert: inner }],
        range: EditorSelection.range(from, from + inner.length)
      }
    }

    // Case B: the selection is inside an existing wrap — e.g. user
    // selected `word` with `**word**` around it in the doc.
    const before = doc.sliceString(Math.max(0, from - wlen), from)
    const after = doc.sliceString(to, Math.min(doc.length, to + wlen))
    if (before === wrapper && after === wrapper) {
      return {
        changes: [
          { from: from - wlen, to, insert: selected },
          { from: to, to: to + wlen, insert: '' }
        ],
        range: EditorSelection.range(from - wlen, to - wlen)
      }
    }

    // Case C: wrap the selection.
    return {
      changes: [
        { from, insert: wrapper },
        { from: to, insert: wrapper }
      ],
      range: EditorSelection.range(from + wlen, to + wlen)
    }
  })

  if (newSelections.changes.empty) return false

  view.dispatch(newSelections)
  return true
}

export const markdownShortcuts: readonly KeyBinding[] = [
  {
    key: 'Mod-b',
    run: (view) => toggleWrap(view, '**')
  },
  {
    key: 'Mod-i',
    run: (view) => toggleWrap(view, '_')
  }
]

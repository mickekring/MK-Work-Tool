import { EditorView } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

const LINK_CONTAINER_NODES = new Set(['Link', 'Image', 'Autolink'])

function getLinkUrlAt(view: EditorView, pos: number): string | null {
  const tree = syntaxTree(view.state)
  let node = tree.resolveInner(pos, 1)
  while (node && !LINK_CONTAINER_NODES.has(node.name)) {
    const parent = node.parent
    if (!parent) return null
    node = parent
  }
  if (!node) return null
  let child = node.firstChild
  while (child) {
    if (child.name === 'URL') {
      return view.state.doc.sliceString(child.from, child.to).trim()
    }
    child = child.nextSibling
  }
  return null
}

function routeLinkUrl(url: string): void {
  if (/^https?:\/\//i.test(url)) {
    window.api.invoke('shell:open-external', url)
    return
  }
  if (/^mailto:/i.test(url)) {
    window.api.invoke('shell:open-external', url)
    return
  }
  // Treat everything else as a vault-relative path (attachments,
  // markdown notes). The main process resolves against the vault root.
  window.api.invoke('attachment:open', url)
}

// Cmd/Ctrl-click on a link or image opens its URL.
// (Plain click stays a cursor placement, which is needed to enter a
// rendered link and edit its markdown syntax.)
export const linkClicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.metaKey || event.ctrlKey)) return
    if (event.button !== 0) return
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos == null) return
    const url = getLinkUrlAt(view, pos)
    if (!url) return
    event.preventDefault()
    routeLinkUrl(url)
  }
})

// Also handle clicks on the rendered inline image widget — the widget is
// outside the normal link flow, so Cmd/Ctrl-click on the image opens the
// file in the OS viewer.
export const imageWidgetClicks = EditorView.domEventHandlers({
  click(event) {
    if (!(event.metaKey || event.ctrlKey)) return
    const target = event.target as HTMLElement | null
    if (!target) return
    const wrap = target.closest('.cm-inline-image') as HTMLElement | null
    if (!wrap) return
    const rel = wrap.dataset.rel
    if (!rel) return
    event.preventDefault()
    window.api.invoke('attachment:open', rel)
  }
})

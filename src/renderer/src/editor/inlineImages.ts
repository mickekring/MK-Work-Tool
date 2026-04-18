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

// Resolve a markdown image src to something the renderer can actually load.
// - vault-relative paths like "vault_media/foo.png" -> "vault-media://..."
// - absolute http(s) URLs are returned unchanged
// - everything else is treated as not-loadable (returns null)
function resolveImageSrc(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) return trimmed

  // Accept both encoded (vault_media/foo%20bar.png) and raw
  // (vault_media/foo bar.png) forms. Decode first to normalize, then
  // re-encode per-segment for the vault-media:// URL.
  let decoded = trimmed
  try {
    decoded = decodeURI(trimmed)
  } catch {
    /* leave as-is */
  }
  const prefix = 'vault_media/'
  if (!decoded.startsWith(prefix)) return null
  const rest = decoded.slice(prefix.length)
  const reencoded = rest
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `vault-media://local/${reencoded}`
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly rawPath: string
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.rawPath === this.rawPath
    )
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-inline-image'
    wrap.dataset.rel = this.rawPath
    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.loading = 'lazy'
    wrap.appendChild(img)
    return wrap
  }

  ignoreEvent(): boolean {
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
        if (node.name !== 'Image') return

        // Keep the raw markdown visible while the caret is inside the image
        if (sel.from <= node.to && sel.to >= node.from) return

        const text = state.doc.sliceString(node.from, node.to)
        // Expect ![alt](src) — pull alt + src by index
        const altStart = text.indexOf('[')
        const altEnd = text.indexOf(']', altStart)
        const srcStart = text.indexOf('(', altEnd)
        const srcEnd = text.lastIndexOf(')')
        if (
          altStart < 0 ||
          altEnd < 0 ||
          srcStart < 0 ||
          srcEnd < 0 ||
          srcEnd <= srcStart
        ) {
          return
        }

        const alt = text.slice(altStart + 1, altEnd)
        // Strip optional "title" after the URL
        const inside = text.slice(srcStart + 1, srcEnd).trim()
        const spaceIdx = inside.search(/\s/)
        const rawSrc = spaceIdx >= 0 ? inside.slice(0, spaceIdx) : inside
        const resolved = resolveImageSrc(rawSrc)
        if (!resolved) return

        builder.add(
          node.from,
          node.to,
          Decoration.replace({
            widget: new ImageWidget(resolved, alt, rawSrc),
            block: false
          })
        )
      }
    })
  }

  return builder.finish()
}

export const inlineImages = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
)

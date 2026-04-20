# Rune

A local-first, Obsidian-inspired personal workspace for markdown notes.
Your notes stay as plain `.md` files on your own disk — no cloud, no
lock-in, no sign-up.

Built with Electron, React, TypeScript, and CodeMirror 6.

## Features

- **Vault-based notes** — pick any folder on your disk, everything inside
  becomes your workspace. Files and folders can be created, renamed,
  deleted, and drag-dropped between folders from a three-panel layout.
- **Live markdown preview** — headings, bold, italic, links, and inline
  images render as you type. The raw `#`, `**`, `[…](…)` marks hide on
  inactive lines and reappear when you click in to edit, like Obsidian.
- **Drag-and-drop attachments** — drop any file onto a note; images
  render inline, other files become Cmd/Ctrl-click-openable links. All
  attachments are copied into a `vault_media/` folder inside your vault.
- **Full-text search** — click the magnifying glass in the left
  sidebar header (or press **⌘K** / **Ctrl+K**) to search across every
  note in the vault. Results are grouped into "Filenames" and
  "Matches" with highlighted snippets. Click a result to open the
  note.
- **Hashtag-based linking + auto-tagging** — write `#Topic` anywhere and
  the app tags every other note in the vault that mentions "Topic" as
  plain text (first untagged occurrence, word-boundary, case-insensitive,
  ≥3 chars). The right sidebar's collapsible **Relations** section lists
  all connected notes, split into "Also tagged" and "Mentioned" groups.
  Click any entry to open it.
- **Collapsible, reorderable right-sidebar sections** — Document
  Info (stats), Relations, History, and AI Chat each have a section
  heading with its own chevron. Grab the handle on the left of any
  heading to drag a section into a new position; drop onto another
  section to insert before it. Toggle state and section order both
  persist globally across files and restarts.
- **Tag Constellation** — press **⌘⇧G** (or click the constellation
  icon in the sidebar header) to see every tag in your vault as a
  force-directed graph. Circles sized by how many notes carry each
  tag, lines between tags that co-occur in at least one note,
  thickness proportional to how many notes they share. Click a tag
  to see its notes in a side drawer; click a note to jump to it.
  Useful for spotting clusters of recurring themes and orphan tags
  that would benefit from more cross-linking.
- **Per-file history snapshots** — manual "Save snapshot" creates a
  point-in-time copy of the current file. The History panel lists up
  to 10 snapshots with timestamps, a restore button, and a delete
  button. Snapshots live inside the vault at
  `.rune/history/{path}/` so they travel with the vault.
- **Local AI chat (Ollama)** — the right sidebar's AI Chat section
  talks to a locally-running Ollama instance. The current note is
  injected into the system prompt automatically, so you can ask
  questions grounded in whatever you're reading/writing. Pick any
  installed Ollama model, edit the system prompt in Settings → AI,
  and stream responses token-by-token with full markdown rendering
  (bold, italic, lists, code, tables, etc.). All local, no network.
- **Always-safe auto-save** — debounced auto-save after you stop typing,
  plus eager save on window blur and before quit. Cmd/Ctrl+S also works.
- **Document stats** — live word count, character count, paragraph
  count, and estimated reading time in the right panel.
- **Dark and light themes** — with a customizable accent color and
  five-step font size control.
- **Collapsible, resizable sidebars** — both left (file tree) and right
  (stats) panels can be dragged to resize or toggled from the status
  bar. Widths, visibility, and every scroll-position detail persist.
- **Session memory** — folder expansion, sidebar widths and visibility,
  sidebar section collapse state, per-file relation group expansion,
  window size *and* on-screen position, last opened file, theme, accent
  color, and font size are all remembered across restarts.
- **Offline-first** — no telemetry, no network calls, no fonts loaded
  from the internet. Runs entirely on your machine.

## Tech stack

- **Electron 32** — desktop runtime
- **React 18 + TypeScript 5** — UI
- **CodeMirror 6** — editor, with a custom live-preview extension layer
- **Zustand** — main-process authoritative state, synced to renderer
  via typed IPC
- **TailwindCSS 4** — styling via CSS custom properties

## Getting started

```bash
# Clone and install
git clone https://github.com/mickekring/MK-Work-Tool.git
cd MK-Work-Tool
npm install

# Run in dev mode (HMR for the renderer)
npm run dev
```

On first launch you'll be prompted to pick a vault folder. Choose any
directory — it becomes the root of your notes.

## Building

```bash
npm run build:mac      # macOS DMG (arm64 + x64)
npm run build:win      # Windows NSIS installer
npm run build:linux    # Linux AppImage
```

## Documentation

Longer-form project docs live in [`docs/`](./docs):

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) — process model, state
  architecture, IPC design, attachment flow, and the `vault-media://`
  protocol.
- [DEPENDENCIES.md](./docs/DEPENDENCIES.md) — every package with its
  version pin and purpose.
- [TODO.md](./docs/TODO.md) — roadmap, completed work, known issues.

## License

MIT — see [package.json](./package.json).

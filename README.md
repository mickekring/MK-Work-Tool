# Arbetsyta

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
- **Hashtag-based linking + auto-tagging** — write `#Topic` anywhere and
  the app tags every other note in the vault that mentions "Topic" as
  plain text (first untagged occurrence, word-boundary, case-insensitive,
  ≥3 chars). The right sidebar's collapsible **Relations** section lists
  all connected notes, split into "Also tagged" and "Mentioned" groups.
  Click any entry to open it.
- **Collapsible right-sidebar sections** — Document Info (stats) and
  Relations each have a section heading with its own chevron. Toggle
  state persists globally across files and restarts.
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

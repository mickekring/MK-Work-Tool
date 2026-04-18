# Arbetsyta - Architecture

## Overview

Arbetsyta is a local-first, single-vault Electron desktop app for markdown notes. All data lives as plain `.md` files on the user's filesystem — nothing is stored in a database or cloud service.

## Process Model

```
┌─────────────────────────────────────────────────────┐
│  Main Process (Node.js)                             │
│                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Zustand   │  │ Settings     │  │ IPC Handlers  │ │
│  │ Store     │  │ Service      │  │               │ │
│  │ (author-  │  │ (~/.arbets-  │  │ file:*        │ │
│  │  itative) │  │   yta/)      │  │ folder:*      │ │
│  └──────────┘  └──────────────┘  │ vault:*       │ │
│                                   │ dialog:*      │ │
│                                   │ store:*       │ │
│                                   └───────────────┘ │
└────────────────────┬────────────────────────────────┘
                     │ IPC (contextBridge)
┌────────────────────┴────────────────────────────────┐
│  Preload Script                                      │
│  Exposes: window.api.invoke(), window.api.on()       │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────┐
│  Renderer Process (React)                            │
│                                                      │
│  ┌──────────────┐  ┌───────────────────────────────┐ │
│  │ React Hooks  │  │ Components                    │ │
│  │ useStore()   │  │                               │ │
│  │ useSettings()│  │  AppLayout                    │ │
│  │ useFileTree()│  │  ├── LeftSidebar (file tree)  │ │
│  │ useUI()      │  │  ├── Editor (CodeMirror 6)    │ │
│  │              │  │  ├── RightSidebar (stats)     │ │
│  └──────────────┘  │  └── StatusBar                │ │
│                     └───────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## State Management

### Authoritative State (Main Process)

The main process Zustand store is the single source of truth. It holds:

| Category | Persisted | Storage |
|----------|-----------|---------|
| `settings` (vault path, theme, font size, accent color) | Yes | `~/.arbetsyta/settings.json` |
| `ui` (sidebar visibility/widths, last opened file, expanded folders) | Yes | `~/.arbetsyta/ui-state.json` |
| `fileTree` (folder/file structure) | No | Rebuilt from disk on vault open |
| `editor` (current file, content, dirty flag) | No | In-memory only |

### Renderer Sync

1. On mount, renderer calls `store:get-state` IPC to hydrate
2. Renderer listens to `store:state-changed` events from main
3. Mutations go through IPC invoke → main store updates → broadcasts to all windows

### File Content

File content is **never** stored in the global state. It's read from disk on demand via `file:read` and written back via `file:write`. The editor component holds content in local React state.

## IPC Channel Design

All channels are typed in `src/shared/types/ipc.ts`:

```
dialog:select-vault    → string | null
file:read/write/create/delete/rename/exists
folder:create/delete/list
vault:open/close/init
store:get-state/set-*
```

Events (main → renderer):
- `store:state-changed` — partial state updates
- `file:external-change` — reserved for future file watching

## Directory Layout

```
src/
├── main/                  # Electron main process
│   ├── index.ts          # App lifecycle, window creation
│   ├── ipc/handlers.ts   # All IPC channel handlers
│   ├── services/         # Settings persistence
│   └── store/            # Zustand vanilla store
├── preload/              # contextBridge (invoke + on)
├── renderer/src/         # React app
│   ├── components/
│   │   ├── layout/       # AppLayout, sidebars, StatusBar, ResizeHandle
│   │   ├── editor/       # MarkdownEditor, EditableTitle
│   │   ├── modals/       # Welcome, Settings, Confirm, Input
│   │   └── ui/           # ContextMenu
│   ├── editor/           # CodeMirror hook + theme
│   ├── hooks/            # Store access hooks
│   └── styles/           # Tailwind + CSS custom properties
└── shared/types/         # Types shared across processes
```

## Persistence Paths

| Path | Purpose |
|------|---------|
| `~/.arbetsyta/settings.json` | App settings (vault path, theme, font size, accent) |
| `~/.arbetsyta/ui-state.json` | UI state (sidebar visibility/widths, expanded folders, per-file expanded relation tags, globally-expanded right-sidebar sections, last opened file) |
| `~/.arbetsyta/window-state.json` | Electron window bounds (width, height, x, y) |
| `{vault}/.arbetsyta/config.json` | Per-vault metadata (version, creation date) |
| `{vault}/**/*.md` | User markdown files |
| `{vault}/vault_media/` | Attachments (images, PDFs, etc.) dropped into notes. Auto-created on first drop. |
| `{vault}/.arbetsyta/history/{relative-path}/{id}.md` | Manual history snapshots (up to 10 per file). Created via the History section in the right sidebar. Older ones pruned automatically. |

## Attachments

When a file is dragged from the OS into the editor area:

1. The renderer reads `file.path` (Electron's extension on the `File` API for OS drops).
2. It calls the `attachment:save` IPC channel.
3. The main process ensures `{vault}/vault_media/` exists, copies the source file there with collision-safe renaming (`name-1.ext`, `name-2.ext`, ...), and returns the relative path.
4. The renderer inserts `![name](vault_media/...)` for images or `[name](vault_media/...)` for other files at the cursor position.

## Tag index

An in-memory index on the main process tracks `#tag` declarations across all `.md` files in the vault. Live-updated as files are saved, created, deleted, or renamed (see IPC handlers for `file:*`).

Data structures (in [src/main/services/tags-service.ts](../src/main/services/tags-service.ts)):

- `filesByTag: Map<tag, Set<file>>` — which files declare each tag
- `tagsByFile: Map<file, Set<tag>>` — inverse lookup for fast updates
- `contentByFile: Map<file, string>` — cached content for weak-match (mention) lookup
- `displayByTag: Map<lowerTag, origCaseTag>` — preserves the first-seen casing so "NIP" and "nip" show up as whichever was typed first

Matching rules:

- Tag recognition: `(?<=^|[^\w#])#([\p{L}\p{N}_-]{2,})` — min 2 chars, not preceded by a word char or another `#`, supports Unicode letters (å, ä, ö).
- Headings are excluded in the editor highlighter (a `#` at the start of an ATX heading shouldn't look like a tag).
- "Mentioned" (weak) match: `(?<=^|[^\p{L}\p{N}_])<tag>(?=[^\p{L}\p{N}_]|$)` case-insensitive word-boundary search through cached content.

IPC channels:

- `tags:get-index` — full snapshot of all tags + files that declare each
- `tags:get-relations(filePath)` — per-file: tags declared + `taggedIn` (strong) + `mentionedIn` (weak) related files
- `tags:rescan` — force full vault rescan
- Event: `tags:index-changed` broadcast whenever the index mutates

## AI chat (Ollama)

The right sidebar contains an **AI Chat** section that talks to a locally-running [Ollama](https://ollama.com) instance at `http://localhost:11434` (hard-coded for now).

Main process (`src/main/services/ollama-service.ts`) exposes two operations:

- `listModels()` — GET `/api/tags`, returns installed models or a friendly error if Ollama isn't running.
- `streamChat(model, messages, signal, onDelta, onDone, onError)` — POST `/api/chat` with `stream: true`, parses newline-delimited JSON, and invokes the callbacks per chunk/done/error. Cancellation via `AbortSignal`.

IPC channels:

- `ai:list-models` — returns `{ ok, models }` / `{ ok: false, error }`
- `ai:chat-start(requestId, model, messages)` — fire-and-forget; streams results via events
- `ai:chat-abort(requestId)` — cancels an in-flight stream

Renderer events:

- `ai:chat-chunk { requestId, delta }` — token stream
- `ai:chat-done { requestId }` — stream completed
- `ai:chat-error { requestId, message }` — stream failed

The `useChat` hook in `src/renderer/src/hooks/useChat.ts` tracks messages, the streaming flag, and an abort handle. Chat state resets whenever the current file changes.

Settings (`settings.ai`):

- `model` — selected Ollama model name
- `systemPrompt` — template with a `{{document}}` placeholder substituted with the current note at send time

### Tag propagation (auto-tagging)

When a file is saved via `file:write` or created via `file:create`, `tagsService.propagateTags(path)` runs. For every tag declared in the saved file (min 3 characters), the service walks other indexed files and **inserts a `#` before the first untagged occurrence of the tag word**, then rewrites that file to disk and updates its index entry.

Rules:

- **File must not already contain the tag** — if `#Tag` exists anywhere in the target file, it's left untouched.
- **First occurrence only** — subsequent mentions in the same file are not modified.
- **Word-boundary match** — `(?<=^|[^\p{L}\p{N}_#])Tag(?=[^\p{L}\p{N}_]|$)` case-insensitive, so `NIPS` or `snipping` won't match `NIP`.
- **Minimum 3 characters** for propagation. Short tags like `#OR` are recognized locally but skipped during propagation to avoid mass false-positives.
- **Source file is excluded** from propagation — we're tagging other files, not re-tagging the one that declared the tag.

A single `tags:index-changed` broadcast is emitted after propagation finishes so the renderer refreshes once, not per file.

### Loading images in the renderer

Images reference `vault_media/filename.ext` in markdown, but the renderer can't load `file://` URLs directly (cross-origin with the `http://localhost:5173` dev server, same-origin issues in production). A custom `vault-media://` protocol is registered in `src/main/index.ts`:

- Scheme is registered as privileged *before* `app.whenReady()` (required by Electron).
- The handler resolves `vault-media://local/...` requests against `{currentVaultPath}/vault_media/` and streams the file back via `net.fetch(file://...)`.
- The CodeMirror inline image widget uses `vault-media://local/filename.ext` as the `<img src>`.

## Theme System

Theming is handled via CSS custom properties defined in `globals.css`. Dark mode is the default. Light mode is toggled by adding a `.light` class to the document root. The theme preference is persisted in settings.

Accent color (10 presets) and font size (5 levels) are also stored in settings and applied via CSS variables.

## Editor

The editor uses CodeMirror 6 with:
- Markdown language support with syntax highlighting
- Custom theme matching app CSS variables
- Auto-save (1-second debounce after changes)
- Manual save (Cmd+S)
- Cursor position tracking (reported to StatusBar)

## Security

- `contextIsolation: true` — renderer cannot access Node.js
- `nodeIntegration: false` — no require() in renderer
- `sandbox: false` — needed for preload file access
- External links open in default browser (not in app)
- Single instance lock prevents multiple app windows

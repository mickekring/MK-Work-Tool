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
| `~/.arbetsyta/ui-state.json` | UI state (sidebar visibility/widths, expanded folders, last opened file) |
| `~/.arbetsyta/window-state.json` | Electron window bounds (width, height, x, y) |
| `{vault}/.arbetsyta/config.json` | Per-vault metadata (version, creation date) |
| `{vault}/**/*.md` | User markdown files |
| `{vault}/vault_media/` | Attachments (images, PDFs, etc.) dropped into notes. Auto-created on first drop. |

## Attachments

When a file is dragged from the OS into the editor area:

1. The renderer reads `file.path` (Electron's extension on the `File` API for OS drops).
2. It calls the `attachment:save` IPC channel.
3. The main process ensures `{vault}/vault_media/` exists, copies the source file there with collision-safe renaming (`name-1.ext`, `name-2.ext`, ...), and returns the relative path.
4. The renderer inserts `![name](vault_media/...)` for images or `[name](vault_media/...)` for other files at the cursor position.

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

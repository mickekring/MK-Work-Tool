# Rune - Architecture

## Overview

Rune is a local-first, single-vault Electron desktop app for markdown notes. All data lives as plain `.md` files on the user's filesystem — nothing is stored in a database or cloud service.

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
| `settings` (vault path, theme, font size, accent color) | Yes | `~/.rune/settings.json` |
| `ui` (sidebar visibility/widths, last opened file, expanded folders) | Yes | `~/.rune/ui-state.json` |
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
| `~/.rune/settings.json` | App settings (vault path, theme, font size, accent) |
| `~/.rune/ui-state.json` | UI state (sidebar visibility/widths, expanded folders, per-file expanded relation tags, globally-expanded right-sidebar sections, last opened file) |
| `~/.rune/window-state.json` | Electron window bounds (width, height, x, y) |
| `{vault}/.rune/config.json` | Per-vault metadata (version, creation date) |
| `{vault}/**/*.md` | User markdown files |
| `{vault}/vault_media/` | Attachments (images, PDFs, etc.) dropped into notes. Auto-created on first drop. |
| `{vault}/.rune/history/{relative-path}/{id}.md` | Manual history snapshots (up to 10 per file). Created via the History section in the right sidebar. Older ones pruned automatically. |

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
- `tags:get-graph` — co-occurrence graph used by the Tag Constellation
- `tags:rescan` — force full vault rescan
- `tags:remove-tag(tag)` — strip the leading `#` from every occurrence of a tag across the vault, returning `{ filesModified, occurrencesRemoved }`. See **Tag operations** below.
- Event: `tags:index-changed` broadcast whenever the index mutates

### Tag operations

The **Tag Manager** modal (`src/renderer/src/components/modals/TagManagerModal.tsx`, opened via ⌘⇧T or the tag icon in the left sidebar header) lists every tag in the vault with note counts and exposes a single bulk operation today: **delete tag**.

Deleting a tag does not delete any words. `tagsService.removeTag(tag)` finds every `TAG_REGEX` match across `state.contentByFile` whose lowercased name matches the target, filters out matches that fall inside `findProtectedRanges` (frontmatter, fenced/inline code, link destinations, autolinks, bare URLs), and rewrites each affected file with just the leading `#` byte stripped. So `Visited #Sweden` becomes `Visited Sweden`; the word `Sweden` inside a code block or a URL fragment is left exactly as it was.

Each modified file gets a `historyService.createSnapshot` *before* the rewrite, so the Tag Manager's destructive action is reversible per-file from the History panel. Writes go through `safeWriteFile` for the usual cloud-sync friendliness (hash guard + fsync + direct overwrite).

If the file currently open in the editor is one of the rewritten files, `App.tsx` re-reads it via `file:read` and replaces the in-memory content so the user sees the change immediately rather than dirty stale content.

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
- Auto-save (2.5-second debounce after changes) + eager flush on blur / visibilitychange / beforeunload / Cmd+S / file-switch
- Manual save (Cmd+S)
- Cursor position tracking (reported to StatusBar)
- Interactive task-list checkboxes (`- [ ]` / `- [x]`), GFM table styling, and Cmd+B / Cmd+I markdown shortcuts

## Cloud-sync friendliness

Rune's storage is plain files in a user-chosen folder, so users put their vault inside pCloud / OneDrive / iCloud / Proton Drive / Dropbox / Syncthing and expect it to Just Work. Several small choices in the write path keep conflicts rare:

- **Hash-guarded writes** (`src/main/services/safe-write.ts`, `safeWriteFile`): before writing a vault file we read its current contents and skip the write entirely if the bytes match. This kills the biggest cause of conflict copies — repeated "save" calls that don't actually change anything (autosave firing on no-op keystrokes, tag-propagation re-running, snapshot restore of identical content). Every skipped write is one fewer race window for the sync daemon.
- **Direct overwrite, never rename-over-temp**: the classic "safe write" pattern (write to `foo.md.tmp`, rename over `foo.md`) breaks badly with iCloud (rewrites inodes) and pCloud (treats rename as delete+create, producing duplicate uploads). Rune opens the target file directly, writes, fsyncs, and closes.
- **fsync before close**: once we release the file descriptor, FSEvents-driven sync daemons read the file immediately. fsync ensures stable bytes on disk before that happens; without it the daemon can briefly observe a partially-written file.
- **Longer autosave debounce (2.5s)**: fewer writes per minute means fewer chances to race a sync upload. The editor still flushes eagerly on any focus-loss / navigation event, so worst-case data loss on crash is ≤2.5s of typing.
- **Junk-file filtering** (`src/main/ipc/handlers.ts`, `JUNK_FILENAME_PATTERNS`): in addition to the existing `.`-prefix skip (which catches `.DS_Store`, iCloud `.Name.md.icloud` placeholders, Syncthing `.sync-conflict-*`, LibreOffice `.~lock.*#`), we also skip `~$*` (Office lock files) and `*.crdownload` / `*.part` / `*.tmp` / `*.temp` so transient sync artifacts don't clutter the file tree.

Still to come (Layer 2+): external-change detection via `chokidar` with mtime/hash tracking so we reload clean files silently and warn on dirty ones; a first-class "Conflicts" section that groups detected `(conflicted copy)` / `.sync-conflict-*` siblings with compare/merge actions.

## Security

A full security audit ran in April 2026 (see `tasks/lessons.md`). The current posture:

**Renderer isolation:**

- `contextIsolation: true` — renderer runs in a separate JS world; cannot touch Node.
- `nodeIntegration: false` — no `require()` in the renderer.
- `sandbox: true` — Chromium OS-level sandbox for the renderer process.
- `webviewTag: false` — `<webview>` blocked.

**IPC bridge (`src/preload/index.ts`):**

- Generic `invoke` / `on` still exists, but an **explicit allowlist** (`ALLOWED_INVOKE_CHANNELS`, `ALLOWED_EVENT_CHANNELS`) rejects any channel not in the list. A compromised renderer cannot reach an IPC channel we didn't intend to expose.

**Path confinement (`src/main/services/path-guard.ts`):**

- `assertInsideVault(p)` / `safeInsideVault(p)` — realpath-resolves a renderer-supplied path and rejects anything outside the current vault root. Applied to every `file:*`, `folder:*`, `attachment:*`, and `history:*` IPC handler.
- `attachment:open` additionally rejects absolute paths outright (so crafted links like `[x](/Applications/Evil.app)` can't launch anything).

**Custom protocol (`vault-media://`):**

- Re-resolves the decoded path against `{vault}/vault_media/` and returns `403 Forbidden` if the result escapes — defeats percent-encoded `..` traversal (e.g. `%2F..%2F..%2Fetc%2Fpasswd`).

**URL handling:**

- `isSafeExternalUrl` allowlists `http:`, `https:`, `mailto:` only. Used by `shell:open-external`, the window-open handler, and the `will-navigate` guard.

**Tag propagation:**

- `propagateTags()` detects protected byte-ranges (YAML frontmatter, fenced code, inline code, link destinations, autolinks, bare URLs) and skips matches inside them. Takes a history snapshot of every target file before writing, so restore is always available.

**Dependency hygiene:**

- `npm audit` = 0 vulnerabilities (876 resolved packages).
- No unexpected postinstall scripts.
- Unused deps removed (`clsx`, `chokidar`, `date-fns`, `@electron-toolkit/utils`, `@electron-toolkit/preload`).

**Single-instance lock** prevents multiple app windows (side-effect caveat: a packaged Rune.app running can silently block `npm run dev` from starting a second instance).

**External links** open in the default browser, never in-app.

# Rune - TODO

## Known Issues

### Last character not saved when switching files
**Status:** On hold
**Priority:** High

When typing in the editor and immediately clicking on another file, the last typed character is sometimes lost.

**Observed behavior:**
- Typing "a" alone → saves correctly
- Typing "ab" → only "a" is saved (loses "b")
- Adding a space or newline after the last character → saves correctly

**Attempted fixes (none worked):**
1. Using refs to track content synchronously
2. Reading directly from CodeMirror via `forwardRef`/`useImperativeHandle`
3. Calling `view.observer.flush()` before reading state
4. Adding `setTimeout(0)` to defer file switch

**Root cause hypothesis:**
The issue appears to be timing-related between CodeMirror's DOM observation and when we read the state. The last keystroke may not have been processed by CodeMirror's MutationObserver when the click event triggers the file switch.

**Potential solutions to explore:**
- Listen to `beforeinput` events to capture pending input
- Use `requestAnimationFrame` instead of `setTimeout`
- Add a blur handler that saves before focus leaves
- Investigate CodeMirror's composition handling

**Possibly related fix landed** (2026-04-12): the auto-save debounce was firing against a stale `handleSave` closure, so the first keystroke after any save/open was silently dropped. `handleSave` is now ref-based (stable) and `MarkdownEditor` mirrors `onSave` into a ref. Worth re-testing the file-switch scenario — some of the reported lost-character cases may actually have been caused by the stale-closure path rather than the MutationObserver timing.

---

## Completed

- [x] Project scaffolding with electron-vite
- [x] Store & persistence layer (Zustand)
- [x] IPC type system
- [x] Theme system + three-panel layout
- [x] Vault selection & file tree
- [x] CodeMirror 6 markdown editor
- [x] Document stats (word count, reading time)
- [x] Welcome modal for first-time vault selection
- [x] File tree with collapsible folders
- [x] Resizable sidebars
- [x] Dark/light theme toggle (persisted)
- [x] Auto-save with 1s debounce
- [x] Manual save with Cmd+S
- [x] New note creation
- [x] New folder creation (with InputModal)
- [x] Single instance lock (prevent multiple Electron windows)
- [x] System fonts (removed Google Fonts for offline support)
- [x] File tree loads on startup
- [x] Persisted folder expand/collapse state across restarts
- [x] Documentation folder (`docs/`) with ARCHITECTURE, DEPENDENCIES, TODO
- [x] Inline markdown rendering — hide marks on inactive lines (Obsidian-style live preview)
- [x] Folder context menu: "New Note" and "New Folder" targeting the clicked folder
- [x] Drag-and-drop attachments into the editor — copies files to `{vault}/vault_media/` and inserts markdown link/image syntax
- [x] Inline image rendering via custom `vault-media://` protocol + CodeMirror widget decorations
- [x] Dedicated "Media files" section in the left sidebar (separated from regular notes)
- [x] Fix stale-closure bug where first keystroke after save wasn't auto-saved (ref-based `handleSave`)
- [x] Save eagerly on window blur / visibility hidden as extra data-loss insurance
- [x] Right sidebar parity with left: same 200–400px resize range, nearly-black background, visible by default
- [x] Sidebar toggle icons in the status bar (both left and right), state persists
- [x] Window size + on-screen position persisted to `~/.rune/window-state.json`
- [x] Increase editor + title horizontal padding so text has breathing room when sidebars are at max
- [x] Fix sidebar widths reverting to default on Cmd+R reload (sync local state to store after IPC hydration)
- [x] Full `npm audit` pass — Electron 41, React 19, TS 6; 0 vulnerabilities (was 24)
- [x] Hashtag-based internal linking — `#tag` in editor styled as clickable, in-memory tag index on main process tracks declarations + weak (plain-text) mentions across the vault
- [x] Relations section in right sidebar — per-tag list of "Also tagged" + "Mentioned" related notes, live-updates as files save/create/delete/rename
- [x] Automatic tag propagation — when a file saved with `#Tag` contains 3+ characters, the service inserts `#` before the first untagged occurrence of the tag word in every other file in the vault (word-boundary, case-insensitive, skips files that already contain the tag anywhere)
- [x] Per-(file, tag) relation group expand/collapse state persisted so choices survive file switches and restarts (default collapsed)
- [x] Two top-level collapsible right-sidebar sections — Document Info (default collapsed) + Relations (default expanded); globally-remembered state via `store:set-section-expanded`
- [x] Tag regex excludes pure-digit tokens — hex colors like `#000000` no longer register as tags
- [x] Per-file manual history snapshots (max 10, pruned on overflow) with Save / Restore / Delete UI in a new right-sidebar History section; snapshots stored at `{vault}/.rune/history/{path}/{id}.md`
- [x] Full-text search across vault — magnifying-glass icon in sidebar header + ⌘K shortcut opens an in-sidebar search panel with Filenames / Matches groups, highlighted snippets, click-to-open. Reuses the tag service's content cache so each keystroke is an in-memory lookup.
- [x] **Security hardening (3-pass audit)** — spawned security-auditor + pentester + dependency-manager agents in parallel; found several Critical issues; closed all of them:
  - P1 (Critical): Path-traversal fixes — `assertInsideVault`/`safeInsideVault` guard on every `file:*`, `folder:*`, `attachment:*`, and `history:*` IPC handler. `vault-media://` protocol resolves against `vault_media/` root with explicit prefix check. `shell:open-external` allowlists http/https/mailto only. `attachment:open` rejects absolute paths.
  - P2 (High): Preload channel allowlist (renderer can no longer reach arbitrary IPC channels). `propagateTags` now detects protected ranges (code fences, inline code, link destinations, frontmatter, URLs) and skips matches inside them; also snapshots every target file before writing so restore is always possible. `attachment:save` rejects symlinks + non-regular files + uses `path.basename` for cross-platform correctness.
  - P3 (Defense-in-depth): Tightened CSP (`object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'`). Enabled `sandbox: true` + `webviewTag: false`. Added `will-navigate` guard. Concurrency cap on `ai:chat-start`. Removed unused camera/mic entitlements + placeholder publish URL + unused `clsx` dep.
- [x] **Tag Constellation** — ⌘⇧G opens a force-directed graph of every tag in the vault. Nodes sized by note count, edges between tags that co-occur in at least one note, edge thickness = shared-notes count. Hover to highlight connections; click a tag to open a side drawer listing its notes; click a note to jump there. Uses `d3-force` for layout, pure-SVG rendering with drag + pan + zoom.
- [x] Fix LeftSidebar hook-order crash when collapsing (rules of hooks violation — guard between hooks)
- [x] Local AI chat via Ollama — new AI Chat section in the right sidebar streams responses from a local Ollama model; system prompt injects the current document via `{{document}}`; model + prompt editable in Settings → AI; cancel / clear / error-handled
- [x] Markdown rendering in chat bubbles via react-markdown + remark-gfm (bold, italic, lists, code, tables, etc.)
- [x] Right sidebar font-size audit — replaced pixel literals (`text-[10px]`, `text-[11px]`) with rem-based Tailwind classes so the Settings → Appearance font-size scales the whole sidebar consistently. Primary content (chat messages, file lists, snapshot rows, "Save snapshot" button) bumped from `text-xs` to `text-sm` for readability.

## Future Enhancements

- [ ] GFM table rendering (replace raw `|` pipe text with proper table layout via widget decorations)
- [ ] Tags and metadata
- [ ] Backlinks / wiki-style linking
- [ ] Templates for folders
- [ ] Export to PDF/HTML
- [ ] Keyboard shortcuts panel
- [ ] Recent files list

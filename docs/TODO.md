# Arbetsyta - TODO

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
- [x] Window size + on-screen position persisted to `~/.arbetsyta/window-state.json`
- [x] Increase editor + title horizontal padding so text has breathing room when sidebars are at max
- [x] Fix sidebar widths reverting to default on Cmd+R reload (sync local state to store after IPC hydration)
- [x] Full `npm audit` pass — Electron 41, React 19, TS 6; 0 vulnerabilities (was 24)

## Future Enhancements

- [ ] GFM table rendering (replace raw `|` pipe text with proper table layout via widget decorations)
- [ ] Search across vault
- [ ] Tags and metadata
- [ ] Backlinks / wiki-style linking
- [ ] Templates for folders
- [ ] Export to PDF/HTML
- [ ] Keyboard shortcuts panel
- [ ] Recent files list

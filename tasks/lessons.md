# Lessons Learned

Rules to prevent repeat mistakes. Review at session start.

---

## 1. Always broadcast IPC state changes to the renderer

**When**: Adding a new `store:*` IPC handler that mutates persisted state.

**Mistake**: The `store:toggle-folder-expanded` handler updated the main process store but didn't call `win.webContents.send('store:state-changed', ...)`. The renderer never received the update, so folder expand/collapse didn't work.

**Rule**: After `mainStore.getState().someAction()`, always broadcast the changed slice to all windows. Copy the pattern from `store:set-theme` or `store:set-accent-color`.

**Pattern**:
```typescript
ipcMain.handle('store:some-action', async (_, arg) => {
  mainStore.getState().someAction(arg)
  const updatedValue = mainStore.getState().ui.someField // or settings.*
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('store:state-changed', {
      ui: { someField: updatedValue }   // or settings: { ... }
    })
  })
})
```

---

## 2. Register custom Electron protocols before `app.whenReady()`

**When**: Adding a custom URL scheme (e.g. `vault-media://`) to load local files in the renderer.

**Rule**: Call `protocol.registerSchemesAsPrivileged([...])` at module top level (synchronously at startup), then call `protocol.handle(...)` inside the `app.whenReady()` callback. If you register the scheme after app ready, it won't be treated as secure/standard and the renderer may refuse to load it (CORS, mixed-content, or "not a registered protocol" errors).

**Pattern**:
```typescript
// Top of main/index.ts, before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'my-scheme', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

app.whenReady().then(() => {
  protocol.handle('my-scheme', (req) => { ... })
})
```

---

## 3. Main-process code changes need a full dev server restart

**When**: Editing files under `src/main/` or `src/preload/`.

**Mistake**: Assumed Vite HMR would pick up main-process edits. It doesn't — HMR only applies to the renderer. Main-process changes require killing and restarting `npm run dev`.

**Rule**: After changing main or preload code, kill the dev server and restart it. If an orphan Electron window survives from the previous session, the single-instance lock can block the next boot — `pkill -9 -f "Electron.app"` clears it.

---

## 4. Debounced callbacks must read the latest state via refs, not closure

**When**: Scheduling work (auto-save, debounced side effects) from inside a React callback that depends on state.

**Mistake**: `handleSave` in `App.tsx` had deps `[currentFile, content, isDirty, writeFile]` and checked `if (!isDirty) return`. The debounce timer in `MarkdownEditor` captured whichever `onSave` existed at the moment of the *current* keystroke — which was the `handleSave` from the *pre-update* render where `isDirty` was still `false`. When the timer fired 1 second later, the stale closure bailed out and the edit was never saved. First keystroke after each save/open silently dropped.

**Rule**: If a callback is scheduled asynchronously (setTimeout, requestAnimationFrame, setInterval), don't rely on closure-captured state. Either:
- Make the callback stable (empty/minimal deps) and read current values from refs, or
- Mirror the callback itself into a ref (`onSaveRef.current = onSave`) and call `onSaveRef.current()` from the timer.

**Pattern**:
```typescript
// App-level: callback is stable, state reads via refs
const handleSave = useCallback(async () => {
  const path = currentFileRef.current
  if (!path || !isDirtyRef.current) return
  await writeFile(path, contentRef.current)
  isDirtyRef.current = false
  setIsDirty(false)
}, [writeFile])

// Consumer: mirror prop into ref so timers always hit the latest
const onSaveRef = useRef(onSave)
useEffect(() => { onSaveRef.current = onSave }, [onSave])
setTimeout(() => onSaveRef.current?.(), 1000)
```

---

## 5. CodeMirror HighlightStyle uses inline properties, not CSS classes

**When**: Styling markdown tokens (headings, bold, links, etc.) in CodeMirror 6.

**Mistake**: Used `class: 'cm-header-1'` in `HighlightStyle.define()` and defined `.cm-header-1` in `EditorView.theme()`. But `EditorView.theme()` scopes class names, so the generated `.cm-header-1` in the theme didn't match the literal `cm-header-1` the highlighter expected.

**Rule**: Use inline style properties directly on HighlightStyle entries (`fontSize`, `fontWeight`, `color`, etc.). Don't use `class:` to reference classes defined in `EditorView.theme()`.

**Pattern**:
```typescript
// Correct
{ tag: t.heading1, fontSize: '1.9em', fontWeight: '700', color: '...' }

// Wrong — class won't match the scoped theme selector
{ tag: t.heading1, class: 'cm-header-1' }
```

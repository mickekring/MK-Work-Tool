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

---

## 6. `useState(propValue)` freezes the initializer — sync with useEffect

**When**: Mirroring a prop (or store-derived value) into local state for
fast, optimistic updates while still reflecting upstream changes.

**Mistake**: `AppLayout` did `const [leftWidth, setLeftWidth] = useState(ui.leftSidebarWidth)` so drags felt instant. But the initializer only runs on first mount — which happens *before* the IPC hydration returns the real persisted width. After Cmd+R the sidebar reverted to whatever default was in `useStore`'s initial state (280), even though the persisted state was 400. Same risk for any "boot with default, hydrate from IPC" flow.

**Rule**: When local state mirrors a prop or store value that may change after mount, pair `useState(initial)` with a `useEffect` that re-syncs on change. The useEffect runs after render, so the store's hydrated value always propagates down.

**Pattern**:
```typescript
const [width, setWidth] = useState(ui.sidebarWidth)
useEffect(() => {
  setWidth(ui.sidebarWidth)
}, [ui.sidebarWidth])
```

Don't just read `ui.sidebarWidth` directly in the render — that re-renders on every drag-triggered store update and kills the snappy local-drag feel.

---

## 7. Never put an early return between hooks

**When**: Any component with `if (...) return null` guards.

**Mistake**: `LeftSidebar` had eight `useState` calls, then `if (!isVisible) return null`, then a `useCallback` further down. When the sidebar toggled from visible to hidden, React called only the 8 `useState`s; when it toggled back visible, it called 9 hooks. React's "rules of hooks" tripwire fired with "Rendered fewer hooks than expected" and the whole sidebar tree crashed, blanking the app.

**Rule**: ALL hook calls (`useState`, `useCallback`, `useEffect`, `useRef`, `useMemo`, custom hooks) must run on every render in the same order. The early-return guard must come **after** the last hook in the function body, or be moved to the parent (conditionally render the component instead).

**Pattern**:
```typescript
// Correct — all hooks first, then the guard, then JSX.
function Component({ isVisible, ... }) {
  const [a, setA] = useState(...)
  const handler = useCallback(..., [])
  if (!isVisible) return null
  return <div>...</div>
}

// Wrong — guard between hooks changes hook count per render.
function Component({ isVisible, ... }) {
  const [a, setA] = useState(...)
  if (!isVisible) return null
  const handler = useCallback(..., []) // sometimes runs, sometimes not
  return <div>...</div>
}
```

---

## 8. A packaged copy of Rune will silently block `npm run dev`

**When**: Developing Rune after having installed the packaged `.app` via `npm run build:mac-arm`.

**Mistake**: Spent a full debug session convinced that my security-hardening changes (sandbox, will-navigate, protocol rework) had broken the dev server. Every `npm run dev` reached "starting electron app…" and then exited cleanly with no error; the Electron process never showed up in `ps`. Rolled back change after change — all innocent. The actual cause: the packaged `/Applications/Rune.app` the user had launched earlier was still running, holding the single-instance lock in `src/main/index.ts`. Our own code (`if (!gotTheLock) app.quit()`) told every new dev-server Electron to exit immediately — cleanly, silently, no error.

**Rule**: If `npm run dev` exits straight after "starting electron app…" and leaves no stderr, the very first thing to check is whether another Rune is already running:

```bash
ps aux | grep "Rune.app/Contents/MacOS/Rune" | grep -v grep
```

Not Electron from the dev tree — packaged Rune. Same bundle identifier → same single-instance lock → silent quit.

**Fix**: Kill the packaged app first. If we want to make this obviously-diagnosable in the future, emit a visible log line from the `if (!gotTheLock)` branch of `src/main/index.ts`:

```typescript
if (!gotTheLock) {
  console.error('Another instance of Rune is already running — quitting.')
  app.quit()
}
```

Second-order lesson: `./node_modules/.bin/electron ./out/main/index.js` run from a VS Code integrated terminal runs as **Node**, not Electron, because VS Code sets `ELECTRON_RUN_AS_NODE=1`. `require('electron')` then returns the *path string* to the binary, not the API, so `electron.protocol` is `undefined`. The `npm run dev` script unsets that variable for you; direct invocations need `unset ELECTRON_RUN_AS_NODE &&` prepended.

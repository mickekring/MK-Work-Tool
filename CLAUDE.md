# Rune - Claude Code Project Guide

## Project Overview
Rune is a local-first, Electron-based personal workspace app for markdown notes and project management. It features a three-panel layout with live inline markdown rendering (Obsidian-style).

## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement
- After ANY correction from the user: update 'tasks/lessons.md"
with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness


### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous bug-fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management
1. **Plan First**: Write plan to "tasks/todo.md" with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to "tasks/todo.md"
6. **Capture Lessons**: Update 'tasks/lessons.md' after corrections

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **Docs Live in `docs/`**: All project documentation lives in the `docs/` folder — never scatter docs at the repo root. Always **read** the relevant doc before making related changes, and **update** it immediately after. Stale docs are worse than no docs. See [Documentation](#documentation) below for the canonical file list.
- **Verify Latest Versions**: Never trust training data for dependency versions. Before installing or recommending any dependency, verify the current stable release via web search, `npm info <pkg> version`, `bun outdated`, or similar tools. Applies to packages, runtimes, databases, and Dockerfile base images. This matters for both staying current and security.
- **Commit Regularly**: Commit and push after completing each feature or meaningful chunk of work. Don't let uncommitted work pile up. Use descriptive commit messages that explain *what* and *why*.

## Documentation

All long-form project documentation lives in `docs/`. This is the single source of truth — **read before changing, update after changing**. Do not create new docs outside this folder.

- **[README.md](README.md)** — User-facing overview (features, getting started, build). Update the features list whenever user-visible functionality is added, changed, or removed. This is what people see on GitHub; keep it accurate.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — System architecture, state model, IPC design, persistence. Update when process model, state shape, IPC channels, or directory layout changes.
- **[docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)** — All packages with spec + installed version, runtime environment. Update when adding, removing, or upgrading any dependency.
- **[docs/TODO.md](docs/TODO.md)** — Known issues, in-progress work, future enhancements. Update when starting new work, finding a bug, or completing a feature.

If you add a new doc (design decisions, feature specs, debugging notes), create it inside `docs/` and link it from this list.


## Tech Stack
- **Framework**: Electron + React 18 + TypeScript
- **Build Tool**: electron-vite 2.3.0 + Vite 5.4
- **Styling**: TailwindCSS 4 with CSS custom properties
- **State**: Zustand (vanilla store in main process, React hooks in renderer)
- **Editor**: CodeMirror 6 with custom markdown extensions
- **IPC**: Type-safe channels with typed handlers

## Project Structure
```
src/
├── main/                    # Electron main process
│   ├── index.ts            # Entry point, window creation
│   ├── ipc/handlers.ts     # IPC handler registration
│   ├── services/           # File, settings, vault services
│   └── store/              # Main process Zustand store
├── preload/
│   ├── index.ts            # contextBridge API exposure
│   └── index.d.ts          # Type declarations for window.api
├── renderer/src/           # React application
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   └── layout/         # AppLayout, sidebars, status bar
│   ├── hooks/useStore.ts   # Store hooks for renderer
│   └── styles/globals.css  # Theme variables, base styles
└── shared/types/           # Shared type definitions
    ├── store.ts            # Store state types
    ├── ipc.ts              # IPC channel types
    └── index.ts            # Re-exports
```

## Key Commands
```bash
npm run dev          # Start dev server (with ELECTRON_RUN_AS_NODE fix)
npm run build        # Build for production
npm run build:mac    # Build macOS app
```

## Important Notes

### VS Code Terminal Fix
When running from VS Code's terminal, `ELECTRON_RUN_AS_NODE=1` is set (VS Code is Electron-based). The dev script includes `unset ELECTRON_RUN_AS_NODE &&` to fix this.

### Native Title Bar
Uses `titleBarStyle: 'hiddenInset'` with traffic lights. Left sidebar has 52px top padding to accommodate.

### State Architecture
- **Main process**: Holds authoritative Zustand store, persists to `~/.rune/`
- **Renderer**: Gets state via IPC, receives updates via events
- **File content**: NOT stored in state - read on demand from disk

### Theme System
CSS custom properties in `globals.css`. Toggle between dark/light by adding/removing `.light` class on document root.

### IPC Channels
All channels defined in `src/shared/types/ipc.ts`:
- `dialog:*` - Native dialogs
- `file:*` - File operations
- `folder:*` - Folder operations
- `vault:*` - Vault management
- `store:*` - State sync

## Current Status

See [docs/TODO.md](docs/TODO.md) for the current feature list, known issues, and roadmap. That file is the source of truth — don't duplicate it here.

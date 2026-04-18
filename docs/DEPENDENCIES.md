# Arbetsyta - Dependencies

> Last updated: 2026-04-06

## Runtime Environment

| Tool | Version |
|------|---------|
| Node.js | 24.13.1 |
| npm | 11.8.0 |

## Production Dependencies

| Package | Spec | Installed | Purpose |
|---------|------|-----------|---------|
| electron | ^32.0.0 | 32.3.3 | Desktop app framework |
| react | ^18.3.0 | 18.3.1 | UI library |
| react-dom | ^18.3.0 | 18.3.1 | React DOM renderer |
| zustand | ^5.0.0 | 5.0.9 | State management |
| @codemirror/autocomplete | ^6.18.0 | 6.20.0 | Editor autocomplete |
| @codemirror/commands | ^6.7.0 | 6.10.1 | Editor keybindings/commands |
| @codemirror/lang-markdown | ^6.3.0 | 6.5.0 | Markdown language support |
| @codemirror/language | ^6.10.0 | 6.12.1 | Language infrastructure |
| @codemirror/language-data | ^6.5.0 | 6.5.2 | Language data for code blocks |
| @codemirror/state | ^6.4.0 | 6.5.3 | Editor state management |
| @codemirror/view | ^6.35.0 | 6.39.8 | Editor view/DOM layer |
| @lezer/highlight | ^1.2.0 | 1.2.3 | Syntax highlighting |
| @lezer/markdown | ^1.3.0 | 1.6.2 | Markdown parser |
| @electron-toolkit/preload | ^3.0.1 | 3.0.2 | Preload script utilities |
| @electron-toolkit/utils | ^3.0.0 | 3.0.0 | Electron utility helpers |
| clsx | ^2.1.0 | 2.1.1 | Conditional classnames |
| date-fns | ^4.1.0 | 4.1.0 | Date formatting (not yet used) |
| chokidar | ^4.0.0 | 4.0.3 | File watching (not yet used) |

## Dev Dependencies

| Package | Spec | Installed | Purpose |
|---------|------|-----------|---------|
| electron-vite | ^2.3.0 | 2.3.0 | Build tooling for Electron + Vite |
| vite | ^5.4.0 | 5.4.21 | Frontend bundler |
| typescript | ^5.7.0 | 5.9.3 | Type checking |
| tailwindcss | ^4.0.0 | 4.1.18 | Utility-first CSS |
| @tailwindcss/vite | ^4.0.0 | 4.1.18 | Tailwind Vite plugin |
| @vitejs/plugin-react | ^4.3.0 | 4.7.0 | React Fast Refresh for Vite |
| electron-builder | ^25.1.0 | 25.1.8 | App packaging & distribution |
| eslint | ^9.15.0 | 9.39.2 | Code linting |
| eslint-plugin-react | ^7.37.0 | 7.37.5 | React-specific linting rules |
| @electron-toolkit/eslint-config-ts | ^3.0.0 | 3.1.0 | TypeScript ESLint config |
| @electron-toolkit/tsconfig | ^1.0.1 | 1.0.1 | Shared TypeScript config |
| @types/node | ^20.0.0 | 20.19.27 | Node.js type definitions |
| @types/react | ^18.3.0 | 18.3.27 | React type definitions |
| @types/react-dom | ^18.3.0 | 18.3.7 | React DOM type definitions |

## Unused Dependencies

These are installed but not currently used in the codebase:

- **chokidar** — Intended for file watching (detecting external file changes). Will be needed when implementing the `file:external-change` feature.
- **date-fns** — Date utility library. Available but no current usage.

## How to Update

```bash
# Check for outdated packages
npm outdated

# Update all within semver range
npm update

# Update a specific package
npm install <package>@latest
```

## Notes

- Electron version pins the Chromium and Node.js versions bundled in the app. Electron 32 ships with Chromium 128 and Node 20.18.
- CodeMirror packages should generally be updated together to avoid version mismatches.
- Tailwind CSS 4 uses the new `@theme` directive and Vite plugin (no PostCSS config needed).

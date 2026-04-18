# Arbetsyta - Dependencies

> Last updated: 2026-04-12 — after full audit pass (0 vulnerabilities).

## Runtime Environment

| Tool | Version | Notes |
|------|---------|-------|
| Node.js (dev tools) | 24.13.1 | Used only for build/lint/dev server |
| npm | 11.8.0 | Package manager |
| Node.js (Electron runtime) | 24.14.1 | Bundled inside Electron 41 |
| Chromium (Electron runtime) | ~138 | Bundled inside Electron 41 |

## Production Dependencies

| Package | Spec | Installed | Purpose |
|---------|------|-----------|---------|
| react | ^19.2.5 | 19.2.5 | UI library |
| react-dom | ^19.2.5 | 19.2.5 | React DOM renderer |
| zustand | ^5.0.12 | 5.0.12 | State management (main + renderer) |
| @codemirror/autocomplete | ^6.20.1 | 6.20.1 | Editor autocomplete |
| @codemirror/commands | ^6.10.3 | 6.10.3 | Editor keybindings/commands |
| @codemirror/lang-markdown | ^6.3.0 | 6.5.0 | Markdown language support |
| @codemirror/language | ^6.12.3 | 6.12.3 | Language infrastructure |
| @codemirror/language-data | ^6.5.0 | 6.5.2 | Language data for code blocks |
| @codemirror/state | ^6.6.0 | 6.6.0 | Editor state management |
| @codemirror/view | ^6.41.0 | 6.41.0 | Editor view / DOM layer |
| @lezer/highlight | ^1.2.0 | 1.2.3 | Syntax highlighting tags |
| @lezer/markdown | ^1.6.3 | 1.6.3 | Markdown parser |
| clsx | ^2.1.0 | 2.1.1 | Conditional classnames |

## Dev Dependencies

| Package | Spec | Installed | Purpose |
|---------|------|-----------|---------|
| electron | ^41.2.1 | 41.2.1 | Desktop runtime (Chromium 138 + Node 24) |
| electron-vite | ^5.0.0 | 5.0.0 | Build tooling for Electron + Vite |
| electron-builder | ^26.8.1 | 26.8.1 | App packaging & distribution |
| vite | ^7.3.2 | 7.3.2 | Frontend bundler (pinned to 7 — electron-vite 5 caps) |
| typescript | ^6.0.3 | 6.0.3 | Type checking |
| tailwindcss | ^4.2.2 | 4.2.2 | Utility-first CSS |
| @tailwindcss/vite | ^4.2.2 | 4.2.2 | Tailwind Vite plugin |
| @vitejs/plugin-react | ^5.2.0 | 5.2.0 | React Fast Refresh for Vite (pinned to 5 — plugin-react 6 needs vite 8) |
| eslint | ^9.39.4 | 9.39.4 | Code linting (pinned to 9 — eslint-plugin-react 7 caps) |
| eslint-plugin-react | ^7.37.0 | 7.37.5 | React-specific linting rules |
| @electron-toolkit/eslint-config-ts | ^3.0.0 | 3.1.0 | TypeScript ESLint config |
| @electron-toolkit/tsconfig | ^2.0.0 | 2.0.0 | Shared TypeScript config |
| @types/node | ^24.12.2 | 24.12.2 | Node.js type definitions (matches Electron's Node 24) |
| @types/react | ^19.2.14 | 19.2.14 | React 19 type definitions |
| @types/react-dom | ^19.2.3 | 19.2.3 | React DOM type definitions |

## Version Pins (can't go to latest yet — compatibility)

- **`vite` pinned to `^7`** — `electron-vite@5` peer-requires vite 5/6/7, not 8. Bump both together when electron-vite releases vite-8 support.
- **`@vitejs/plugin-react` pinned to `^5.2`** — version 6 needs vite 8.
- **`eslint` pinned to `^9`** — `eslint-plugin-react@7.37` (latest) peer-requires eslint ≤9. Bump both together when the plugin supports eslint 10.

## How to Update

```bash
# Vulnerability scan
npm audit

# See what's outdated
npm outdated

# Safe, non-breaking fixes
npm audit fix

# Update a specific package to latest
npm install <package>@latest --save                 # prod
npm install <package>@latest --save-dev             # dev

# After any update, always run these before committing:
npx electron-vite build
npm run typecheck
```

## Notes

- **Electron version pins the Chromium + Node runtime** bundled in the packaged app. Electron 41 ships Chromium ~138 and Node 24.x, so we match `@types/node` to `^24`.
- **CodeMirror packages should update together** — they share internal versioning and mismatches cause subtle bugs.
- **Tailwind CSS 4** uses the `@theme` directive and the official `@tailwindcss/vite` plugin (no PostCSS config).
- **`@electron-toolkit/preload` and `@electron-toolkit/utils` were removed** on 2026-04-12 — we don't use them and they were pulling transitive vulnerabilities.
- **`chokidar` and `date-fns` were removed** on the same pass — reserved for future features but not yet imported; better to add back when actually needed.

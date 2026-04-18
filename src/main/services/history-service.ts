import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmdirSync
} from 'fs'
import { join, relative, sep } from 'path'
import type { FileHistory, SnapshotMeta } from '@shared/types/history'
import { HISTORY_MAX_SNAPSHOTS } from '@shared/types/history'

import { APP_DIR_NAME } from './settings-service'

const HISTORY_DIR_NAME = APP_DIR_NAME
const HISTORY_SUBDIR = 'history'

// Track the vault lazily so this service doesn't need to be reset on
// vault switch — the caller just passes vaultPath where needed.
interface Ctx {
  vaultPath: string | null
}
const ctx: Ctx = { vaultPath: null }

function setVaultPath(path: string | null): void {
  ctx.vaultPath = path
}

function requireVault(): string | null {
  return ctx.vaultPath
}

// Translate an absolute file path (inside the vault) to its mirrored
// history directory. For `/vault/Projekt/NIP.md` with vault=`/vault`,
// returns `/vault/.arbetsyta/history/Projekt/NIP.md`.
function historyDirFor(filePath: string): string | null {
  const vault = requireVault()
  if (!vault) return null
  if (!filePath.startsWith(vault)) return null
  const rel = relative(vault, filePath)
  // Reject anything that escapes the vault with `..`
  if (rel.startsWith('..') || rel === '') return null
  return join(vault, HISTORY_DIR_NAME, HISTORY_SUBDIR, rel)
}

// Snapshot ids are timestamp-derived and filename-safe on all OSes.
function makeSnapshotId(ts = Date.now()): string {
  const d = new Date(ts)
  // 2026-04-18T14-23-56-123Z
  return d.toISOString().replace(/[:.]/g, '-')
}

function parseSnapshotTimestamp(id: string): number {
  // Reverse makeSnapshotId. e.g. "2026-04-18T14-23-56-123Z"
  // Restore colons and the last "-" before Z → "."
  // Safest: parse the parts explicitly.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(
    id
  )
  if (!match) return 0
  const [, y, mo, d, h, mi, s, ms] = match
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms)
}

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
}

function listSnapshotFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir).filter((n) => n.endsWith('.md'))
  } catch {
    return []
  }
}

export const historyService = {
  setVaultPath,

  /**
   * Create a new snapshot for the file. Reads current on-disk content,
   * writes it to the history directory, and prunes older snapshots
   * beyond HISTORY_MAX_SNAPSHOTS.
   */
  createSnapshot(filePath: string): SnapshotMeta | null {
    const dir = historyDirFor(filePath)
    if (!dir) return null
    if (!existsSync(filePath)) return null

    try {
      const content = readFileSync(filePath, 'utf-8')
      ensureDir(dir)

      const id = makeSnapshotId()
      const snapshotPath = join(dir, `${id}.md`)
      writeFileSync(snapshotPath, content, 'utf-8')

      // Prune oldest beyond the cap
      const all = listSnapshotFiles(dir)
        .map((name) => ({
          name,
          id: name.replace(/\.md$/, ''),
          timestamp: parseSnapshotTimestamp(name.replace(/\.md$/, ''))
        }))
        .sort((a, b) => b.timestamp - a.timestamp)

      if (all.length > HISTORY_MAX_SNAPSHOTS) {
        for (const entry of all.slice(HISTORY_MAX_SNAPSHOTS)) {
          try {
            unlinkSync(join(dir, entry.name))
          } catch {
            /* best-effort */
          }
        }
      }

      const stats = statSync(snapshotPath)
      return { id, timestamp: parseSnapshotTimestamp(id), size: stats.size }
    } catch (error) {
      console.error(`history: failed to snapshot ${filePath}`, error)
      return null
    }
  },

  /**
   * List snapshots for a file, newest first.
   */
  list(filePath: string): FileHistory {
    const dir = historyDirFor(filePath)
    if (!dir || !existsSync(dir)) {
      return { filePath, snapshots: [] }
    }

    const snapshots: SnapshotMeta[] = []
    for (const name of listSnapshotFiles(dir)) {
      const id = name.replace(/\.md$/, '')
      const timestamp = parseSnapshotTimestamp(id)
      if (!timestamp) continue
      let size = 0
      try {
        size = statSync(join(dir, name)).size
      } catch {
        /* ignore */
      }
      snapshots.push({ id, timestamp, size })
    }

    snapshots.sort((a, b) => b.timestamp - a.timestamp)
    return { filePath, snapshots }
  },

  /**
   * Restore the file to the snapshot's content. Overwrites the file
   * and returns the new content so the renderer can update state.
   */
  restore(
    filePath: string,
    snapshotId: string
  ): { content: string } | null {
    const dir = historyDirFor(filePath)
    if (!dir) return null
    const snapshotPath = join(dir, `${snapshotId}.md`)
    if (!existsSync(snapshotPath)) return null

    try {
      const content = readFileSync(snapshotPath, 'utf-8')
      writeFileSync(filePath, content, 'utf-8')
      return { content }
    } catch (error) {
      console.error(
        `history: failed to restore ${filePath} from ${snapshotId}`,
        error
      )
      return null
    }
  },

  /**
   * Remove a single snapshot.
   */
  deleteSnapshot(filePath: string, snapshotId: string): boolean {
    const dir = historyDirFor(filePath)
    if (!dir) return false
    const snapshotPath = join(dir, `${snapshotId}.md`)
    if (!existsSync(snapshotPath)) return false
    try {
      unlinkSync(snapshotPath)
      // Clean up the file's dir if now empty, and any empty parent
      // dirs up to .arbetsyta/history to keep the tree tidy.
      let cur = dir
      const stopAt = join(
        requireVault() ?? '',
        HISTORY_DIR_NAME,
        HISTORY_SUBDIR
      )
      while (cur !== stopAt && cur.length > stopAt.length) {
        try {
          const entries = readdirSync(cur)
          if (entries.length > 0) break
          rmdirSync(cur)
          cur = cur.substring(0, cur.lastIndexOf(sep))
        } catch {
          break
        }
      }
      return true
    } catch {
      return false
    }
  }
}

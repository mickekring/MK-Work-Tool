// Per-file manual snapshot history. Stored under
// {vault}/.arbetsyta/history/{relative-path}/{id}.md on disk.

export interface SnapshotMeta {
  // Filename-safe ISO-ish identifier (e.g. "20260418T142356-123Z").
  // Also the snapshot file's basename (without the .md extension).
  id: string
  // Milliseconds since epoch.
  timestamp: number
  // File size in bytes, for display.
  size: number
}

export interface FileHistory {
  filePath: string
  snapshots: SnapshotMeta[] // newest first
}

// Hard cap on kept snapshots per file. Older snapshots are pruned.
export const HISTORY_MAX_SNAPSHOTS = 10

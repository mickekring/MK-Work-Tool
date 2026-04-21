import {
  existsSync,
  readFileSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync
} from 'fs'

// Write file helpers tuned for cloud-sync friendliness (pCloud, OneDrive,
// iCloud, Proton Drive, Dropbox, Syncthing, …).
//
// Two properties matter:
//   1) Skip writes when content is unchanged — every no-op write is a
//      chance for a sync daemon to race the next real save and produce
//      a "conflicted copy". Fewer writes = fewer conflict windows.
//   2) fsync before releasing the file — some sync daemons (especially
//      FSEvents-driven ones on macOS) read the file as soon as they see
//      a write event. If the kernel still has our bytes in the page
//      cache they can briefly observe a partial file. fsync forces
//      those bytes to stable storage before close.
//
// We do NOT write to a temp file + rename. That pattern is the "safe"
// default for crash-resilience but breaks badly with iCloud (which
// rewrites inodes on rename) and pCloud (which treats rename as
// delete+create, producing duplicate uploads). Direct overwrite is
// better behaved on every sync service we target.

function writeWithFsync(path: string, content: string): void {
  const fd = openSync(path, 'w')
  try {
    writeSync(fd, content, 0, 'utf-8')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

/**
 * Write `content` to `path` only if the file's current on-disk content
 * differs. Returns true if the write actually happened, false if it was
 * skipped as a no-op.
 *
 * Use this for any write that targets a user-editable vault file.
 */
export function safeWriteFile(path: string, content: string): boolean {
  if (existsSync(path)) {
    try {
      const current = readFileSync(path, 'utf-8')
      if (current === content) return false
    } catch {
      // If we can't read the existing file for any reason, fall through
      // and attempt the write — losing a sync-friendliness guarantee is
      // better than silently refusing to save.
    }
  }
  writeWithFsync(path, content)
  return true
}

/**
 * Write `content` to `path` unconditionally, but still via fsync.
 *
 * Use this for writes that must land even if content appears identical
 * (e.g. we deliberately want to bump mtime) or for internal files that
 * aren't expected to be cloud-synced.
 */
export function safeWriteFileUnguarded(path: string, content: string): void {
  writeWithFsync(path, content)
}

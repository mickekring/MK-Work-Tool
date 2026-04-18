import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import type {
  FileRelations,
  TagIndexSnapshot,
  TagRelations
} from '@shared/types/tags'

// #Tag recognition rules:
// - Preceded by start-of-line or a non-word/non-hash character (avoids
//   matching inside email addresses, URLs, or double-hash patterns).
// - At least 2 characters to avoid single-letter noise.
// - Unicode letter/digit support so Swedish words with å/ä/ö work.
const TAG_REGEX = /(?<=^|[^\w#])#([\p{L}\p{N}_-]{2,})/gu

// Index state lives as a module-level singleton on the main process.
interface IndexState {
  // tag (lowercase) -> absolute file paths that explicitly contain #tag
  filesByTag: Map<string, Set<string>>
  // file path -> set of tags (lowercase) declared in that file
  tagsByFile: Map<string, Set<string>>
  // file path -> original-case display for the first-seen form of each tag
  displayByTag: Map<string, string>
  // file path -> raw file content (cached for mention searching)
  contentByFile: Map<string, string>
  vaultPath: string | null
}

const state: IndexState = {
  filesByTag: new Map(),
  tagsByFile: new Map(),
  displayByTag: new Map(),
  contentByFile: new Map(),
  vaultPath: null
}

// --- private helpers ------------------------------------------------------

function extractTagsFromContent(content: string): {
  lower: Set<string>
  displayMap: Map<string, string>
} {
  const lower = new Set<string>()
  const displayMap = new Map<string, string>()
  for (const match of content.matchAll(TAG_REGEX)) {
    const raw = match[1]
    const key = raw.toLowerCase()
    lower.add(key)
    if (!displayMap.has(key)) displayMap.set(key, raw)
  }
  return { lower, displayMap }
}

function removeFileFromIndex(filePath: string): void {
  const existing = state.tagsByFile.get(filePath)
  if (existing) {
    for (const tag of existing) {
      const set = state.filesByTag.get(tag)
      if (set) {
        set.delete(filePath)
        if (set.size === 0) {
          state.filesByTag.delete(tag)
          state.displayByTag.delete(tag)
        }
      }
    }
  }
  state.tagsByFile.delete(filePath)
  state.contentByFile.delete(filePath)
}

function addFileToIndex(filePath: string, content: string): void {
  const { lower, displayMap } = extractTagsFromContent(content)
  state.contentByFile.set(filePath, content)
  state.tagsByFile.set(filePath, lower)
  for (const tag of lower) {
    let set = state.filesByTag.get(tag)
    if (!set) {
      set = new Set()
      state.filesByTag.set(tag, set)
    }
    set.add(filePath)
    const display = displayMap.get(tag)
    if (display && !state.displayByTag.has(tag)) {
      state.displayByTag.set(tag, display)
    }
  }
}

function walkMarkdownFiles(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    let stats
    try {
      stats = statSync(full)
    } catch {
      continue
    }
    if (stats.isDirectory()) {
      walkMarkdownFiles(full, out)
    } else if (stats.isFile() && name.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

// --- public API -----------------------------------------------------------

export const tagsService = {
  /**
   * Fully rebuild the index for the given vault. Runs once on vault open.
   */
  scanVault(vaultPath: string): void {
    state.filesByTag.clear()
    state.tagsByFile.clear()
    state.displayByTag.clear()
    state.contentByFile.clear()
    state.vaultPath = vaultPath

    if (!existsSync(vaultPath)) return

    const files = walkMarkdownFiles(vaultPath)
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8')
        addFileToIndex(file, content)
      } catch (error) {
        console.error(`tags: failed to read ${file}`, error)
      }
    }
  },

  /**
   * Refresh a single file in the index (after save/create).
   */
  updateFile(filePath: string, content?: string): void {
    if (!filePath.endsWith('.md')) return
    removeFileFromIndex(filePath)
    try {
      const text = content ?? readFileSync(filePath, 'utf-8')
      addFileToIndex(filePath, text)
    } catch (error) {
      // File might have been deleted between events — swallow.
      console.error(`tags: failed to update ${filePath}`, error)
    }
  },

  /**
   * Drop a file from the index (after delete).
   */
  removeFile(filePath: string): void {
    removeFileFromIndex(filePath)
  },

  /**
   * Rename: copy entry at oldPath to newPath.
   */
  renameFile(oldPath: string, newPath: string): void {
    if (oldPath.endsWith('.md')) {
      const content = state.contentByFile.get(oldPath)
      removeFileFromIndex(oldPath)
      if (content && newPath.endsWith('.md')) {
        addFileToIndex(newPath, content)
      }
    } else if (newPath.endsWith('.md')) {
      // Wasn't tracked before, is now — scan it.
      try {
        const text = readFileSync(newPath, 'utf-8')
        addFileToIndex(newPath, text)
      } catch (error) {
        console.error(`tags: failed to index renamed ${newPath}`, error)
      }
    }
  },

  /**
   * Auto-tag other files in the vault. For every tag declared in the
   * given source file, walk the other indexed files and prepend a `#`
   * to the FIRST untagged occurrence of the tag word. Files that
   * already contain the tag explicitly are left untouched.
   *
   * Only tags of 3+ characters propagate — shorter tags like `#it`
   * are too likely to produce false positives across a vault.
   *
   * Returns the list of files that were modified.
   */
  propagateTags(sourcePath: string): string[] {
    const tagsLower = state.tagsByFile.get(sourcePath)
    if (!tagsLower || tagsLower.size === 0) return []

    const modified: string[] = []
    // Snapshot so edits to state during iteration don't re-enter
    const otherFiles = Array.from(state.contentByFile.entries()).filter(
      ([path]) => path !== sourcePath
    )

    for (const tagLower of tagsLower) {
      if (tagLower.length < 3) continue
      const display = state.displayByTag.get(tagLower) ?? tagLower
      const alreadyTagged = new Set(state.filesByTag.get(tagLower) ?? [])

      // Case-insensitive, unicode-aware, word-boundary match for the
      // first un-hashed occurrence. Leading char must be start-of-input
      // or something that's neither a word char nor a `#`.
      const pattern = new RegExp(
        `(?<=^|[^\\p{L}\\p{N}_#])(${escapeRegex(display)})(?=[^\\p{L}\\p{N}_]|$)`,
        'iu'
      )

      for (const [otherPath, content] of otherFiles) {
        if (alreadyTagged.has(otherPath)) continue
        const match = pattern.exec(content)
        if (!match) continue

        const insertAt = match.index
        const newContent =
          content.slice(0, insertAt) + '#' + content.slice(insertAt)

        try {
          writeFileSync(otherPath, newContent, 'utf-8')
          removeFileFromIndex(otherPath)
          addFileToIndex(otherPath, newContent)
          modified.push(otherPath)
        } catch (error) {
          console.error(`tags: failed to propagate to ${otherPath}`, error)
        }
      }
    }

    return modified
  },

  /**
   * Snapshot suitable for IPC — all known tags + files that declare each.
   */
  getSnapshot(): TagIndexSnapshot {
    const filesByTag: Record<string, string[]> = {}
    for (const [tag, files] of state.filesByTag) {
      const display = state.displayByTag.get(tag) ?? tag
      filesByTag[display] = Array.from(files).sort()
    }
    const allTags = Object.keys(filesByTag).sort((a, b) =>
      a.localeCompare(b)
    )
    return { allTags, filesByTag }
  },

  /**
   * For the given file, return every tag it declares along with the two
   * groups of related files (strong: other tagged declarations; weak:
   * files that merely contain the tag word as plain text).
   */
  getRelations(filePath: string): FileRelations {
    const tagsLower = state.tagsByFile.get(filePath)
    if (!tagsLower || tagsLower.size === 0) {
      return { filePath, tags: [] }
    }

    const tags: TagRelations[] = []

    for (const tagLower of tagsLower) {
      const display = state.displayByTag.get(tagLower) ?? tagLower
      const declaredFiles = state.filesByTag.get(tagLower) ?? new Set()
      const taggedIn = Array.from(declaredFiles)
        .filter((p) => p !== filePath)
        .sort()

      const mentionPattern = new RegExp(
        `(?<=^|[^\\p{L}\\p{N}_])${escapeRegex(tagLower)}(?=[^\\p{L}\\p{N}_]|$)`,
        'iu'
      )
      const mentionedIn: string[] = []
      for (const [otherPath, content] of state.contentByFile) {
        if (otherPath === filePath) continue
        if (declaredFiles.has(otherPath)) continue // already strong
        if (mentionPattern.test(content)) {
          mentionedIn.push(otherPath)
        }
      }
      mentionedIn.sort()

      tags.push({ tag: display, taggedIn, mentionedIn })
    }

    tags.sort((a, b) => a.tag.localeCompare(b.tag))
    return { filePath, tags }
  }
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

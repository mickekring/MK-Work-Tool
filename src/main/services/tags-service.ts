import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync
} from 'fs'
import { join } from 'path'
import type {
  FileRelations,
  TagIndexSnapshot,
  TagRelations,
  TagGraph,
  TagGraphNode,
  TagGraphEdge
} from '@shared/types/tags'
import type { SearchHit, SearchResults } from '@shared/types/search'
import { historyService } from './history-service'
import { safeWriteFile } from './safe-write'

/**
 * Byte ranges of a markdown document where tag propagation must NOT
 * insert a `#`. Covers:
 *  - YAML frontmatter at the very top (between leading `---` markers)
 *  - Fenced code blocks (``` … ```)
 *  - Inline code (`…`)
 *  - Link destinations (`](…)`)
 *  - Bare URLs (http(s)://…) and markdown autolinks <…>
 *
 * Why this matters: without these guards a single saved note with
 * `#drop` or `#api` silently corrupts URLs, code, and frontmatter in
 * every other note in the vault.
 */
function findProtectedRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []

  // YAML frontmatter: --- at start of file, next --- on its own line
  if (content.startsWith('---\n') || content.startsWith('---\r\n')) {
    const closeIdx = content.indexOf('\n---', 3)
    if (closeIdx > 0) {
      ranges.push([0, closeIdx + 4])
    }
  }

  // Fenced code blocks. Multiline flag; match up to the matching fence.
  const fenceRegex = /^```[^\n]*\n[\s\S]*?^```/gm
  let m: RegExpExecArray | null
  while ((m = fenceRegex.exec(content)) !== null) {
    ranges.push([m.index, m.index + m[0].length])
  }

  // Inline code — backtick pairs on the same line
  const inlineCode = /`[^`\n]+`/g
  while ((m = inlineCode.exec(content)) !== null) {
    ranges.push([m.index, m.index + m[0].length])
  }

  // Markdown link destinations: `](...)`
  const linkDest = /\]\([^)\n]*\)/g
  while ((m = linkDest.exec(content)) !== null) {
    ranges.push([m.index, m.index + m[0].length])
  }

  // Autolinks: <http://...>, <user@example.com>
  const autolink = /<(?:https?:\/\/[^>\s]+|[^>\s@]+@[^>\s]+)>/g
  while ((m = autolink.exec(content)) !== null) {
    ranges.push([m.index, m.index + m[0].length])
  }

  // Bare URLs — match http(s)://… up to whitespace
  const bareUrl = /\bhttps?:\/\/\S+/g
  while ((m = bareUrl.exec(content)) !== null) {
    ranges.push([m.index, m.index + m[0].length])
  }

  return ranges
}

function isInsideProtected(
  pos: number,
  ranges: Array<[number, number]>
): boolean {
  for (const [start, end] of ranges) {
    if (pos >= start && pos < end) return true
  }
  return false
}

// #Tag recognition rules:
// - Preceded by start-of-line or a non-word/non-hash character (avoids
//   matching inside email addresses, URLs, or double-hash patterns).
// - At least 2 characters to avoid single-letter noise.
// - Must contain at least one letter — excludes hex colors like #000000
//   and numeric IDs that happen to be preceded by `#`.
// - Unicode letter/digit support so Swedish words with å/ä/ö work.
const TAG_REGEX = /(?<=^|[^\w#])#((?=[\p{L}\p{N}_-]*\p{L})[\p{L}\p{N}_-]{2,})/gu

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

      // Case-insensitive, unicode-aware, word-boundary match. `g` flag
      // so we can walk past matches that land inside protected ranges
      // (code fences, inline code, link destinations, frontmatter, URLs).
      const pattern = new RegExp(
        `(?<=^|[^\\p{L}\\p{N}_#])(${escapeRegex(display)})(?=[^\\p{L}\\p{N}_]|$)`,
        'giu'
      )

      for (const [otherPath, content] of otherFiles) {
        if (alreadyTagged.has(otherPath)) continue

        const protectedRanges = findProtectedRanges(content)
        pattern.lastIndex = 0
        let match: RegExpExecArray | null = null
        let found: RegExpExecArray | null = null
        while ((match = pattern.exec(content)) !== null) {
          if (!isInsideProtected(match.index, protectedRanges)) {
            found = match
            break
          }
        }
        if (!found) continue

        const insertAt = found.index
        const newContent =
          content.slice(0, insertAt) + '#' + content.slice(insertAt)

        try {
          // Snapshot BEFORE we overwrite so the user can recover if
          // propagation landed somewhere unexpected. createSnapshot
          // reads from disk, so it captures the pre-propagation state.
          historyService.createSnapshot(otherPath)
          safeWriteFile(otherPath, newContent)
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
   * Remove the `#` prefix from every occurrence of a tag across the
   * vault. The word itself stays — only the leading `#` is stripped —
   * so `#Sweden` becomes `Sweden`. Tag occurrences inside protected
   * ranges (frontmatter, fenced/inline code, link destinations,
   * autolinks, bare URLs) are left untouched, mirroring the protection
   * model used by `propagateTags`.
   *
   * Snapshots the file before each modification via `historyService`
   * so the change is recoverable per-file from the History panel.
   *
   * Case-insensitive: passing `Sweden`, `sweden`, or `SWEDEN` all
   * match `#Sweden`, `#sweden`, `#SWEDEN` everywhere.
   *
   * Returns the absolute paths of files that were actually modified
   * and the total number of `#` characters removed.
   */
  removeTag(tag: string): { filesModified: string[]; occurrencesRemoved: number } {
    const tagLower = tag.toLowerCase().replace(/^#/, '')
    if (!tagLower) return { filesModified: [], occurrencesRemoved: 0 }

    const filesSet = state.filesByTag.get(tagLower)
    if (!filesSet || filesSet.size === 0) {
      return { filesModified: [], occurrencesRemoved: 0 }
    }

    const filesModified: string[] = []
    let occurrencesRemoved = 0

    // Snapshot the iteration target: removeFileFromIndex / addFileToIndex
    // mutate state.filesByTag during the loop.
    const targets = Array.from(filesSet)

    for (const filePath of targets) {
      const content =
        state.contentByFile.get(filePath) ??
        (() => {
          try {
            return readFileSync(filePath, 'utf-8')
          } catch {
            return null
          }
        })()
      if (content == null) continue

      const protectedRanges = findProtectedRanges(content)
      const hashPositions: number[] = []

      // Reset lastIndex defensively — TAG_REGEX is a module-level
      // singleton with the `g` flag, so prior matchAll usage could
      // theoretically leak state if anyone ever called .exec().
      TAG_REGEX.lastIndex = 0
      for (const match of content.matchAll(TAG_REGEX)) {
        if (match[1].toLowerCase() !== tagLower) continue
        if (match.index === undefined) continue
        if (isInsideProtected(match.index, protectedRanges)) continue
        hashPositions.push(match.index)
      }

      if (hashPositions.length === 0) {
        // All occurrences were protected — drop this file from the
        // index for the tag (the file no longer "has" the deletable
        // form of the tag) by leaving content as-is and skipping the
        // write entirely.
        continue
      }

      // Build new content: copy slices around each `#` byte.
      let next = ''
      let cursor = 0
      for (const idx of hashPositions) {
        next += content.slice(cursor, idx)
        cursor = idx + 1 // skip the '#'
      }
      next += content.slice(cursor)

      try {
        historyService.createSnapshot(filePath)
        const wrote = safeWriteFile(filePath, next)
        if (!wrote) continue
        removeFileFromIndex(filePath)
        addFileToIndex(filePath, next)
        filesModified.push(filePath)
        occurrencesRemoved += hashPositions.length
      } catch (error) {
        console.error(`tags: failed to remove tag from ${filePath}`, error)
      }
    }

    return { filesModified, occurrencesRemoved }
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
  },

  /**
   * Build a tag co-occurrence graph for the vault.
   *
   * Nodes are tags; node weight is the number of notes declaring
   * that tag. Two nodes are connected when both tags appear in the
   * same note; edge weight counts how many shared notes.
   *
   * Derived entirely from the existing tagsByFile index — no extra
   * filesystem work.
   */
  getTagGraph(): TagGraph {
    const nodes: TagGraphNode[] = []
    for (const [tagLower, files] of state.filesByTag) {
      const display = state.displayByTag.get(tagLower) ?? tagLower
      nodes.push({ tag: display, count: files.size })
    }

    // Walk every file's tag set — each co-occurring pair contributes
    // 1 to the edge weight. Use a canonicalised "a|b" key so we don't
    // double-count (a,b) and (b,a).
    const edgeWeights = new Map<string, number>()
    for (const tags of state.tagsByFile.values()) {
      if (tags.size < 2) continue
      const arr = Array.from(tags).sort()
      for (let i = 0; i < arr.length; i += 1) {
        for (let j = i + 1; j < arr.length; j += 1) {
          const key = `${arr[i]}|${arr[j]}`
          edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1)
        }
      }
    }

    const edges: TagGraphEdge[] = []
    for (const [key, weight] of edgeWeights) {
      const [a, b] = key.split('|')
      const displayA = state.displayByTag.get(a) ?? a
      const displayB = state.displayByTag.get(b) ?? b
      edges.push({ source: displayA, target: displayB, weight })
    }

    // Sort for stable rendering (layout is deterministic given input
    // order under d3-force's seedable RNG)
    nodes.sort((a, b) => a.tag.localeCompare(b.tag))
    edges.sort((a, b) => {
      const k1 = a.source + '|' + a.target
      const k2 = b.source + '|' + b.target
      return k1.localeCompare(k2)
    })

    return { nodes, edges }
  },

  /**
   * Case-insensitive substring search over the vault. Reuses the
   * content cache populated by scanVault/updateFile so we don't hit
   * the filesystem per keystroke.
   *
   * Filename matches come first (a file in that group won't appear
   * again in the content group, even if its content also matches).
   */
  search(query: string, limit: number): SearchResults {
    const result: SearchResults = {
      query,
      filenameHits: [],
      contentHits: [],
      totalContentMatches: 0
    }
    const q = query.trim()
    if (!q) return result

    const qLower = q.toLowerCase()
    const qLen = q.length
    const vaultPath = state.vaultPath ?? ''

    const makeRelative = (p: string): string =>
      vaultPath && p.startsWith(vaultPath + '/')
        ? p.slice(vaultPath.length + 1)
        : p

    const byFilename: SearchHit[] = []
    const byContent: SearchHit[] = []

    for (const [filePath, content] of state.contentByFile) {
      // Filename check first — stem only, no extension, case-insensitive
      const base = filePath.substring(filePath.lastIndexOf('/') + 1)
      if (base.toLowerCase().includes(qLower)) {
        byFilename.push({
          filePath,
          relativePath: makeRelative(filePath)
        })
        continue
      }

      // Content check
      const idx = content.toLowerCase().indexOf(qLower)
      if (idx < 0) continue
      result.totalContentMatches += 1
      if (byContent.length >= limit) continue

      // Extract snippet around the match: ~40 chars before, ~60 after
      const start = Math.max(0, idx - 40)
      const end = Math.min(content.length, idx + qLen + 60)
      let snippet = content.slice(start, end).replace(/\s+/g, ' ').trim()
      let snippetOffset = idx - start
      if (start > 0) {
        snippet = '… ' + snippet
        snippetOffset += 2
      }
      if (end < content.length) {
        snippet = snippet + ' …'
      }

      byContent.push({
        filePath,
        relativePath: makeRelative(filePath),
        snippet,
        snippetOffset,
        matchLength: qLen
      })
    }

    // Sort filename hits by relative path — shorter/higher-up paths first
    byFilename.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    byContent.sort((a, b) => a.relativePath.localeCompare(b.relativePath))

    result.filenameHits = byFilename.slice(0, limit)
    result.contentHits = byContent
    return result
  }
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

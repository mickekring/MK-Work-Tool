// Search result shapes returned from the main process.

export interface SearchHit {
  /** Absolute filesystem path of the matching note. */
  filePath: string
  /** Path relative to the vault root, e.g. "Projekt/NIP.md" */
  relativePath: string
  /**
   * For content matches: a short excerpt of the note containing the
   * match. Prefixed/suffixed with ellipses if truncated.
   */
  snippet?: string
  /**
   * Character offset of the match within `snippet` (after accounting
   * for any leading ellipsis). Undefined for filename-only hits.
   */
  snippetOffset?: number
  /** Length of the matched substring. */
  matchLength?: number
}

export interface SearchResults {
  query: string
  /** Notes whose filename contains the query. */
  filenameHits: SearchHit[]
  /**
   * Notes whose content contains the query (filenames excluded from
   * this group to avoid showing the same note twice).
   */
  contentHits: SearchHit[]
  /**
   * Total number of files with a content match — may be higher than
   * `contentHits.length` when we've capped the returned rows.
   */
  totalContentMatches: number
}

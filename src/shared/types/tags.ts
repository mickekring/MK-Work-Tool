// Tag-related types shared between main and renderer processes.

// A single tag grouping (strong = explicitly tagged, weak = word mentioned)
export interface TagRelations {
  tag: string
  taggedIn: string[] // files that contain #tag explicitly (absolute paths)
  mentionedIn: string[] // files that contain the tag word as plain text
}

// Relations for a single file — all tags it declares + related files per tag.
export interface FileRelations {
  filePath: string
  tags: TagRelations[]
}

// The full vault index (main process view).
export interface TagIndexSnapshot {
  // All tag names that exist anywhere in the vault
  allTags: string[]
  // For each tag, list of files that declare it explicitly
  filesByTag: Record<string, string[]>
}

// Node in the tag co-occurrence graph — one per unique tag.
export interface TagGraphNode {
  tag: string
  /** Number of notes that declare this tag. Drives node size. */
  count: number
}

// Edge: two tags that appear together in at least one note.
export interface TagGraphEdge {
  source: string
  target: string
  /** Number of notes that declare BOTH endpoint tags. Drives thickness. */
  weight: number
}

export interface TagGraph {
  nodes: TagGraphNode[]
  edges: TagGraphEdge[]
}

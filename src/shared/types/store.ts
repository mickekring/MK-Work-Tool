// Store state shape for the application

export interface FileNode {
  id: string
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
  modifiedAt?: number
}

export type FontSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface AISettings {
  // Selected Ollama model name (e.g. "llama3.1:latest"). null if the
  // user hasn't picked one yet or if Ollama isn't reachable.
  model: string | null
  // System prompt template. May contain the placeholder "{{document}}"
  // which is substituted with the current note's content at send time.
  systemPrompt: string
}

export interface AppSettings {
  vaultPath: string | null
  theme: 'dark' | 'light'
  fontSize: FontSize
  accentColor: string
  ai: AISettings
}

// Font size pixel values
export const fontSizeValues: Record<FontSize, number> = {
  xs: 13,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20
}

export const fontSizeLabels: Record<FontSize, string> = {
  xs: 'Extra Small',
  sm: 'Small',
  md: 'Medium',
  lg: 'Large',
  xl: 'Extra Large'
}

export interface UIState {
  leftSidebarVisible: boolean
  rightSidebarVisible: boolean
  leftSidebarWidth: number
  rightSidebarWidth: number
  lastOpenedFile: string | null
  expandedFolders: string[]
  // Per-file map of expanded relation tag names in the right sidebar.
  // Keyed by absolute file path; value is an array of tag display names
  // currently expanded for that file.
  expandedRelations: Record<string, string[]>
  // Global (not per-file) expand state of top-level right-sidebar
  // sections, keyed by section id. Absence of a key means the section
  // uses its own default.
  sectionsExpanded: Record<string, boolean>
}

export interface EditorState {
  currentFile: string | null
  content: string
  isDirty: boolean
}

export interface MainStore {
  // Settings - persisted to ~/.rune/settings.json
  settings: AppSettings

  // UI state - persisted to ~/.rune/ui-state.json
  ui: UIState

  // File tree - rebuilt from disk on vault load
  fileTree: FileNode[]

  // Editor state - in-memory only
  editor: EditorState

  // Actions
  setVaultPath: (path: string | null) => void
  setTheme: (theme: 'dark' | 'light') => void
  setFontSize: (size: FontSize) => void
  setAccentColor: (color: string) => void
  setAIModel: (model: string | null) => void
  setAISystemPrompt: (prompt: string) => void
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  setLeftSidebarWidth: (width: number) => void
  setRightSidebarWidth: (width: number) => void
  toggleFolderExpanded: (folderId: string) => void
  toggleRelationExpanded: (filePath: string, tag: string) => void
  setSectionExpanded: (sectionId: string, expanded: boolean) => void
  setFileTree: (tree: FileNode[]) => void
  openFile: (path: string, content: string) => void
  updateEditorContent: (content: string) => void
  markClean: () => void
  closeFile: () => void
}

// Default values
export const DEFAULT_AI_SYSTEM_PROMPT = `You are a thoughtful writing companion for the markdown document provided below. Be concise, reference specific passages when relevant, and match the document's existing voice and language. When the user asks about something not in the document, answer briefly from general knowledge but make it clear you're stepping outside the document.

---
{{document}}
---`

export const defaultAISettings: AISettings = {
  model: null,
  systemPrompt: DEFAULT_AI_SYSTEM_PROMPT
}

export const defaultSettings: AppSettings = {
  vaultPath: null,
  theme: 'dark',
  fontSize: 'md',
  accentColor: '#7c8cff',
  ai: defaultAISettings
}

export const defaultUIState: UIState = {
  leftSidebarVisible: true,
  rightSidebarVisible: true,
  leftSidebarWidth: 280,
  rightSidebarWidth: 280,
  lastOpenedFile: null,
  expandedFolders: [],
  expandedRelations: {},
  sectionsExpanded: {}
}

export const defaultEditorState: EditorState = {
  currentFile: null,
  content: '',
  isDirty: false
}

import { createStore, type StoreApi } from 'zustand/vanilla'
import type { MainStore, FileNode, FontSize } from '@shared/types/store'
import { defaultEditorState } from '@shared/types/store'
import { settingsService } from '../services/settings-service'

// Lazy store initialization
let store: StoreApi<MainStore> | null = null

function createMainStore(): StoreApi<MainStore> {
  // Load persisted state (only called after app is ready)
  const persistedSettings = settingsService.loadSettings()
  const persistedUIState = settingsService.loadUIState()

  return createStore<MainStore>()((set, get) => ({
    // Initial state from persistence
    settings: persistedSettings,
    ui: persistedUIState,
    fileTree: [],
    editor: defaultEditorState,

    // Settings actions
    setVaultPath: (path: string | null) => {
      set((state) => ({
        settings: { ...state.settings, vaultPath: path }
      }))
      settingsService.saveSettings(get().settings)
    },

    setTheme: (theme: 'dark' | 'light') => {
      set((state) => ({
        settings: { ...state.settings, theme }
      }))
      settingsService.saveSettings(get().settings)
    },

    setFontSize: (size: FontSize) => {
      set((state) => ({
        settings: { ...state.settings, fontSize: size }
      }))
      settingsService.saveSettings(get().settings)
    },

    setAccentColor: (color: string) => {
      set((state) => ({
        settings: { ...state.settings, accentColor: color }
      }))
      settingsService.saveSettings(get().settings)
    },

    setAIModel: (model: string | null) => {
      set((state) => ({
        settings: {
          ...state.settings,
          ai: { ...state.settings.ai, model }
        }
      }))
      settingsService.saveSettings(get().settings)
    },

    setAISystemPrompt: (prompt: string) => {
      set((state) => ({
        settings: {
          ...state.settings,
          ai: { ...state.settings.ai, systemPrompt: prompt }
        }
      }))
      settingsService.saveSettings(get().settings)
    },

    // UI actions
    toggleLeftSidebar: () => {
      set((state) => ({
        ui: { ...state.ui, leftSidebarVisible: !state.ui.leftSidebarVisible }
      }))
      settingsService.saveUIState(get().ui)
    },

    toggleRightSidebar: () => {
      set((state) => ({
        ui: { ...state.ui, rightSidebarVisible: !state.ui.rightSidebarVisible }
      }))
      settingsService.saveUIState(get().ui)
    },

    setLeftSidebarWidth: (width: number) => {
      set((state) => ({
        ui: { ...state.ui, leftSidebarWidth: width }
      }))
      settingsService.saveUIState(get().ui)
    },

    setRightSidebarWidth: (width: number) => {
      set((state) => ({
        ui: { ...state.ui, rightSidebarWidth: width }
      }))
      settingsService.saveUIState(get().ui)
    },

    // Folder expansion
    toggleFolderExpanded: (folderId: string) => {
      const current = get().ui.expandedFolders
      const next = current.includes(folderId)
        ? current.filter((id) => id !== folderId)
        : [...current, folderId]
      set((state) => ({
        ui: { ...state.ui, expandedFolders: next }
      }))
      settingsService.saveUIState(get().ui)
    },

    // Global section expand state (right sidebar top-level sections)
    setSectionExpanded: (sectionId: string, expanded: boolean) => {
      const current = get().ui.sectionsExpanded ?? {}
      const next = { ...current, [sectionId]: expanded }
      set((state) => ({
        ui: { ...state.ui, sectionsExpanded: next }
      }))
      settingsService.saveUIState(get().ui)
    },

    // Relations expansion — per (file, tag)
    toggleRelationExpanded: (filePath: string, tag: string) => {
      const current = get().ui.expandedRelations ?? {}
      const existing = current[filePath] ?? []
      const nextForFile = existing.includes(tag)
        ? existing.filter((t) => t !== tag)
        : [...existing, tag]
      const nextMap = { ...current }
      if (nextForFile.length === 0) {
        delete nextMap[filePath]
      } else {
        nextMap[filePath] = nextForFile
      }
      set((state) => ({
        ui: { ...state.ui, expandedRelations: nextMap }
      }))
      settingsService.saveUIState(get().ui)
    },

    // File tree actions
    setFileTree: (tree: FileNode[]) => {
      set({ fileTree: tree })
    },

    // Editor actions
    openFile: (path: string, content: string) => {
      set((state) => ({
        editor: { currentFile: path, content, isDirty: false },
        ui: { ...state.ui, lastOpenedFile: path }
      }))
      settingsService.saveUIState(get().ui)
    },

    updateEditorContent: (content: string) => {
      set((state) => ({
        editor: { ...state.editor, content, isDirty: true }
      }))
    },

    markClean: () => {
      set((state) => ({
        editor: { ...state.editor, isDirty: false }
      }))
    },

    closeFile: () => {
      set({
        editor: defaultEditorState
      })
    }
  }))
}

// Export the store getter (creates store on first access)
export const mainStore = {
  getState: () => {
    if (!store) {
      store = createMainStore()
    }
    return store.getState()
  },
  setState: (partial: Partial<MainStore> | ((state: MainStore) => Partial<MainStore>)) => {
    if (!store) {
      store = createMainStore()
    }
    store.setState(partial as any)
  },
  subscribe: (listener: (state: MainStore, prevState: MainStore) => void) => {
    if (!store) {
      store = createMainStore()
    }
    return store.subscribe(listener)
  }
}

// Export a typed getState helper
export const getStoreState = () => mainStore.getState()

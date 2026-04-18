import { useEffect, useState, useCallback } from 'react'
import type { AppSettings, UIState, FileNode, FontSize } from '@shared/types/store'
import type { FileRelations, TagIndexSnapshot } from '@shared/types/tags'

interface StoreState {
  settings: AppSettings
  ui: UIState
  fileTree: FileNode[]
  isLoading: boolean
}

const defaultState: StoreState = {
  settings: {
    vaultPath: null,
    theme: 'dark',
    fontSize: 'md',
    accentColor: '#7c8cff'
  },
  ui: {
    leftSidebarVisible: true,
    rightSidebarVisible: true,
    leftSidebarWidth: 280,
    rightSidebarWidth: 280,
    lastOpenedFile: null,
    expandedFolders: [],
    expandedRelations: {}
  },
  fileTree: [],
  isLoading: true
}

export function useStore() {
  const [state, setState] = useState<StoreState>(defaultState)

  // Load initial state from main process
  useEffect(() => {
    window.api
      .invoke<{ settings: AppSettings; ui: UIState; fileTree: FileNode[] }>('store:get-state')
      .then((mainState) => {
        setState({
          ...mainState,
          isLoading: false
        })
      })
      .catch((err) => {
        console.error('Failed to load store state:', err)
        setState((prev) => ({ ...prev, isLoading: false }))
      })

    // Listen for state updates from main process
    const unsubscribe = window.api.on('store:state-changed', (update: unknown) => {
      const typedUpdate = update as Partial<StoreState>
      setState((prev) => ({
        ...prev,
        settings: { ...prev.settings, ...typedUpdate.settings },
        ui: { ...prev.ui, ...typedUpdate.ui },
        fileTree: typedUpdate.fileTree ?? prev.fileTree
      }))
    })

    return unsubscribe
  }, [])

  return state
}

// Individual hooks for specific parts of state
export function useSettings() {
  const { settings, isLoading } = useStore()
  return { settings, isLoading }
}

export function useUI() {
  const { ui, isLoading } = useStore()
  return { ui, isLoading }
}

export function useFileTree() {
  const { fileTree, isLoading } = useStore()
  return { fileTree, isLoading }
}

// Action hooks
export function useStoreActions() {
  const setTheme = useCallback((theme: 'dark' | 'light') => {
    return window.api.invoke('store:set-theme', theme)
  }, [])

  const setVaultPath = useCallback((path: string | null) => {
    return window.api.invoke('store:set-vault-path', path)
  }, [])

  const toggleLeftSidebar = useCallback(() => {
    return window.api.invoke('store:toggle-left-sidebar')
  }, [])

  const toggleRightSidebar = useCallback(() => {
    return window.api.invoke('store:toggle-right-sidebar')
  }, [])

  const setSidebarWidth = useCallback((side: 'left' | 'right', width: number) => {
    return window.api.invoke('store:set-sidebar-width', side, width)
  }, [])

  const setFontSize = useCallback((size: FontSize) => {
    return window.api.invoke('store:set-font-size', size)
  }, [])

  const setAccentColor = useCallback((color: string) => {
    return window.api.invoke('store:set-accent-color', color)
  }, [])

  const toggleFolderExpanded = useCallback((folderId: string) => {
    return window.api.invoke('store:toggle-folder-expanded', folderId)
  }, [])

  const toggleRelationExpanded = useCallback(
    (filePath: string, tag: string) => {
      return window.api.invoke('store:toggle-relation-expanded', filePath, tag)
    },
    []
  )

  return {
    setTheme,
    setVaultPath,
    toggleLeftSidebar,
    toggleRightSidebar,
    setSidebarWidth,
    setFontSize,
    setAccentColor,
    toggleFolderExpanded,
    toggleRelationExpanded
  }
}

// File operations hook
export function useFileOperations() {
  const selectVault = useCallback(async () => {
    return window.api.invoke<string | null>('dialog:select-vault')
  }, [])

  const openVault = useCallback(async (path: string) => {
    return window.api.invoke<FileNode[]>('vault:open', path)
  }, [])

  const initVault = useCallback(async (path: string) => {
    return window.api.invoke<boolean>('vault:init', path)
  }, [])

  const readFile = useCallback(async (path: string) => {
    return window.api.invoke<string>('file:read', path)
  }, [])

  const writeFile = useCallback(async (path: string, content: string) => {
    return window.api.invoke<boolean>('file:write', path, content)
  }, [])

  const createFile = useCallback(async (path: string, content = '') => {
    return window.api.invoke<boolean>('file:create', path, content)
  }, [])

  const deleteFile = useCallback(async (path: string) => {
    return window.api.invoke<boolean>('file:delete', path)
  }, [])

  const renameFile = useCallback(async (oldPath: string, newPath: string) => {
    return window.api.invoke<boolean>('file:rename', oldPath, newPath)
  }, [])

  const fileExists = useCallback(async (path: string) => {
    return window.api.invoke<boolean>('file:exists', path)
  }, [])

  const createFolder = useCallback(async (path: string) => {
    return window.api.invoke<boolean>('folder:create', path)
  }, [])

  const saveAttachment = useCallback(
    async (sourcePath: string) => {
      return window.api.invoke<{ filename: string; relativePath: string } | null>(
        'attachment:save',
        sourcePath
      )
    },
    []
  )

  const deleteFolder = useCallback(async (path: string) => {
    return window.api.invoke<boolean>('folder:delete', path)
  }, [])

  return {
    selectVault,
    openVault,
    initVault,
    readFile,
    writeFile,
    createFile,
    deleteFile,
    renameFile,
    fileExists,
    createFolder,
    deleteFolder,
    saveAttachment
  }
}

// Relations for a specific file, auto-refreshed when the main process
// broadcasts that its tag index has changed (after any file save/delete/rename).
export function useFileRelations(filePath: string | null): FileRelations | null {
  const [relations, setRelations] = useState<FileRelations | null>(null)

  const fetchRelations = useCallback(async () => {
    if (!filePath) {
      setRelations(null)
      return
    }
    try {
      const data = await window.api.invoke<FileRelations>(
        'tags:get-relations',
        filePath
      )
      setRelations(data)
    } catch (err) {
      console.error('Failed to load file relations:', err)
      setRelations(null)
    }
  }, [filePath])

  useEffect(() => {
    fetchRelations()
    // Re-fetch whenever the global index changes
    const unsubscribe = window.api.on('tags:index-changed', () => {
      fetchRelations()
    })
    return unsubscribe
  }, [fetchRelations])

  return relations
}

// Access the full tag-index snapshot if you need it (e.g. for a tag browser).
export function useTagIndex(): TagIndexSnapshot | null {
  const [snapshot, setSnapshot] = useState<TagIndexSnapshot | null>(null)

  useEffect(() => {
    window.api
      .invoke<TagIndexSnapshot>('tags:get-index')
      .then(setSnapshot)
      .catch((err) => console.error('Failed to load tag index:', err))

    const unsubscribe = window.api.on('tags:index-changed', (update) => {
      setSnapshot(update as TagIndexSnapshot)
    })
    return unsubscribe
  }, [])

  return snapshot
}

import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, renameSync, readdirSync, statSync, rmdirSync, copyFileSync } from 'fs'
import { join, extname } from 'path'
import type { FileNode, FontSize } from '@shared/types/store'
import { mainStore } from '../store'
import { tagsService } from '../services/tags-service'
import { historyService } from '../services/history-service'
import { listModels, streamChat } from '../services/ollama-service'
import type { ChatMessageSend } from '@shared/types/ai'
import { migrateVaultAppDir } from '../services/settings-service'

export const MEDIA_FOLDER_NAME = 'vault_media'

// Helper to build file tree from a directory.
// Non-markdown files are only shown inside vault_media (and its descendants),
// so the main tree stays clean while attachments remain browsable.
function buildFileTree(
  dirPath: string,
  parentPath = '',
  allowAllFiles = false
): FileNode[] {
  const items: FileNode[] = []

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      // Skip hidden files and the .rune config folder (or any legacy
      // .arbetsyta, since both begin with a dot).
      if (entry.name.startsWith('.')) continue

      const fullPath = join(dirPath, entry.name)
      const relativePath = parentPath ? join(parentPath, entry.name) : entry.name
      const stats = statSync(fullPath)
      const isMediaRoot = parentPath === '' && entry.name === MEDIA_FOLDER_NAME

      // Skip non-markdown files outside the media folder
      if (entry.isFile() && !allowAllFiles && !entry.name.endsWith('.md')) continue

      const node: FileNode = {
        id: relativePath,
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? 'folder' : 'file',
        modifiedAt: stats.mtimeMs
      }

      if (entry.isDirectory()) {
        node.children = buildFileTree(
          fullPath,
          relativePath,
          allowAllFiles || isMediaRoot
        )
      }

      items.push(node)
    }

    // Sort: folders first, then by name
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error)
  }

  return items
}

// Copy an external file into {vault}/vault_media/ with collision-safe naming.
// Returns the relative path (for markdown insertion) and the final filename.
function saveAttachmentToVault(
  vaultPath: string,
  sourcePath: string
): { filename: string; relativePath: string } | null {
  try {
    const mediaDir = join(vaultPath, MEDIA_FOLDER_NAME)
    if (!existsSync(mediaDir)) {
      mkdirSync(mediaDir, { recursive: true })
    }

    const ext = extname(sourcePath)
    const base = sourcePath
      .substring(sourcePath.lastIndexOf('/') + 1)
      .slice(0, ext.length ? -ext.length : undefined)
    let filename = `${base}${ext}`
    let destPath = join(mediaDir, filename)
    let counter = 1
    while (existsSync(destPath)) {
      filename = `${base}-${counter}${ext}`
      destPath = join(mediaDir, filename)
      counter += 1
    }

    copyFileSync(sourcePath, destPath)

    return {
      filename,
      relativePath: `${MEDIA_FOLDER_NAME}/${filename}`
    }
  } catch (error) {
    console.error('Error saving attachment:', error)
    return null
  }
}

// Initialize vault config (no auto-folder creation - folders are user-managed)
function initVaultStructure(vaultPath: string): boolean {
  try {
    // Migrate any legacy app-dir name (e.g. `.arbetsyta`) -> `.rune`
    const configPath = migrateVaultAppDir(vaultPath)
    if (!existsSync(configPath)) {
      mkdirSync(configPath, { recursive: true })
      writeFileSync(
        join(configPath, 'config.json'),
        JSON.stringify({ version: 1, createdAt: Date.now() }, null, 2)
      )
    }

    return true
  } catch (error) {
    console.error('Error initializing vault structure:', error)
    return false
  }
}

function broadcastTagIndex(): void {
  const snapshot = tagsService.getSnapshot()
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('tags:index-changed', snapshot)
  })
}

function broadcastHistoryChanged(filePath: string): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('history:changed', { filePath })
  })
}

export function registerIPCHandlers(): void {
  // Dialog handlers
  ipcMain.handle('dialog:select-vault', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Vault Location',
      buttonLabel: 'Select Vault'
    })

    return result.canceled ? null : result.filePaths[0]
  })

  // File handlers
  ipcMain.handle('file:read', async (_, path: string) => {
    return readFileSync(path, 'utf-8')
  })

  ipcMain.handle('file:write', async (_, path: string, content: string) => {
    try {
      writeFileSync(path, content, 'utf-8')
      tagsService.updateFile(path, content)
      const propagated = tagsService.propagateTags(path)
      if (propagated.length > 0) {
        console.log(
          `tags: auto-tagged ${propagated.length} file(s) from ${path}`
        )
      }
      broadcastTagIndex()
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('file:create', async (_, path: string, content = '') => {
    try {
      writeFileSync(path, content, 'utf-8')
      tagsService.updateFile(path, content)
      tagsService.propagateTags(path)
      broadcastTagIndex()
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('file:delete', async (_, path: string) => {
    try {
      unlinkSync(path)
      tagsService.removeFile(path)
      broadcastTagIndex()
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('file:rename', async (_, oldPath: string, newPath: string) => {
    try {
      renameSync(oldPath, newPath)
      tagsService.renameFile(oldPath, newPath)
      broadcastTagIndex()
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('file:exists', async (_, path: string) => {
    return existsSync(path)
  })

  // Open an attachment with the OS default handler. Accepts either an
  // absolute path or a vault-relative path (like "vault_media/foo.pdf").
  ipcMain.handle('attachment:open', async (_, target: string) => {
    try {
      let absolute = target
      if (!absolute.startsWith('/')) {
        const vaultPath = mainStore.getState().settings.vaultPath
        if (!vaultPath) return false
        absolute = join(vaultPath, decodeURI(target))
      }
      const errorMsg = await shell.openPath(absolute)
      return errorMsg === ''
    } catch (error) {
      console.error('Error opening attachment:', error)
      return false
    }
  })

  ipcMain.handle('shell:open-external', async (_, url: string) => {
    await shell.openExternal(url)
  })

  // Attachment handler
  ipcMain.handle('attachment:save', async (_, sourcePath: string) => {
    const vaultPath = mainStore.getState().settings.vaultPath
    if (!vaultPath) return null
    const result = saveAttachmentToVault(vaultPath, sourcePath)
    if (result) {
      const tree = buildFileTree(vaultPath)
      mainStore.getState().setFileTree(tree)
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('store:state-changed', { fileTree: tree })
      })
    }
    return result
  })

  // Folder handlers
  ipcMain.handle('folder:create', async (_, path: string) => {
    try {
      mkdirSync(path, { recursive: true })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('folder:delete', async (_, path: string) => {
    try {
      rmdirSync(path, { recursive: true })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('folder:list', async (_, path: string) => {
    return buildFileTree(path)
  })

  // Vault handlers
  ipcMain.handle('vault:open', async (_, path: string) => {
    // Migrate legacy `.arbetsyta/` app dir inside the vault, if present.
    migrateVaultAppDir(path)
    const tree = buildFileTree(path)
    mainStore.getState().setFileTree(tree)
    mainStore.getState().setVaultPath(path)
    tagsService.scanVault(path)
    historyService.setVaultPath(path)

    // Notify all windows of the state change
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('store:state-changed', {
        settings: { vaultPath: path },
        fileTree: tree
      })
    })
    broadcastTagIndex()

    return tree
  })

  ipcMain.handle('vault:close', async () => {
    mainStore.getState().setFileTree([])
    mainStore.getState().setVaultPath(null)
  })

  ipcMain.handle('vault:init', async (_, path: string) => {
    return initVaultStructure(path)
  })

  // History handlers
  ipcMain.handle('history:list', async (_, filePath: string) => {
    return historyService.list(filePath)
  })

  ipcMain.handle('history:create-snapshot', async (_, filePath: string) => {
    const meta = historyService.createSnapshot(filePath)
    if (meta) broadcastHistoryChanged(filePath)
    return meta
  })

  ipcMain.handle(
    'history:restore',
    async (_, filePath: string, snapshotId: string) => {
      const result = historyService.restore(filePath, snapshotId)
      if (result) {
        // Re-index and propagate tags from the restored content
        tagsService.updateFile(filePath, result.content)
        tagsService.propagateTags(filePath)
        broadcastTagIndex()
        broadcastHistoryChanged(filePath)
      }
      return result
    }
  )

  ipcMain.handle(
    'history:delete-snapshot',
    async (_, filePath: string, snapshotId: string) => {
      const ok = historyService.deleteSnapshot(filePath, snapshotId)
      if (ok) broadcastHistoryChanged(filePath)
      return ok
    }
  )

  // Tag index handlers
  ipcMain.handle('tags:get-index', async () => {
    return tagsService.getSnapshot()
  })

  ipcMain.handle('tags:get-relations', async (_, filePath: string) => {
    return tagsService.getRelations(filePath)
  })

  ipcMain.handle(
    'search:query',
    async (_, query: string, limit: number) => {
      return tagsService.search(query, limit)
    }
  )

  ipcMain.handle('tags:rescan', async () => {
    const vaultPath = mainStore.getState().settings.vaultPath
    if (vaultPath) {
      tagsService.scanVault(vaultPath)
      broadcastTagIndex()
    }
    return tagsService.getSnapshot()
  })

  // Store handlers
  ipcMain.handle('store:get-state', async () => {
    const state = mainStore.getState()
    return {
      settings: state.settings,
      ui: state.ui,
      fileTree: state.fileTree
    }
  })

  ipcMain.handle('store:set-vault-path', async (_, path: string | null) => {
    mainStore.getState().setVaultPath(path)
  })

  ipcMain.handle('store:set-theme', async (_, theme: 'dark' | 'light') => {
    mainStore.getState().setTheme(theme)
    // Notify all windows of the theme change
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('store:state-changed', {
        settings: { theme }
      })
    })
  })

  ipcMain.handle('store:toggle-left-sidebar', async () => {
    mainStore.getState().toggleLeftSidebar()
    const visible = mainStore.getState().ui.leftSidebarVisible
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('store:state-changed', {
        ui: { leftSidebarVisible: visible }
      })
    })
  })

  ipcMain.handle('store:toggle-right-sidebar', async () => {
    mainStore.getState().toggleRightSidebar()
    const visible = mainStore.getState().ui.rightSidebarVisible
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('store:state-changed', {
        ui: { rightSidebarVisible: visible }
      })
    })
  })

  ipcMain.handle('store:set-sidebar-width', async (_, side: 'left' | 'right', width: number) => {
    if (side === 'left') {
      mainStore.getState().setLeftSidebarWidth(width)
    } else {
      mainStore.getState().setRightSidebarWidth(width)
    }
    const ui = mainStore.getState().ui
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('store:state-changed', {
        ui: {
          leftSidebarWidth: ui.leftSidebarWidth,
          rightSidebarWidth: ui.rightSidebarWidth
        }
      })
    })
  })

  ipcMain.handle('store:set-font-size', async (_, size: FontSize) => {
    mainStore.getState().setFontSize(size)
    // Notify all windows of the font size change
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('store:state-changed', {
        settings: { fontSize: size }
      })
    })
  })

  ipcMain.handle('store:toggle-folder-expanded', async (_, folderId: string) => {
    mainStore.getState().toggleFolderExpanded(folderId)
    const expandedFolders = mainStore.getState().ui.expandedFolders
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('store:state-changed', {
        ui: { expandedFolders }
      })
    })
  })

  ipcMain.handle(
    'store:toggle-relation-expanded',
    async (_, filePath: string, tag: string) => {
      mainStore.getState().toggleRelationExpanded(filePath, tag)
      const expandedRelations = mainStore.getState().ui.expandedRelations
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('store:state-changed', {
          ui: { expandedRelations }
        })
      })
    }
  )

  ipcMain.handle(
    'store:set-section-expanded',
    async (_, sectionId: string, expanded: boolean) => {
      mainStore.getState().setSectionExpanded(sectionId, expanded)
      const sectionsExpanded = mainStore.getState().ui.sectionsExpanded
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('store:state-changed', {
          ui: { sectionsExpanded }
        })
      })
    }
  )

  ipcMain.handle('store:set-accent-color', async (_, color: string) => {
    mainStore.getState().setAccentColor(color)
    // Notify all windows of the accent color change
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('store:state-changed', {
        settings: { accentColor: color }
      })
    })
  })

  ipcMain.handle('store:set-ai-model', async (_, model: string | null) => {
    mainStore.getState().setAIModel(model)
    const ai = mainStore.getState().settings.ai
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('store:state-changed', {
        settings: { ai }
      })
    })
  })

  ipcMain.handle('store:set-ai-system-prompt', async (_, prompt: string) => {
    mainStore.getState().setAISystemPrompt(prompt)
    const ai = mainStore.getState().settings.ai
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('store:state-changed', {
        settings: { ai }
      })
    })
  })

  // --- AI (Ollama) ------------------------------------------------------

  ipcMain.handle('ai:list-models', async () => {
    return listModels()
  })

  // Track in-flight chat streams so users can cancel.
  const activeChats = new Map<string, AbortController>()

  ipcMain.handle(
    'ai:chat-start',
    async (
      event,
      requestId: string,
      model: string,
      messages: ChatMessageSend[]
    ) => {
      const controller = new AbortController()
      activeChats.set(requestId, controller)
      const senderWin = BrowserWindow.fromWebContents(event.sender)
      // Fire-and-forget — streamChat emits chunks via events.
      streamChat(
        model,
        messages,
        controller.signal,
        (delta) => {
          senderWin?.webContents.send('ai:chat-chunk', { requestId, delta })
        },
        () => {
          senderWin?.webContents.send('ai:chat-done', { requestId })
          activeChats.delete(requestId)
        },
        (message) => {
          senderWin?.webContents.send('ai:chat-error', { requestId, message })
          activeChats.delete(requestId)
        }
      )
    }
  )

  ipcMain.handle('ai:chat-abort', async (_, requestId: string) => {
    const ctrl = activeChats.get(requestId)
    if (ctrl) {
      ctrl.abort()
      activeChats.delete(requestId)
    }
  })
}

// Send state updates to renderer
export function sendStateUpdate(
  win: BrowserWindow,
  update: { settings?: object; ui?: object; fileTree?: FileNode[] }
): void {
  win.webContents.send('store:state-changed', update)
}

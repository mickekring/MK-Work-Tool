import { contextBridge, ipcRenderer, webUtils } from 'electron'

// Every channel the renderer is allowed to invoke or subscribe to.
// Keep this in sync with src/shared/types/ipc.ts — anything NOT on
// the list is silently rejected at the preload boundary, so a
// compromised renderer can never reach a channel we didn't mean to
// expose. Matches the IPC surface declared in @shared/types/ipc.ts.
const ALLOWED_INVOKE_CHANNELS = new Set<string>([
  // Dialog
  'dialog:select-vault',
  // Files
  'file:read',
  'file:write',
  'file:create',
  'file:delete',
  'file:rename',
  'file:exists',
  // Attachments
  'attachment:save',
  'attachment:open',
  // Shell
  'shell:open-external',
  // Folders
  'folder:create',
  'folder:delete',
  'folder:list',
  // Vault
  'vault:open',
  'vault:close',
  'vault:init',
  // Store sync
  'store:get-state',
  'store:set-vault-path',
  'store:set-theme',
  'store:toggle-left-sidebar',
  'store:toggle-right-sidebar',
  'store:set-sidebar-width',
  'store:set-font-size',
  'store:set-accent-color',
  'store:toggle-folder-expanded',
  'store:toggle-relation-expanded',
  'store:set-section-expanded',
  'store:set-ai-model',
  'store:set-ai-system-prompt',
  // Tags
  'tags:get-index',
  'tags:get-relations',
  'tags:rescan',
  'tags:get-graph',
  // History
  'history:list',
  'history:create-snapshot',
  'history:restore',
  'history:delete-snapshot',
  // Search
  'search:query',
  // AI
  'ai:list-models',
  'ai:chat-start',
  'ai:chat-abort'
])

// Main→renderer events the renderer can subscribe to.
const ALLOWED_EVENT_CHANNELS = new Set<string>([
  'store:state-changed',
  'file:external-change',
  'tags:index-changed',
  'history:changed',
  'ai:chat-chunk',
  'ai:chat-done',
  'ai:chat-error'
])

// Custom APIs for renderer
const api = {
  /** Invoke a whitelisted IPC channel. Unknown channels are rejected. */
  invoke: <T>(channel: string, ...args: unknown[]): Promise<T> => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(
        new Error(`IPC channel "${channel}" is not in the allowlist.`)
      )
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  /** Subscribe to a whitelisted event channel. Returns an unsubscribe fn. */
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_EVENT_CHANNELS.has(channel)) {
      console.error(`IPC event "${channel}" is not in the allowlist.`)
      return () => {}
    }
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  /**
   * Resolve the absolute filesystem path of a File from an OS drag-drop.
   * Replaces the removed non-standard File.path property.
   */
  getFilePath: (file: File): string => {
    return webUtils.getPathForFile(file)
  }
}

// Expose API to renderer via contextBridge
try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('Failed to expose API:', error)
}

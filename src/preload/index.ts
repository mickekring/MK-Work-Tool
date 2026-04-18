import { contextBridge, ipcRenderer, webUtils } from 'electron'

// Custom APIs for renderer
const api = {
  // IPC invoke helper
  invoke: <T>(channel: string, ...args: unknown[]): Promise<T> => {
    return ipcRenderer.invoke(channel, ...args)
  },
  // IPC on helper for listening to main process events
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  // Resolve the absolute filesystem path of a File from an OS drag-drop.
  // Replaces the removed non-standard File.path property.
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

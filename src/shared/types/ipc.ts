import type { AppSettings, UIState, FileNode } from './store'

// IPC Channel definitions for type-safe communication

// Dialog channels
export interface DialogChannels {
  'dialog:select-vault': {
    args: []
    result: string | null // Selected path or null if cancelled
  }
}

// File operation channels
export interface FileChannels {
  'file:read': {
    args: [path: string]
    result: string // File content
  }
  'file:write': {
    args: [path: string, content: string]
    result: boolean // Success
  }
  'file:create': {
    args: [path: string, content?: string]
    result: boolean // Success
  }
  'file:delete': {
    args: [path: string]
    result: boolean // Success
  }
  'file:rename': {
    args: [oldPath: string, newPath: string]
    result: boolean // Success
  }
  'file:exists': {
    args: [path: string]
    result: boolean
  }
}

// Attachment operation channels
export interface AttachmentChannels {
  'attachment:save': {
    args: [sourcePath: string]
    result: {
      filename: string
      relativePath: string
    } | null
  }
  'attachment:open': {
    args: [relativeOrAbsolutePath: string]
    result: boolean
  }
  'shell:open-external': {
    args: [url: string]
    result: void
  }
}

// Folder operation channels
export interface FolderChannels {
  'folder:create': {
    args: [path: string]
    result: boolean // Success
  }
  'folder:delete': {
    args: [path: string]
    result: boolean // Success
  }
  'folder:list': {
    args: [path: string]
    result: FileNode[]
  }
}

// Vault operation channels
export interface VaultChannels {
  'vault:open': {
    args: [path: string]
    result: FileNode[] // File tree
  }
  'vault:close': {
    args: []
    result: void
  }
  'vault:init': {
    args: [path: string]
    result: boolean // Success - creates default folder structure
  }
}

// Store sync channels
export interface StoreChannels {
  'store:get-state': {
    args: []
    result: {
      settings: AppSettings
      ui: UIState
      fileTree: FileNode[]
    }
  }
  'store:set-vault-path': {
    args: [path: string | null]
    result: void
  }
  'store:set-theme': {
    args: [theme: 'dark' | 'light']
    result: void
  }
  'store:toggle-left-sidebar': {
    args: []
    result: void
  }
  'store:toggle-right-sidebar': {
    args: []
    result: void
  }
  'store:set-sidebar-width': {
    args: [side: 'left' | 'right', width: number]
    result: void
  }
  'store:toggle-folder-expanded': {
    args: [folderId: string]
    result: void
  }
}

// All IPC channels combined
export type IPCChannels = DialogChannels &
  FileChannels &
  AttachmentChannels &
  FolderChannels &
  VaultChannels &
  StoreChannels

// Helper type to extract channel names
export type IPCChannelName = keyof IPCChannels

// Helper type to get args for a channel
export type IPCArgs<T extends IPCChannelName> = IPCChannels[T]['args']

// Helper type to get result for a channel
export type IPCResult<T extends IPCChannelName> = IPCChannels[T]['result']

// Events sent from main to renderer
export interface MainToRendererEvents {
  'store:state-changed': {
    settings?: Partial<AppSettings>
    ui?: Partial<UIState>
    fileTree?: FileNode[]
  }
  'file:external-change': {
    type: 'add' | 'change' | 'unlink'
    path: string
  }
}

export type MainToRendererEventName = keyof MainToRendererEvents
export type MainToRendererEventData<T extends MainToRendererEventName> =
  MainToRendererEvents[T]

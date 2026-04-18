import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import type { AppSettings, UIState } from '@shared/types/store'
import { defaultSettings, defaultUIState } from '@shared/types/store'

// Lazy initialization to avoid calling app.getPath before app is ready
let configDir: string | null = null
let settingsFile: string | null = null
let uiStateFile: string | null = null
let windowStateFile: string | null = null

export interface WindowBounds {
  width: number
  height: number
  x?: number
  y?: number
}

const defaultWindowBounds: WindowBounds = {
  width: 1400,
  height: 900
}

function getConfigDir(): string {
  if (!configDir) {
    configDir = join(app.getPath('home'), '.arbetsyta')
  }
  return configDir
}

function getSettingsFile(): string {
  if (!settingsFile) {
    settingsFile = join(getConfigDir(), 'settings.json')
  }
  return settingsFile
}

function getUIStateFile(): string {
  if (!uiStateFile) {
    uiStateFile = join(getConfigDir(), 'ui-state.json')
  }
  return uiStateFile
}

function getWindowStateFile(): string {
  if (!windowStateFile) {
    windowStateFile = join(getConfigDir(), 'window-state.json')
  }
  return windowStateFile
}

function ensureConfigDir(): void {
  const dir = getConfigDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function readJSON<T>(filePath: string, defaults: T): T {
  try {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8')
      return { ...defaults, ...JSON.parse(data) }
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error)
  }
  return defaults
}

function writeJSON<T>(filePath: string, data: T): void {
  try {
    ensureConfigDir()
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error)
  }
}

export const settingsService = {
  loadSettings(): AppSettings {
    ensureConfigDir()
    return readJSON(getSettingsFile(), defaultSettings)
  },

  saveSettings(settings: AppSettings): void {
    writeJSON(getSettingsFile(), settings)
  },

  loadUIState(): UIState {
    ensureConfigDir()
    return readJSON(getUIStateFile(), defaultUIState)
  },

  saveUIState(state: UIState): void {
    writeJSON(getUIStateFile(), state)
  },

  loadWindowBounds(): WindowBounds {
    ensureConfigDir()
    return readJSON(getWindowStateFile(), defaultWindowBounds)
  },

  saveWindowBounds(bounds: WindowBounds): void {
    writeJSON(getWindowStateFile(), bounds)
  }
}

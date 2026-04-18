import { app } from 'electron'
import { join } from 'path'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync
} from 'fs'
import type { AppSettings, UIState } from '@shared/types/store'
import { defaultSettings, defaultUIState } from '@shared/types/store'

// App data directory — renamed from `.arbetsyta` to `.rune` when the
// app was rebranded. Existing installs get a silent one-time rename.
export const APP_DIR_NAME = '.rune'
const LEGACY_APP_DIR_NAMES = ['.arbetsyta']

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
    const home = app.getPath('home')
    configDir = join(home, APP_DIR_NAME)
    // One-time migration: if the new dir doesn't exist but a legacy
    // one does, rename it so the user keeps all their settings.
    if (!existsSync(configDir)) {
      for (const legacy of LEGACY_APP_DIR_NAMES) {
        const legacyDir = join(home, legacy)
        if (existsSync(legacyDir)) {
          try {
            renameSync(legacyDir, configDir)
            console.log(
              `Migrated config directory ${legacyDir} -> ${configDir}`
            )
          } catch (error) {
            console.error(
              `Failed to migrate ${legacyDir} -> ${configDir}:`,
              error
            )
          }
          break
        }
      }
    }
  }
  return configDir
}

// Exposed so other services (history, vault init) can mirror the same
// naming + migration convention per-vault.
export function migrateVaultAppDir(vaultPath: string): string {
  const target = join(vaultPath, APP_DIR_NAME)
  if (!existsSync(target)) {
    for (const legacy of LEGACY_APP_DIR_NAMES) {
      const legacyDir = join(vaultPath, legacy)
      if (existsSync(legacyDir)) {
        try {
          renameSync(legacyDir, target)
        } catch (error) {
          console.error(
            `Failed to migrate vault app dir ${legacyDir} -> ${target}:`,
            error
          )
        }
        break
      }
    }
  }
  return target
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

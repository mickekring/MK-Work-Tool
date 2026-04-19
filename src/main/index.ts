import { app, shell, BrowserWindow, protocol, net } from 'electron'
import { join, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { registerIPCHandlers } from './ipc/handlers'
import { mainStore } from './store'
import { settingsService } from './services/settings-service'
import { isSafeExternalUrl } from './services/path-guard'

// Icon used for the BrowserWindow in dev. In packaged builds,
// electron-builder uses build/icon.png to generate .icns/.ico.
const APP_ICON = join(__dirname, '../../build/icon.png')

// Register custom scheme before app is ready so the renderer treats
// vault-media:// URLs as secure/standard and can load images from them.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vault-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
])

// Single instance lock - prevent multiple windows
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
}

function createWindow(): void {
  // Check if we're in development mode (must be called after app is ready)
  const isDev = !app.isPackaged

  const savedBounds = settingsService.loadWindowBounds()

  const mainWindow = new BrowserWindow({
    width: savedBounds.width,
    height: savedBounds.height,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Rune',
    icon: APP_ICON,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Chromium OS-level sandbox for the renderer. Our preload only
      // uses contextBridge, ipcRenderer, and webUtils — all
      // sandbox-compatible — so this can stay on for an extra layer of
      // renderer isolation beyond contextIsolation + nodeIntegration.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Block <webview> tags which bypass most renderer lockdown.
      webviewTag: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Persist window bounds on resize/move (debounced) and on close.
  // Debounce avoids hammering the disk while the user drags.
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const persistBounds = (): void => {
    if (mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized() || mainWindow.isFullScreen()) return
    const { width, height, x, y } = mainWindow.getBounds()
    settingsService.saveWindowBounds({ width, height, x, y })
  }
  const schedulePersist = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(persistBounds, 400)
  }
  mainWindow.on('resize', schedulePersist)
  mainWindow.on('move', schedulePersist)
  mainWindow.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer)
    persistBounds()
  })

  // Only forward http(s)/mailto to the default browser. Other schemes
  // (file://, custom app schemes, javascript:, etc.) can be abused to
  // launch unexpected applications or exfiltrate data.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  // Block any top-level navigation away from the loaded bundle. If
  // something in the renderer sets `location.href = 'https://evil'`
  // we intercept and offload to the default browser instead.
  // Same-origin SPA navigation (hash/route churn) is allowed.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const current = mainWindow.webContents.getURL()
      // The very first load happens before getURL() returns anything,
      // so fall through (allow) when we haven't loaded the bundle yet.
      if (!current) return
      const currentOrigin = new URL(current).origin
      const targetOrigin = new URL(url).origin
      if (currentOrigin === targetOrigin) return
    } catch {
      // URL parsing failed — fall through to block.
    }
    event.preventDefault()
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url)
    }
  })

  // HMR for renderer based on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // DevTools available via Cmd+Option+I in development.
  // Auto-open disabled to avoid Chromium's Autofill.enable console noise.
}

// Focus existing window when second instance is launched
app.on('second-instance', () => {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    const mainWindow = windows[0]
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  // Set app user model id for Windows taskbar grouping
  app.setAppUserModelId('com.rune.app')
  // Ensure the dock icon in dev matches the packaged icon (macOS only).
  if (process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(APP_ICON)
    } catch {
      /* best-effort */
    }
  }

  // Resolve vault-media:// requests to files inside the current vault's
  // vault_media/ folder. The hostname is a placeholder (we always use
  // "local"); the actual relative path lives in url.pathname.
  //
  // SECURITY: percent-encoded `..` segments (e.g. "%2F..%2F..%2F") survive
  // WHATWG URL normalization, so after decodeURIComponent we MUST
  // re-resolve and verify the result is still inside vault_media/.
  // Without this check, a crafted image URL in a markdown file can
  // read any file on disk.
  protocol.handle('vault-media', (request) => {
    const vaultPath = mainStore.getState().settings.vaultPath
    if (!vaultPath) {
      return new Response('No vault open', { status: 404 })
    }
    const mediaRoot = resolve(vaultPath, 'vault_media')
    const url = new URL(request.url)
    const relative = decodeURIComponent(url.pathname.replace(/^\//, ''))
    const absolute = resolve(mediaRoot, relative)
    if (absolute !== mediaRoot && !absolute.startsWith(mediaRoot + sep)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(absolute).toString())
  })

  // Register IPC handlers
  registerIPCHandlers()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

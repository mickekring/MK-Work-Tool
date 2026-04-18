import { app, shell, BrowserWindow, protocol, net } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { registerIPCHandlers } from './ipc/handlers'
import { mainStore } from './store'

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

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer based on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // DevTools available via Cmd+Option+I in development
  // (Auto-open disabled to avoid Chromium Autofill.enable errors in console)
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
  // Set app user model id for windows
  app.setAppUserModelId('com.arbetsyta')

  // Resolve vault-media:// requests to files inside the current vault's
  // vault_media/ folder. The hostname is a placeholder (we always use
  // "local"); the actual relative path lives in url.pathname.
  protocol.handle('vault-media', (request) => {
    const vaultPath = mainStore.getState().settings.vaultPath
    if (!vaultPath) {
      return new Response('No vault open', { status: 404 })
    }
    const url = new URL(request.url)
    const relative = decodeURIComponent(url.pathname.replace(/^\//, ''))
    const absolute = join(vaultPath, 'vault_media', relative)
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

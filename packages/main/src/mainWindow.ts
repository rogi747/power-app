import {app, BrowserWindow, ipcMain, nativeImage, shell} from 'electron';
import {join, resolve} from 'node:path';
import express from 'express';
import * as portscanner from 'portscanner';
import type {BridgeMessage} from '../../shared/types/common';
import {createLogger} from '../../shared/utils/logger';
import {MAIN_LOGGER_LABEL} from './constants';
import {existsSync} from 'fs';

const logger = createLogger(MAIN_LOGGER_LABEL);
const server = express();
const isDev = import.meta.env.DEV;
let serverStarted = false;
let PORT = 5173;

//Start Express server only in production environment
async function findAvailablePortAndStartServer() {
  if (!isDev) {
    PORT = await portscanner.findAPortNotInUse(5173, 8000);
    server.use(express.static(resolve(__dirname, '../../renderer/dist')));
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      serverStarted = true;
    });
  }
}

async function createWindow() {
  //Distinguish the icon path between the installation version and the installation-free version
  //Get icon path
  const getIconPath = () => {
    if (app.isPackaged) {
      const paths = [
        //Installation path
        join(app.getPath('exe'), '..', 'resources', 'buildResources', 'icon.ico'),
        //alternative path
        join(process.resourcesPath, 'buildResources', 'icon.ico'),
        join(app.getAppPath(), 'buildResources', 'icon.ico'),
      ];

      //Use the first existing icon path
      for (const path of paths) {
        if (existsSync(path)) {
          return path;
        }
      }
    }
    //Development environment path
    return join(process.cwd(), 'buildResources', 'icon.ico');
  };

  const iconPath = getIconPath();

  //Make sure the icon file exists
  if (!existsSync(iconPath)) {
    logger.error('Icon file not found:', iconPath);
  }

  const icon = nativeImage.createFromPath(iconPath);
  const browserWindow = new BrowserWindow({
    icon, // Windows
    width: import.meta.env.DEV ? 1600 : 1400,
    height: 930,
    minWidth: 920,
    minHeight: 700,
    frame: false,
    hasShadow: process.platform === 'win32',
    transparent: false,
    backgroundColor: '#ffffff',
    movable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Sandbox disabled because the demo of preload script depend on the Node.js api
      webviewTag: false, // The webview tag is not recommended. Consider alternatives like an iframe or Electron's BrowserView. @see https://www.electronjs.org/docs/latest/api/webview-tag#warning
      preload: join(app.getAppPath(), 'packages/preload/dist/index.cjs'),
    },
  });

  if (process.platform === 'win32') {
    //Set taskbar icon
    browserWindow.setIcon(icon);
    //Set the app ID, this is important for the taskbar icon
    //Set app ID
    const appId = app.isPackaged ? 'com.chromepower.app' : process.execPath;
    app.setAppUserModelId(appId);

    browserWindow.setThumbarButtons([]);
  }

  //macOS specific settings
  if (process.platform === 'darwin') {
    app.dock.setIcon(icon);
  }

  /**
   * If the 'show' property of the BrowserWindow's constructor is omitted from the initialization options,
   * it then defaults to 'true'. This can cause flickering as the window loads the html content,
   * and it also has show problematic behaviour with the closing of the window.
   * Use `show: false` and listen to the  `ready-to-show` event to show the window.
   *
   * @see https://github.com/electron/electron/issues/25012 for the afford mentioned issue.
   */
  browserWindow.on('ready-to-show', () => {
    browserWindow?.show();

    if (import.meta.env.DEV) {
      browserWindow?.webContents.openDevTools();
    }
  });

  browserWindow.webContents?.on('will-navigate', (event, url) => {
    if (url !== browserWindow.webContents.getURL()) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  /**
   * icpMain
   */
  ipcMain?.handle('close', () => {
    const isMac = process.platform === 'darwin';
    if (!isMac) {
      browserWindow?.close();
    } else {
      app.quit();
    }
  });
  ipcMain?.handle('minimize', () => {
    browserWindow.minimize();
  });
  ipcMain?.handle('maximize', () => {
    if (browserWindow.isMaximized()) {
      browserWindow.unmaximize();
    } else {
      browserWindow.maximize();
    }
  });
  ipcMain?.handle('isMaximized', () => {
    return browserWindow.isMaximized();
  });

  /**
   * Load the main page of the main window.
   */
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_SERVER_URL !== undefined) {
    /**
     * Load from the Vite dev server for development.
     */
    await browserWindow.loadURL(import.meta.env.VITE_DEV_SERVER_URL);
  } else if (serverStarted) {
    await browserWindow.loadURL(`http://localhost:${PORT}/index.html`); // Make sure the port number matches your server port
  } else {
    await browserWindow.loadFile(resolve(__dirname, '../../renderer/dist/index.html'));
  }

  return browserWindow;
}

export async function initApp() {
  await findAvailablePortAndStartServer();
  const mainWindow = await createWindow();
  return mainWindow;
}

export function getClientPort() {
  return PORT;
}

export function getMainWindow() {
  return BrowserWindow.getAllWindows()[0];
}

export function bridgeMessageToUI(msg: BridgeMessage) {
  const mainWindow = getMainWindow();
  mainWindow?.webContents.send('bridge-msg', msg);
}

/**
 * Restore an existing BrowserWindow or Create a new BrowserWindow.
 */
export async function restoreOrCreateWindow() {
  let window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());

  if (window === undefined) {
    window = await initApp();
  }

  if (window.isMinimized()) {
    window.restore();
  }

  window.focus();
}

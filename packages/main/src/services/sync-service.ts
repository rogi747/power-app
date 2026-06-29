import {app, ipcMain, systemPreferences, shell} from 'electron';
import path from 'path';
import type {SafeAny} from '../../../shared/types/db';
import {createLogger} from '../../../shared/utils/logger';
import {MAIN_LOGGER_LABEL} from '../constants';
import {dialog} from 'electron';

const logger = createLogger(MAIN_LOGGER_LABEL);
let addon: unknown;
if (!app.isPackaged) {
  //Development environment: Load directly from the build directory
  addon = require(path.join(__dirname, '../src/native-addon/build/Release/', 'window-addon.node'));
} else {
  //Production environment: choose the right path based on platform and architecture
  // const addonDir = `${process.platform}-${process.arch}`;

  const addonPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked/node_modules/window-addon/',
    'window-addon.node',
  );

  try {
    addon = require(addonPath);
  } catch (error) {
    logger.error('Failed to load addon:', error);
    logger.error('Attempted path:', addonPath);
    logger.error('Platform and arch:', process.platform, process.arch);
  }
}

export const initSyncService = () => {
  if (!addon) {
    logger.error('Window addon not loaded properly', process.resourcesPath);
    return;
  }

  //Check accessibility permissions (macOS only)
  if (process.platform === 'darwin') {
    const hasPermission = systemPreferences.isTrustedAccessibilityClient(false);
    logger.info(`Accessibility permission: ${hasPermission ? 'granted' : 'denied'}`);

    if (!hasPermission) {
      //Prompt user for permission when app starts
      logger.warn('App requires accessibility permissions to arrange windows');
      dialog
        .showMessageBox({
          type: 'warning',
          title: 'Accessibility permissions required',
          message:
            'Please grant accessibility permissions to the app in System Preferences to enable window arrangement.',
          buttons: ['Go to Settings', 'Later'],
          defaultId: 0,
        })
        .then(({response}) => {
          if (response === 0) {
            //Open accessibility settings
            shell.openExternal(
              'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
            );
          }
        });
    }
  }

  const windowManager = new (addon as SafeAny).WindowManager();

  logger.info('WindowManager initialized');

  ipcMain.handle('window-arrange', async (_, args) => {
    const {mainPid, childPids, columns, size, spacing, monitorIndex} = args;
    logger.info('Arranging windows', {mainPid, childPids, columns, size, spacing, monitorIndex});
    try {
      if (!windowManager) {
        logger.error('WindowManager not initialized');
        throw new Error('WindowManager not initialized');
      }
      logger.info('arrangeWindows', windowManager.arrangeWindows.toString());
      try {
        // Pass monitorIndex if provided, otherwise let native addon use default (0)
        if (monitorIndex !== undefined) {
          windowManager.arrangeWindows(mainPid, childPids, columns, size, spacing, monitorIndex);
        } else {
          windowManager.arrangeWindows(mainPid, childPids, columns, size, spacing);
        }
      } catch (e) {
        logger.error('Native function execution error:', e);
        throw e;
      }

      return {success: true};
    } catch (error) {
      logger.error('Window arrangement failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Window cascade arrangement handler
  ipcMain.handle('window-cascade', async (_, args) => {
    const {pids, offset, size, startOffset} = args;
    logger.info('Cascading windows', {pids, offset, size, startOffset});
    try {
      if (!windowManager) {
        logger.error('WindowManager not initialized');
        throw new Error('WindowManager not initialized');
      }

      const startX = startOffset?.x || 0;
      const startY = startOffset?.y || 0;

      pids.forEach((pid, index) => {
        const left = startX + index * offset;
        const top = startY + index * offset;
        windowManager.setWindowBounds(pid, left, top, size.width, size.height);
      });

      return {success: true};
    } catch (error) {
      logger.error('Window cascade failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcMain.handle('window-get-monitors', async () => {
    logger.info('Getting available monitors');
    try {
      if (!windowManager) {
        logger.error('WindowManager not initialized');
        throw new Error('WindowManager not initialized');
      }

      const monitors = windowManager.getMonitors();
      logger.info('Available monitors:', monitors);
      return {success: true, monitors};
    } catch (error) {
      logger.error('Failed to get monitors:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        monitors: [],
      };
    }
  });
};

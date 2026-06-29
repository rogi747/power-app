import {ipcMain, screen} from 'electron';
import type {DB, SafeAny} from '../../../shared/types/db';
import {WindowDB} from '../db/window';
import {ProxyDB} from '../db/proxy';
import {generateFingerprint} from '../fingerprint/generator';
import {openFingerprintWindow, closeFingerprintWindow} from '../fingerprint/index';
import {runWithConcurrency} from '../utils/concurrency';
import {bridgeMessageToUI} from '../mainWindow';
import {createLogger} from '../../../shared/utils/logger';
import {SERVICE_LOGGER_LABEL} from '../constants';
import path from 'path';

const logger = createLogger(SERVICE_LOGGER_LABEL);

// Lazily load the native window addon (same resolution strategy as
// multi-window-sync-service). Used for tiling when a move primitive exists.
let windowAddon: SafeAny;
let windowManager: SafeAny = null;
try {
  try {
    windowAddon = require(
      path.join(__dirname, '../src/native-addon/build/Release/', 'window-addon.node'),
    );
  } catch {
    const addonPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked/node_modules/window-addon/',
      'window-addon.node',
    );
    windowAddon = require(addonPath);
  }
  if (windowAddon) {
    windowManager = new windowAddon.WindowManager();
  }
} catch (error) {
  logger.warn('batch-service: window addon not loaded, tiling disabled', error);
}

const DEFAULT_MAX_CONCURRENT = 5;

export const initBatchService = () => {
  logger.info('init batch service...');

  //Phase 4.1 — create N profiles from a template, each with its own generated
  //fingerprint and a proxy assigned round-robin from `proxyIds` (or the unused
  //proxy pool when none are supplied).
  ipcMain.handle(
    'window-batch-create',
    async (_, template: DB.Window, count: number, proxyIds?: number[]) => {
      const n = Math.max(1, Number(count) || 1);

      let pool: number[] = Array.isArray(proxyIds) ? proxyIds.filter(Boolean) : [];
      if (!pool.length) {
        const unused = await ProxyDB.getUnusedProxies();
        pool = unused.map(p => p.id!).filter(Boolean);
      }

      const created: number[] = [];
      for (let i = 0; i < n; i++) {
        const fingerprint = generateFingerprint();
        const window: DB.Window = {
          ...template,
          // never carry an id from the template into a new row
          id: undefined,
          profile_id: undefined,
          name: template.name ? `${template.name} ${i + 1}` : undefined,
          proxy_id: pool.length ? pool[i % pool.length] : (template.proxy_id ?? null),
          status: 1,
        };
        const result = await WindowDB.create(window, fingerprint);
        if (result.data?.id) {
          created.push(result.data.id);
        }
        bridgeMessageToUI({
          type: 'loading',
          text: `Creating profiles ${i + 1}/${n}`,
        });
      }

      bridgeMessageToUI({
        type: 'success',
        text: `Created ${created.length} profile(s).`,
      });
      return {
        success: created.length > 0,
        message: `Created ${created.length} profile(s).`,
        data: created,
      };
    },
  );

  //Phase 4.3 — open many profiles with a concurrency cap, streaming progress.
  ipcMain.handle(
    'window-batch-open',
    async (_, ids: number[], maxConcurrent = DEFAULT_MAX_CONCURRENT) => {
      const tasks = ids.map(id => () => openFingerprintWindow(id));
      const results = await runWithConcurrency(tasks, maxConcurrent, info => {
        bridgeMessageToUI({
          type: 'loading',
          text: `Opening profiles ${info.completed}/${info.total}`,
        });
      });
      const succeeded = results.filter(r => r.success).length;
      bridgeMessageToUI({
        type: 'success',
        text: `Opened ${succeeded}/${ids.length} profile(s).`,
      });
      return {
        success: succeeded > 0,
        message: `Opened ${succeeded}/${ids.length} profile(s).`,
        data: results,
      };
    },
  );

  //Phase 4.3 — close many profiles with a concurrency cap.
  ipcMain.handle(
    'window-batch-close',
    async (_, ids: number[], maxConcurrent = DEFAULT_MAX_CONCURRENT) => {
      const tasks = ids.map(id => () => closeFingerprintWindow(id, true));
      const results = await runWithConcurrency(tasks, maxConcurrent, info => {
        bridgeMessageToUI({
          type: 'loading',
          text: `Closing profiles ${info.completed}/${info.total}`,
        });
      });
      const succeeded = results.filter(r => r.success).length;
      bridgeMessageToUI({
        type: 'success',
        text: `Closed ${succeeded}/${ids.length} profile(s).`,
      });
      return {
        success: succeeded > 0,
        message: `Closed ${succeeded}/${ids.length} profile(s).`,
        data: results,
      };
    },
  );

  //Phase 4.4 — tile running windows into a grid on the primary display. Uses the
  //native addon's move primitive when available; otherwise reports unsupported.
  ipcMain.handle('window-tile', async (_, ids?: number[]) => {
    if (!windowManager || typeof windowManager.setWindowBounds !== 'function') {
      return {
        success: false,
        message: 'Window tiling is not supported on this platform build.',
      };
    }

    const opened = await WindowDB.getOpenedWindows();
    const targets = ids?.length ? opened.filter(w => ids.includes(w.id!)) : opened;
    const pids = targets.map(w => w.pid).filter((pid): pid is number => !!pid);
    if (!pids.length) {
      return {success: false, message: 'No running windows to tile.'};
    }

    const {workArea} = screen.getPrimaryDisplay();
    const cols = Math.ceil(Math.sqrt(pids.length));
    const rows = Math.ceil(pids.length / cols);
    const cellW = Math.floor(workArea.width / cols);
    const cellH = Math.floor(workArea.height / rows);

    pids.forEach((pid, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      try {
        windowManager.setWindowBounds(pid, {
          x: workArea.x + col * cellW,
          y: workArea.y + row * cellH,
          width: cellW,
          height: cellH,
        });
      } catch (error) {
        logger.error('tile error for pid', pid, error);
      }
    });

    return {success: true, message: `Tiled ${pids.length} window(s).`};
  });
};

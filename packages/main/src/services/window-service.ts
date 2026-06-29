import {ipcMain} from 'electron';
import {readFileSync} from 'fs';
import {txtToJSON} from '../utils/txt-to-json';
import * as XLSX from 'xlsx';
import type {IWindowTemplate} from '../types/window-template';
import type {DB, SafeAny} from '../../../shared/types/db';
import {WindowDB} from '../db/window';
import {
  closeFingerprintWindow,
  focusFingerprintWindow,
  openFingerprintWindow,
} from '../fingerprint/index';
import {createLogger} from '../../../shared/utils/logger';
import {SERVICE_LOGGER_LABEL} from '../constants';
import {randomASCII, randomFloat, randomInt} from '../../../shared/utils';
import {generateFingerprint} from '../fingerprint/generator';
import type {Fingerprint} from '../../../shared/types/fingerprint';
import path from 'path';
import puppeteer from 'puppeteer';
import {presetCookie} from '../puppeteer/helpers';
import {normalizeCookies, serializeCookies} from '../utils/cookie';
import {ExtensionDB} from '../db/extension';
import * as ExcelJS from 'exceljs';
const logger = createLogger(SERVICE_LOGGER_LABEL);
export const initWindowService = () => {
  logger.info('init window service...');
  ipcMain.handle('window-import', async (_, filePath: string) => {
    let fileData: IWindowTemplate[] = [];
    if (filePath.endsWith('xlsx') || filePath.endsWith('xls')) {
      const workbook = XLSX.readFile(filePath);
      const sheet_name_list = workbook.SheetNames;
      fileData = XLSX.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);
    } else {
      const fileContent = readFileSync(filePath, 'utf-8');
      const data = txtToJSON(fileContent);
      fileData = data.filter(f => f.id);
    }
    console.log(fileData);
    const result = await WindowDB.externalImport(fileData);
    return result;
  });

  ipcMain.handle('window-create', async (_, window: DB.Window, fingerprint: SafeAny) => {
    logger.info(
      'try to create window',
      JSON.stringify({
        ...window,
        cookie: window?.cookie ? `preset ${window.cookie.length} cookies` : [],
      }),
      JSON.stringify(fingerprint),
    );
    console.log(window);
    return await WindowDB.create(window, fingerprint);
  });

  ipcMain.handle('window-update', async (_, id: number, window: DB.Window) => {
    return await WindowDB.update(id!, window);
  });

  ipcMain.handle('window-delete', async (_, id: number) => {
    await ExtensionDB.deleteWindowReleted(id);
    return await WindowDB.remove(id);
  });
  ipcMain.handle('window-batchClear', async (_, ids: number[]) => {
    await ExtensionDB.deleteWindowReleted(ids);
    return await WindowDB.batchClear(ids);
  });
  ipcMain.handle('window-batchDelete', async (_, ids: number[]) => {
    await ExtensionDB.deleteWindowReleted(ids);
    return await WindowDB.batchRemove(ids);
  });

  ipcMain.handle('window-getAll', async () => {
    return await WindowDB.all();
  });

  ipcMain.handle('window-getOpened', async () => {
    return await WindowDB.getOpenedWindows();
  });

  ipcMain.handle('window-export', async () => {
    console.log('export windows');
    try {
      const windows = await WindowDB.all();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Windows');
      worksheet.addRow([
        'ID',
        'Profile ID',
        'Group',
        'Name',
        'Remark',
        'Proxy',
        'Last Open',
        'Created At',
      ]);
      windows.forEach(window => {
        worksheet.addRow([
          window.id,
          window.profile_id,
          window.group_name,
          window.name,
          window.remark,
          window.proxy,
          window.opened_at,
          window.created_at,
        ]);
      });
      workbook.xlsx.writeFile('windows.xlsx');
      return {
        success: true,
        message: 'Export windows successfully',
      };
    } catch (error) {
      logger.error('export windows error', error);
      return {
        success: false,
        message: 'Export windows failed',
      };
    }
  });

  ipcMain.handle('window-fingerprint', async (_, windowId: number) => {
    if (windowId) {
      const window = await WindowDB.getById(windowId);
      if (window) {
        return {
          ...JSON.parse(window.fingerprint),
        };
      }
    } else {
      return {};
    }
  });

  ipcMain.handle('window-getById', async (_, id: number) => {
    return await WindowDB.getById(id);
  });

  //Generate a fresh fingerprint for the editor (not persisted until saved).
  ipcMain.handle('window-generate-fingerprint', async (_, seed?: string) => {
    return generateFingerprint(seed);
  });

  //Persist an edited fingerprint JSON for a window.
  ipcMain.handle(
    'window-update-fingerprint',
    async (_, id: number, fingerprint: Fingerprint) => {
      const window = await WindowDB.getById(id);
      return await WindowDB.update(id, {
        ...window,
        ua: fingerprint.ua,
        fingerprint: JSON.stringify(fingerprint),
      });
    },
  );

  ipcMain.handle('window-open', async (_, id: number) => {
    return await openFingerprintWindow(id);
  });
  ipcMain.handle('window-close', async (_, id: number, force = false) => {
    return await closeFingerprintWindow(id, force);
  });

  ipcMain.handle('window-focus', async (_, id: number) => {
    return await focusFingerprintWindow(id);
  });

  ipcMain.handle('window-set-cookie', async (_, id: number) => {
    const window = await WindowDB.getById(id);
    await WindowDB.update(id, {
      ...window,
      status: 3,
    });
    const {webSocketDebuggerUrl} = await openFingerprintWindow(id, true);

    const browser = await puppeteer.connect({
      browserWSEndpoint: webSocketDebuggerUrl,
      defaultViewport: null,
    });
    await presetCookie(id, browser);
    await browser.close();
    return {
      success: true,
      message: 'Set cookie successfully.',
    };
  });

  //Phase 3.3 — import cookies (EditThisCookie JSON / Netscape / header string)
  //into one or more profiles. The raw text is normalized to puppeteer cookie
  //shape and stored on `window.cookie` as JSON, ready for `presetCookie`.
  ipcMain.handle(
    'window-import-cookie',
    async (_, windowIds: number[], rawCookie: string, defaultDomain?: string) => {
      const cookies = normalizeCookies(rawCookie, defaultDomain);
      if (!cookies.length) {
        return {success: false, message: 'No valid cookies could be parsed.'};
      }
      const cookieJson = JSON.stringify(cookies);
      const ids = Array.isArray(windowIds) ? windowIds : [windowIds];
      for (const id of ids) {
        const window = await WindowDB.getById(id);
        if (window) {
          await WindowDB.update(id, {...window, cookie: cookieJson});
        }
      }
      return {
        success: true,
        message: `Imported ${cookies.length} cookies to ${ids.length} profile(s).`,
        data: {count: cookies.length, windows: ids.length},
      };
    },
  );

  //Phase 3.3 — export live cookies from a running profile via CDP, returning a
  //JSON string. Falls back to the stored `window.cookie` if the profile is not
  //running.
  ipcMain.handle('window-export-cookie', async (_, id: number) => {
    const window = await WindowDB.getById(id);
    if (!window) {
      return {success: false, message: 'Profile not found.'};
    }
    // Running profile -> read live cookies over CDP.
    if (window.status === 2) {
      try {
        const {webSocketDebuggerUrl} = await openFingerprintWindow(id, true);
        const browser = await puppeteer.connect({
          browserWSEndpoint: webSocketDebuggerUrl,
          defaultViewport: null,
        });
        const page = await browser.newPage();
        const client = await page.target().createCDPSession();
        await client.send('Network.enable');
        const {cookies} = await client.send('Network.getAllCookies');
        await page.close();
        browser.disconnect();
        return {success: true, data: serializeCookies(cookies as SafeAny)};
      } catch (error) {
        logger.error('export cookie error', error);
        return {success: false, message: 'Failed to read live cookies. ' + error};
      }
    }
    // Not running -> return stored preset cookies.
    return {
      success: true,
      data: window.cookie
        ? serializeCookies(normalizeCookies(window.cookie))
        : serializeCookies([]),
    };
  });
};

export const randomFingerprint = () => {
  const uaPath = path.join(
    import.meta.env.MODE === 'development' ? 'assets' : 'resources/app/assets',
    'ua.txt',
  );
  const uaFile = readFileSync(uaPath, 'utf-8');
  const uaList = uaFile.split('\n');
  const randomIndex = Math.floor(Math.random() * uaList.length);
  const ua = uaList[randomIndex];
  const result = {
    ua,
    pathStr: randomASCII(),
    webgl: randomFloat(),
    audio: randomInt(),
  };
  return result;
};

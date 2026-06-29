import {ipcMain} from 'electron';
import type {DB} from '../../../shared/types/db';
import {AccountDB} from '../db/account';

/**
 * Phase 3.4 — Account IPC service.
 * Credentials are encrypted/decrypted inside AccountDB; this layer is a thin
 * IPC pass-through following the repo's service convention.
 */
export const initAccountService = () => {
  ipcMain.handle('account-create', async (_, account: DB.Account) => {
    return await AccountDB.create(account);
  });

  ipcMain.handle('account-update', async (_, id: number, account: DB.Account) => {
    return await AccountDB.update(id, account);
  });

  ipcMain.handle('account-delete', async (_, id: number) => {
    return await AccountDB.remove(id);
  });

  ipcMain.handle('account-batchDelete', async (_, ids: number[]) => {
    return await AccountDB.batchDelete(ids);
  });

  ipcMain.handle('account-getAll', async () => {
    return await AccountDB.all();
  });

  ipcMain.handle('account-getById', async (_, id: number) => {
    return await AccountDB.getById(id);
  });

  ipcMain.handle('account-getByWindowId', async (_, windowId: number) => {
    return await AccountDB.getByWindowId(windowId);
  });
};

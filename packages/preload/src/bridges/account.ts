import {ipcRenderer} from 'electron';
import type {DB} from '../../../shared/types/db';

export const AccountBridge = {
  async getAll() {
    const result = await ipcRenderer.invoke('account-getAll');
    return result;
  },
  async getById(id: number) {
    const result = await ipcRenderer.invoke('account-getById', id);
    return result;
  },
  async getByWindowId(windowId: number) {
    const result = await ipcRenderer.invoke('account-getByWindowId', windowId);
    return result;
  },
  async create(account: DB.Account) {
    const result = await ipcRenderer.invoke('account-create', account);
    return result;
  },
  async update(id: number, account: DB.Account) {
    const result = await ipcRenderer.invoke('account-update', id, account);
    return result;
  },
  async delete(id: number) {
    const result = await ipcRenderer.invoke('account-delete', id);
    return result;
  },
  async batchDelete(ids: number[]) {
    const result = await ipcRenderer.invoke('account-batchDelete', ids);
    return result;
  },
};

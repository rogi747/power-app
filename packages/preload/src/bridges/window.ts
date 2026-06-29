import type {IpcRendererEvent} from 'electron';
import {ipcRenderer} from 'electron';
import type {DB, SafeAny} from '../../../shared/types/db';

export const WindowBridge = {
  async import(file: string) {
    const result = await ipcRenderer.invoke('window-import', file);
    return result;
  },

  async create(window: DB.Window, fingerprints: SafeAny) {
    const result = await ipcRenderer.invoke('window-create', window, fingerprints);
    return result;
  },

  async update(id: number, window: DB.Window) {
    const result = await ipcRenderer.invoke('window-update', id, window);
    return result;
  },
  async delete(id: number) {
    const result = await ipcRenderer.invoke('window-delete', id);
    return result;
  },
  async batchClear(ids: number[]) {
    const result = await ipcRenderer.invoke('window-batchClear', ids);
    return result;
  },
  async batchDelete(ids: number[]) {
    const result = await ipcRenderer.invoke('window-batchDelete', ids);
    return result;
  },
  async getAll() {
    const result = await ipcRenderer.invoke('window-getAll');
    return result;
  },
  async getOpenedWindows() {
    const result = await ipcRenderer.invoke('window-getOpened');
    return result;
  },
  async getFingerprint(windowId?: number) {
    const result = await ipcRenderer.invoke('window-fingerprint', windowId);
    return result;
  },
  async generateFingerprint(seed?: string) {
    const result = await ipcRenderer.invoke('window-generate-fingerprint', seed);
    return result;
  },
  async updateFingerprint(id: number, fingerprint: SafeAny) {
    const result = await ipcRenderer.invoke('window-update-fingerprint', id, fingerprint);
    return result;
  },
  async getById(id: number) {
    const result = await ipcRenderer.invoke('window-getById', id);
    return result;
  },

  async open(id: number) {
    const result = await ipcRenderer.invoke('window-open', id);
    return result;
  },

  async close(id: number) {
    const result = await ipcRenderer.invoke('window-close', id, true);
    return result;
  },

  async focus(id: number) {
    const result = await ipcRenderer.invoke('window-focus', id);
    return result;
  },

  async toogleSetCookie(id: number) {
    const result = await ipcRenderer.invoke('window-set-cookie', id);
    return result;
  },

  async importCookie(windowIds: number[], rawCookie: string, defaultDomain?: string) {
    const result = await ipcRenderer.invoke(
      'window-import-cookie',
      windowIds,
      rawCookie,
      defaultDomain,
    );
    return result;
  },

  async exportCookie(id: number) {
    const result = await ipcRenderer.invoke('window-export-cookie', id);
    return result;
  },

  async batchCreate(template: DB.Window, count: number, proxyIds?: number[]) {
    const result = await ipcRenderer.invoke('window-batch-create', template, count, proxyIds);
    return result;
  },

  async batchOpen(ids: number[], maxConcurrent?: number) {
    const result = await ipcRenderer.invoke('window-batch-open', ids, maxConcurrent);
    return result;
  },

  async batchClose(ids: number[], maxConcurrent?: number) {
    const result = await ipcRenderer.invoke('window-batch-close', ids, maxConcurrent);
    return result;
  },

  async tile(ids?: number[]) {
    const result = await ipcRenderer.invoke('window-tile', ids);
    return result;
  },

  onWindowClosed: (callback: (event: IpcRendererEvent, id: number) => void) =>
    ipcRenderer.on('window-closed', callback),

  onWindowOpened: (callback: (event: IpcRendererEvent, id: number) => void) =>
    ipcRenderer.on('window-opened', callback),

  offWindowClosed: (callback: (event: IpcRendererEvent, id: number) => void) =>
    ipcRenderer.off('window-closed', callback),

  offWindowOpened: (callback: (event: IpcRendererEvent, id: number) => void) =>
    ipcRenderer.off('window-opened', callback),
};

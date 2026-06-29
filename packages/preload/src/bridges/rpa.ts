import {ipcRenderer} from 'electron';
import type {RPA} from '../../../shared/types/rpa';

/**
 * Renderer-facing bridge for the Browser RPA system. Mirrors the existing
 * bridge pattern (thin wrappers over ipcRenderer.invoke) so the UI never
 * touches ipc channel strings directly.
 */
export const RpaBridge = {
  // ---- Workflows ----------------------------------------------------------
  async list(includeDeleted = false): Promise<RPA.WorkflowRecord[]> {
    return await ipcRenderer.invoke('rpa-workflow-list', includeDeleted);
  },
  async get(id: number): Promise<RPA.WorkflowRecord | undefined> {
    return await ipcRenderer.invoke('rpa-workflow-get', id);
  },
  async create(record: RPA.WorkflowRecord) {
    return await ipcRenderer.invoke('rpa-workflow-create', record);
  },
  async update(id: number, record: RPA.WorkflowRecord) {
    return await ipcRenderer.invoke('rpa-workflow-update', id, record);
  },
  async delete(id: number) {
    return await ipcRenderer.invoke('rpa-workflow-delete', id);
  },
  async restore(id: number) {
    return await ipcRenderer.invoke('rpa-workflow-restore', id);
  },
  async destroy(id: number) {
    return await ipcRenderer.invoke('rpa-workflow-destroy', id);
  },
  async duplicate(id: number) {
    return await ipcRenderer.invoke('rpa-workflow-duplicate', id);
  },
  async export(id: number) {
    return await ipcRenderer.invoke('rpa-workflow-export', id);
  },
  async import(payload: RPA.WorkflowRecord) {
    return await ipcRenderer.invoke('rpa-workflow-import', payload);
  },

  // ---- Execution (engine layer) ------------------------------------------
  async run(options: RPA.RunOptions): Promise<RPA.RunResult> {
    return await ipcRenderer.invoke('rpa-run', options);
  },
  async cancel(runId: string) {
    return await ipcRenderer.invoke('rpa-cancel', runId);
  },

  // ---- Task logs ----------------------------------------------------------
  async logs(filter?: {
    runId?: string;
    workflowId?: number;
    status?: string;
    limit?: number;
  }): Promise<RPA.TaskLog[]> {
    return await ipcRenderer.invoke('rpa-log-list', filter);
  },
  async clearLogs(workflowId?: number) {
    return await ipcRenderer.invoke('rpa-log-clear', workflowId);
  },

  // ---- Batch / thread manager --------------------------------------------
  async runBatch(
    workflowId: number,
    windowIds: number[],
    variables?: Record<string, unknown>,
  ) {
    return await ipcRenderer.invoke('rpa-run-batch', workflowId, windowIds, variables);
  },
  async queueStatus() {
    return await ipcRenderer.invoke('rpa-queue-status');
  },
  async cancelQueue() {
    return await ipcRenderer.invoke('rpa-queue-cancel-all');
  },

  // ---- Scheduler ----------------------------------------------------------
  async listSchedules() {
    return await ipcRenderer.invoke('rpa-schedule-list');
  },
  async createSchedule(schedule: {
    name: string;
    cron: string;
    workflowId: number;
    windowIds: number[];
    variables?: Record<string, unknown>;
    enabled?: boolean;
  }) {
    return await ipcRenderer.invoke('rpa-schedule-create', schedule);
  },
  async toggleSchedule(id: string, enabled: boolean) {
    return await ipcRenderer.invoke('rpa-schedule-toggle', id, enabled);
  },
  async deleteSchedule(id: string) {
    return await ipcRenderer.invoke('rpa-schedule-delete', id);
  },

  // ---- Live event subscriptions ------------------------------------------
  /** Subscribe to live run events (node started/finished/error). */
  onRunEvent(handler: (event: RPA.TaskLog) => void) {
    const listener = (_: unknown, payload: RPA.TaskLog) => handler(payload);
    ipcRenderer.on('rpa-run-event', listener);
    return () => ipcRenderer.removeListener('rpa-run-event', listener);
  },
  /** Subscribe to thread-manager queue updates. */
  onQueueEvent(handler: (status: unknown) => void) {
    const listener = (_: unknown, payload: unknown) => handler(payload);
    ipcRenderer.on('rpa-queue-event', listener);
    return () => ipcRenderer.removeListener('rpa-queue-event', listener);
  },
  /** Subscribe to scheduler updates. */
  onScheduleEvent(handler: (schedules: unknown) => void) {
    const listener = (_: unknown, payload: unknown) => handler(payload);
    ipcRenderer.on('rpa-schedule-event', listener);
    return () => ipcRenderer.removeListener('rpa-schedule-event', listener);
  },
};

import {ipcMain} from 'electron';
import {RpaDB} from '../db/rpa';
import type {RPA} from '../../../shared/types/rpa';
import {createLogger} from '../../../shared/utils/logger';
import {SERVICE_LOGGER_LABEL} from '../constants';
import {startWorkflowRun, cancelRun} from '../puppeteer/rpa/engine';
import {RpaThreadManager} from '../puppeteer/rpa/thread-manager';
import {RpaScheduler, type RpaScheduleInput} from '../puppeteer/rpa/scheduler';
import {stripWorkflowSecrets} from '../puppeteer/rpa/secrets';
import {RpaRecorder} from '../puppeteer/rpa/recorder';

const logger = createLogger(SERVICE_LOGGER_LABEL);

/**
 * Browser RPA service — registers the IPC surface for workflow CRUD and task
 * logs. Execution-related channels (run/cancel/debug) are added by the engine
 * layer in a later slice; this service owns persistence + import/export.
 *
 * Channel naming follows the existing convention: `rpa-<action>`.
 */
export const initRpaService = () => {
  logger.info('init rpa service...');

  ipcMain.handle('rpa-workflow-list', async (_, includeDeleted?: boolean) => {
    return await RpaDB.all(includeDeleted);
  });

  ipcMain.handle('rpa-workflow-get', async (_, id: number) => {
    return await RpaDB.getById(id);
  });

  ipcMain.handle('rpa-workflow-create', async (_, record: RPA.WorkflowRecord) => {
    logger.info('create workflow', record?.name);
    return await RpaDB.create(record);
  });

  ipcMain.handle('rpa-workflow-update', async (_, id: number, record: RPA.WorkflowRecord) => {
    return await RpaDB.update(id, record);
  });

  ipcMain.handle('rpa-workflow-delete', async (_, id: number) => {
    return await RpaDB.softDelete(id);
  });

  ipcMain.handle('rpa-workflow-restore', async (_, id: number) => {
    return await RpaDB.restore(id);
  });

  ipcMain.handle('rpa-workflow-destroy', async (_, id: number) => {
    return await RpaDB.remove(id);
  });

  ipcMain.handle('rpa-workflow-duplicate', async (_, id: number) => {
    return await RpaDB.duplicate(id);
  });

  // Export returns the full record so the renderer can write a .json file.
  ipcMain.handle('rpa-workflow-export', async (_, id: number) => {
    const record = await RpaDB.getById(id);
    if (!record) return {success: false, message: 'Workflow not found.'};
    const definition =
      typeof record.definition === 'string'
        ? (JSON.parse(record.definition) as RPA.Workflow)
        : record.definition;
    return {
      success: true,
      data: {
        ...record,
        definition: definition ? stripWorkflowSecrets(definition) : definition,
      },
    };
  });

  // Import accepts a previously exported record (or raw Workflow definition).
  ipcMain.handle('rpa-workflow-import', async (_, payload: RPA.WorkflowRecord) => {
    const record: RPA.WorkflowRecord = {
      name: payload.name ?? 'Imported workflow',
      description: payload.description ?? '',
      definition: payload.definition ?? RpaDB.emptyWorkflow(),
      folder: payload.folder ?? null,
      tags: payload.tags ?? [],
    };
    return await RpaDB.create(record);
  });

  // ---- Task logs ----------------------------------------------------------

  ipcMain.handle(
    'rpa-log-list',
    async (_, filter?: {runId?: string; workflowId?: number; status?: string; limit?: number}) => {
      return await RpaDB.getLogs(filter);
    },
  );

  ipcMain.handle('rpa-log-clear', async (_, workflowId?: number) => {
    return await RpaDB.clearLogs(workflowId);
  });

  // ---- Execution ----------------------------------------------------------

  // Run one workflow against one profile. For multi-profile / concurrent runs
  // the renderer enqueues through the thread manager (rpa-run-batch) instead.
  ipcMain.handle('rpa-run', async (_, options: RPA.RunOptions) => {
    logger.info('start workflow', options?.workflowId, 'on window', options?.windowId);
    return startWorkflowRun(options);
  });

  ipcMain.handle('rpa-cancel', async (_, runId: string) => {
    const ok = cancelRun(runId);
    return {success: ok, message: ok ? 'Run cancelled.' : 'Run not found.'};
  });

  // Enqueue a workflow across many profiles, honouring the thread limit.
  ipcMain.handle(
    'rpa-run-batch',
    async (_, workflowId: number, windowIds: number[], variables?: Record<string, unknown>) => {
      return RpaThreadManager.enqueueBatch(workflowId, windowIds, variables);
    },
  );

  ipcMain.handle('rpa-queue-status', async () => {
    return RpaThreadManager.status();
  });

  ipcMain.handle('rpa-queue-cancel-all', async () => {
    RpaThreadManager.cancelAll();
    return {success: true, message: 'Queue cleared.'};
  });

  // ---- Recorder -----------------------------------------------------------

  ipcMain.handle('rpa-recorder-start', async (_, windowId: number) => {
    return RpaRecorder.start(windowId);
  });

  ipcMain.handle('rpa-recorder-stop', async (_, sessionId: string) => {
    return RpaRecorder.stop(sessionId);
  });

  ipcMain.handle('rpa-recorder-events', async (_, sessionId: string) => {
    return RpaRecorder.events(sessionId);
  });

  // ---- Scheduler ----------------------------------------------------------

  void RpaScheduler.start().catch(error => {
    logger.error('failed to start rpa scheduler', error);
  });

  ipcMain.handle('rpa-schedule-list', async () => {
    return RpaScheduler.list();
  });

  ipcMain.handle('rpa-schedule-create', async (_, schedule: RpaScheduleInput) => {
    return RpaScheduler.create(schedule);
  });

  ipcMain.handle('rpa-schedule-toggle', async (_, id: string, enabled: boolean) => {
    return RpaScheduler.toggle(id, enabled);
  });

  ipcMain.handle('rpa-schedule-delete', async (_, id: string) => {
    return RpaScheduler.remove(id);
  });
};

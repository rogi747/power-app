import {createLogger} from '../../../../shared/utils/logger';
import {WINDOW_LOGGER_LABEL} from '../../constants';
import {getSettings} from '../../utils/get-settings';
import {getMainWindow} from '../../mainWindow';
import {runWorkflow} from './engine';

/**
 * RPA thread/queue manager.
 *
 * Runs at most N workflow executions concurrently (N derived from the existing
 * settings, falling back to a safe default). Additional jobs wait in a FIFO
 * queue. Each job drives one profile; concurrency is therefore "profiles run in
 * parallel" exactly as the spec requires, while never exceeding the configured
 * browser/thread budget.
 */

interface Job {
  id: string;
  workflowId: number;
  windowId: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variables?: Record<string, any>;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'error';
  runId?: string;
}

const logger = createLogger(WINDOW_LOGGER_LABEL);

const queue: Job[] = [];
const running = new Map<string, Job>();
let cancelledAll = false;

const concurrency = (): number => {
  try {
    // Reuse the existing settings surface; `maxConcurrent` is optional so we
    // clamp to a sane window (1..100 per the spec).
    const settings = getSettings() as unknown as {maxConcurrent?: number};
    const n = Number(settings?.maxConcurrent);
    if (Number.isFinite(n) && n > 0) return Math.min(n, 100);
  } catch {
    // settings not ready yet — fall through to default
  }
  return 5;
};

const uid = () => `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const emit = () => {
  getMainWindow()?.webContents.send('rpa-queue-event', status());
};

const pump = () => {
  if (cancelledAll) return;
  const limit = concurrency();
  while (running.size < limit) {
    const job = queue.shift();
    if (!job) break;
    job.status = 'running';
    running.set(job.id, job);
    emit();

    runWorkflow({workflowId: job.workflowId, windowId: job.windowId, variables: job.variables})
      .then(result => {
        job.status = result.status === 'completed' ? 'completed' : 'error';
        job.runId = result.runId;
      })
      .catch(error => {
        job.status = 'error';
        logger.error('rpa job failed', error);
      })
      .finally(() => {
        running.delete(job.id);
        emit();
        pump();
      });
  }
};

const enqueueBatch = (
  workflowId: number,
  windowIds: number[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variables?: Record<string, any>,
) => {
  cancelledAll = false;
  const jobs: Job[] = windowIds.map(windowId => ({
    id: uid(),
    workflowId,
    windowId,
    variables,
    status: 'queued',
  }));
  queue.push(...jobs);
  emit();
  pump();
  return {success: true, message: `Queued ${jobs.length} profile(s).`, data: {count: jobs.length}};
};

const status = () => ({
  queued: queue.length,
  running: running.size,
  limit: concurrency(),
  jobs: [...running.values(), ...queue].map(j => ({
    id: j.id,
    windowId: j.windowId,
    workflowId: j.workflowId,
    status: j.status,
  })),
});

const cancelAll = () => {
  cancelledAll = true;
  queue.length = 0;
  emit();
};

export const RpaThreadManager = {
  enqueueBatch,
  status,
  cancelAll,
};

import {randomUUID} from 'crypto';
import {createLogger} from '../../../../shared/utils/logger';
import {WINDOW_LOGGER_LABEL} from '../../constants';
import {getSettings} from '../../utils/get-settings';
import {getMainWindow} from '../../mainWindow';
import {cancelRun, runWorkflow} from './engine';

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
    job.runId = randomUUID();
    running.set(job.id, job);
    emit();

    runWorkflow(
      {workflowId: job.workflowId, windowId: job.windowId, variables: job.variables},
      undefined,
      job.runId,
    )
      .then(result => {
        job.status = result.status === 'completed' ? 'completed' : result.status === 'cancelled' ? 'cancelled' : 'error';
        job.runId = result.runId;
      })
      .catch(error => {
        job.status = cancelledAll ? 'cancelled' : 'error';
        logger.error('rpa job failed', error);
      })
      .finally(() => {
        running.delete(job.id);
        emit();
        pump();
      });
  }
};

const enqueueJobs = (
  workflowId: number,
  items: Array<{
    windowId: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variables?: Record<string, any>;
  }>,
) => {
  cancelledAll = false;
  const jobs: Job[] = items.map(item => ({
    id: uid(),
    workflowId,
    windowId: item.windowId,
    variables: item.variables,
    status: 'queued',
  }));
  queue.push(...jobs);
  emit();
  pump();
  return {success: true, message: `Queued ${jobs.length} job(s).`, data: {count: jobs.length}};
};

const enqueueBatch = (
  workflowId: number,
  windowIds: number[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variables?: Record<string, any>,
) => enqueueJobs(workflowId, windowIds.map(windowId => ({windowId, variables})));

const status = () => ({
  queued: queue.length,
  running: running.size,
  limit: concurrency(),
  jobs: [...running.values(), ...queue].map(j => ({
    id: j.id,
    runId: j.runId,
    windowId: j.windowId,
    workflowId: j.workflowId,
    status: j.status,
  })),
});

const cancelAll = () => {
  cancelledAll = true;
  queue.splice(0).forEach(job => {
    job.status = 'cancelled';
  });
  for (const job of running.values()) {
    if (job.runId) cancelRun(job.runId);
    job.status = 'cancelled';
  }
  emit();
};

export const RpaThreadManager = {
  enqueueBatch,
  enqueueJobs,
  status,
  cancelAll,
};

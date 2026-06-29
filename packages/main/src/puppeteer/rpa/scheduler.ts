import {randomUUID} from 'crypto';
import {createLogger} from '../../../../shared/utils/logger';
import {WINDOW_LOGGER_LABEL} from '../../constants';
import {getMainWindow} from '../../mainWindow';
import {RpaThreadManager} from './thread-manager';

/**
 * RPA scheduler.
 *
 * Fires a workflow on a cron expression against a set of profiles. Each tick
 * enqueues a batch through the thread manager so concurrency limits are still
 * respected.
 *
 * Implementation note: this ships a tiny self-contained cron evaluator instead
 * of pulling in `node-cron`, so the feature works with zero extra runtime
 * dependencies and across the Electron main bundle. It supports the standard
 * 5-field cron syntax (minute hour day-of-month month day-of-week) with `*`,
 * lists (`1,15`), ranges (`1-5`) and steps (`* /15`). A single 1s timer drives
 * all schedules.
 */

const logger = createLogger(WINDOW_LOGGER_LABEL);

export interface RpaScheduleInput {
  name: string;
  /** Standard 5-field cron expression: `m h dom mon dow`. */
  cron: string;
  workflowId: number;
  windowIds: number[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variables?: Record<string, any>;
  enabled?: boolean;
}

export interface RpaSchedule extends RpaScheduleInput {
  id: string;
  enabled: boolean;
  lastRun: string | null;
  valid: boolean;
}

const schedules = new Map<string, RpaSchedule>();
let ticker: ReturnType<typeof setInterval> | null = null;
let lastMinuteFired = -1;

/** Parse one cron field into the set of matching integers. */
const parseField = (field: string, min: number, max: number): Set<number> => {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? parseInt(stepPart, 10) : 1;
    let lo = min;
    let hi = max;
    if (rangePart !== '*' && rangePart !== '') {
      if (rangePart.includes('-')) {
        const [a, b] = rangePart.split('-').map(n => parseInt(n, 10));
        lo = a;
        hi = b;
      } else {
        lo = hi = parseInt(rangePart, 10);
      }
    }
    for (let v = lo; v <= hi; v += step) {
      if (v >= min && v <= max) out.add(v);
    }
  }
  return out;
};

export const validate = (expr: string): boolean => {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  try {
    parseField(fields[0], 0, 59);
    parseField(fields[1], 0, 23);
    parseField(fields[2], 1, 31);
    parseField(fields[3], 1, 12);
    parseField(fields[4], 0, 6);
    return true;
  } catch {
    return false;
  }
};

const matches = (expr: string, d: Date): boolean => {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return (
    parseField(fields[0], 0, 59).has(d.getMinutes()) &&
    parseField(fields[1], 0, 23).has(d.getHours()) &&
    parseField(fields[2], 1, 31).has(d.getDate()) &&
    parseField(fields[3], 1, 12).has(d.getMonth() + 1) &&
    parseField(fields[4], 0, 6).has(d.getDay())
  );
};

const emit = () => {
  getMainWindow()?.webContents.send('rpa-schedule-event', list());
};

const fire = (schedule: RpaSchedule) => {
  logger.info(`Schedule ${schedule.id} firing for workflow ${schedule.workflowId}`);
  schedule.lastRun = new Date().toISOString();
  RpaThreadManager.enqueueBatch(
    schedule.workflowId,
    schedule.windowIds,
    schedule.variables,
  );
};

const tick = () => {
  const now = new Date();
  // Fire at most once per clock-minute.
  if (now.getMinutes() === lastMinuteFired) return;
  lastMinuteFired = now.getMinutes();
  let fired = false;
  for (const schedule of schedules.values()) {
    if (schedule.enabled && schedule.valid && matches(schedule.cron, now)) {
      fire(schedule);
      fired = true;
    }
  }
  if (fired) emit();
};

const ensureTicker = () => {
  if (ticker) return;
  ticker = setInterval(tick, 1000);
};

export const list = (): RpaSchedule[] => Array.from(schedules.values());

export const create = (input: RpaScheduleInput): RpaSchedule => {
  const schedule: RpaSchedule = {
    ...input,
    id: `sch_${randomUUID()}`,
    enabled: input.enabled ?? true,
    lastRun: null,
    valid: validate(input.cron),
  };
  schedules.set(schedule.id, schedule);
  ensureTicker();
  emit();
  return schedule;
};

export const toggle = (id: string, enabled: boolean): RpaSchedule | undefined => {
  const schedule = schedules.get(id);
  if (!schedule) return undefined;
  schedule.enabled = enabled;
  emit();
  return schedule;
};

export const remove = (id: string): {success: boolean} => {
  const ok = schedules.delete(id);
  emit();
  return {success: ok};
};

/** Stop the ticker and clear all schedules (e.g. on app quit). */
export const disposeAll = () => {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
  schedules.clear();
};

export const RpaScheduler = {list, create, toggle, remove, disposeAll, validate};

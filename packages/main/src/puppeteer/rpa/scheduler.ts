import {randomUUID} from 'crypto';
import type {RPA} from '../../../../shared/types/rpa';
import {createLogger} from '../../../../shared/utils/logger';
import {WINDOW_LOGGER_LABEL} from '../../constants';
import {RpaDB} from '../../db/rpa';
import {getMainWindow} from '../../mainWindow';
import {RpaThreadManager} from './thread-manager';

/**
 * RPA scheduler.
 *
 * Schedules are persisted in SQLite and loaded into a small in-memory cache for
 * the ticking loop. SQLite is the source of truth; the cache only avoids DB work
 * every second. Each fire enqueues a batch through the thread manager so the
 * existing concurrency limit is respected.
 *
 * Cron support: standard 5-field syntax (minute hour day-of-month month
 * day-of-week) with star wildcards, lists (`1,15`), ranges (`1-5`) and step values.
 */

const logger = createLogger(WINDOW_LOGGER_LABEL);

export type RpaScheduleInput = RPA.ScheduleInput;
export type RpaSchedule = RPA.ScheduleRecord;

const schedules = new Map<string, RpaSchedule>();
const firedMinuteKeys = new Set<string>();
let ticker: ReturnType<typeof setInterval> | null = null;
let loaded = false;

/** Parse one cron field into the set of matching integers. */
const parseField = (field: string, min: number, max: number): Set<number> => {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? parseInt(stepPart, 10) : 1;
    if (!Number.isFinite(step) || step <= 0) throw new Error('Invalid cron step');

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
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) {
      throw new Error('Invalid cron range');
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

const minuteKey = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
};

const pruneFiredMinuteKeys = (currentKey: string) => {
  // Keep only the current key. This avoids unbounded growth while still
  // preventing double-fires inside the same minute.
  for (const key of firedMinuteKeys) {
    if (key !== currentKey) firedMinuteKeys.delete(key);
  }
};

const emit = () => {
  getMainWindow()?.webContents.send('rpa-schedule-event', list());
};

const upsertCache = (schedule: RpaSchedule) => {
  schedules.set(schedule.id, schedule);
};

const refreshCache = async () => {
  const rows = await RpaDB.listSchedules();
  schedules.clear();
  rows.forEach(upsertCache);
  loaded = true;
};

const ensureLoaded = async () => {
  if (loaded) return;
  await refreshCache();
};

const fire = async (schedule: RpaSchedule) => {
  logger.info(`Schedule ${schedule.id} firing for workflow ${schedule.workflowId}`);
  const lastRun = new Date().toISOString();
  schedule.lastRun = lastRun;
  await RpaDB.updateSchedule(schedule.id, {lastRun});
  RpaThreadManager.enqueueBatch(
    schedule.workflowId,
    schedule.windowIds,
    schedule.variables,
  );
};

const tick = async () => {
  try {
    await ensureLoaded();
    const now = new Date();
    const key = minuteKey(now);
    pruneFiredMinuteKeys(key);

    let fired = false;
    for (const schedule of schedules.values()) {
      const scheduleKey = `${schedule.id}:${key}`;
      if (firedMinuteKeys.has(scheduleKey)) continue;
      if (schedule.enabled && schedule.valid && matches(schedule.cron, now)) {
        firedMinuteKeys.add(scheduleKey);
        await fire(schedule);
        fired = true;
      }
    }
    if (fired) emit();
  } catch (error) {
    logger.error('RPA scheduler tick failed', error);
  }
};

const ensureTicker = () => {
  if (ticker) return;
  ticker = setInterval(() => void tick(), 1000);
};

export const start = async () => {
  await refreshCache();
  ensureTicker();
  emit();
};

export const list = (): RpaSchedule[] => Array.from(schedules.values());

export const create = async (input: RpaScheduleInput): Promise<RpaSchedule> => {
  await ensureLoaded();
  const schedule: RpaSchedule = {
    ...input,
    id: `sch_${randomUUID()}`,
    enabled: input.enabled ?? true,
    lastRun: null,
    valid: validate(input.cron),
  };
  const created = await RpaDB.createSchedule(schedule);
  upsertCache(created);
  ensureTicker();
  emit();
  return created;
};

export const toggle = async (id: string, enabled: boolean): Promise<RpaSchedule | undefined> => {
  await ensureLoaded();
  const updated = await RpaDB.updateSchedule(id, {enabled});
  if (!updated) return undefined;
  upsertCache(updated);
  emit();
  return updated;
};

export const remove = async (id: string): Promise<{success: boolean}> => {
  await ensureLoaded();
  const ok = await RpaDB.deleteSchedule(id);
  schedules.delete(id);
  emit();
  return {success: ok};
};

/** Stop the ticker and clear runtime cache (e.g. on app quit). */
export const disposeAll = () => {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
  schedules.clear();
  firedMinuteKeys.clear();
  loaded = false;
};

export const RpaScheduler = {start, list, create, toggle, remove, disposeAll, validate};

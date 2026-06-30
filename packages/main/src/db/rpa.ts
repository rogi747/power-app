import {db} from '.';
import type {RPA} from '../../../shared/types/rpa';
import {decryptWorkflowSecrets, encryptWorkflowSecrets} from '../puppeteer/rpa/secrets';

/**
 * Browser RPA persistence layer.
 *
 * Reuses the project's single knex/sqlite connection (db/index.ts); it never
 * opens a second database. The workflow `definition` is stored as serialised
 * JSON in a text column and parsed back into RPA.Workflow on read.
 */

interface WorkflowRow {
  id?: number;
  name: string;
  description?: string | null;
  definition: string;
  folder?: string | null;
  tags?: string | null;
  pinned?: boolean;
  favorite?: boolean;
  status?: number;
  created_at?: string;
  updated_at?: string | null;
}

interface ScheduleRow {
  id: string;
  name: string;
  cron: string;
  workflow_id: number;
  workflow_name?: string | null;
  window_ids: string;
  variables?: string | null;
  enabled?: boolean | number;
  valid?: boolean | number;
  last_run?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

const serializeTags = (tags?: string | string[] | null): string | null => {
  if (tags == null) return null;
  return Array.isArray(tags) ? JSON.stringify(tags) : tags;
};

const parseTags = (raw?: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return raw.split(',').map(t => t.trim()).filter(Boolean);
  }
};

const parseJsonValue = <T>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const fromRow = (row: WorkflowRow): RPA.WorkflowRecord => {
  let definition: RPA.Workflow | undefined;
  try {
    definition = decryptWorkflowSecrets(JSON.parse(row.definition) as RPA.Workflow);
  } catch {
    definition = undefined;
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    definition,
    folder: row.folder ?? null,
    tags: parseTags(row.tags),
    pinned: !!row.pinned,
    favorite: !!row.favorite,
    status: row.status ?? 1,
    created_at: row.created_at,
    updated_at: row.updated_at ?? undefined,
  };
};

const toRow = (record: RPA.WorkflowRecord): Partial<WorkflowRow> => {
  const row: Partial<WorkflowRow> = {};
  if (record.name !== undefined) row.name = record.name;
  if (record.description !== undefined) row.description = record.description ?? null;
  if (record.definition !== undefined) {
    const definition =
      typeof record.definition === 'string'
        ? (JSON.parse(record.definition) as RPA.Workflow)
        : record.definition;
    row.definition = JSON.stringify(encryptWorkflowSecrets(definition));
  }
  if (record.folder !== undefined) row.folder = record.folder ?? null;
  if (record.tags !== undefined) row.tags = serializeTags(record.tags);
  if (record.pinned !== undefined) row.pinned = record.pinned;
  if (record.favorite !== undefined) row.favorite = record.favorite;
  if (record.status !== undefined) row.status = record.status;
  return row;
};

// ---- Workflow CRUD --------------------------------------------------------

const all = async (includeDeleted = false): Promise<RPA.WorkflowRecord[]> => {
  const query = db('rpa_workflow').select('*').orderBy('updated_at', 'desc');
  if (!includeDeleted) query.where('status', 1);
  const rows: WorkflowRow[] = await query;
  return rows.map(fromRow);
};

const getById = async (id: number): Promise<RPA.WorkflowRecord | undefined> => {
  const row: WorkflowRow | undefined = await db('rpa_workflow').where({id}).first();
  return row ? fromRow(row) : undefined;
};

const create = async (record: RPA.WorkflowRecord) => {
  const row = toRow(record);
  const insertData = {
    ...row,
    definition: row.definition ?? JSON.stringify(encryptWorkflowSecrets(emptyWorkflow())),
    status: 1,
    created_at: new Date().toISOString(),
  } as WorkflowRow;
  const [id] = await db('rpa_workflow').insert(insertData);
  return {success: true, message: 'Workflow created successfully.', data: {id}};
};

const update = async (id: number, record: RPA.WorkflowRecord) => {
  try {
    await db('rpa_workflow')
      .where({id})
      .update({...toRow(record), updated_at: new Date().toISOString()});
    return {success: true, message: 'Workflow updated successfully.'};
  } catch (error) {
    return {success: false, message: 'Failed to update workflow. ' + error};
  }
};

/** Soft delete: keep the row but flag it so it can be recovered. */
const softDelete = async (id: number) => {
  await db('rpa_workflow')
    .where({id})
    .update({status: 0, updated_at: new Date().toISOString()});
  return {success: true, message: 'Workflow moved to trash.'};
};

const restore = async (id: number) => {
  await db('rpa_workflow')
    .where({id})
    .update({status: 1, updated_at: new Date().toISOString()});
  return {success: true, message: 'Workflow restored.'};
};

/** Hard delete: permanently remove the row. */
const remove = async (id: number) => {
  return await db('rpa_workflow').where({id}).delete();
};

const duplicate = async (id: number) => {
  const source = await getById(id);
  if (!source) return {success: false, message: 'Workflow not found.'};
  return create({
    ...source,
    id: undefined,
    name: `${source.name} (copy)`,
  });
};

const emptyWorkflow = (): RPA.Workflow => ({
  nodes: [
    {
      id: 'start',
      type: 'start',
      label: 'Start',
      position: {x: 80, y: 120},
      params: {},
    },
  ],
  edges: [],
  variables: [],
  settings: {defaultTimeout: 30000, defaultRetry: 0, continueOnError: false},
  version: 1,
  metadata: {},
});

// ---- Task logs ------------------------------------------------------------

const insertLog = async (log: RPA.TaskLog) => {
  const [id] = await db('rpa_task_log').insert({
    run_id: log.run_id,
    workflow_id: log.workflow_id ?? null,
    workflow_name: log.workflow_name ?? null,
    node_id: log.node_id ?? null,
    node_type: log.node_type ?? null,
    window_id: log.window_id ?? null,
    profile_id: log.profile_id ?? null,
    thread_id: log.thread_id ?? null,
    status: log.status ?? null,
    message: log.message ?? null,
    stack: log.stack ?? null,
    artifact_dir: log.artifact_dir ?? null,
    screenshot_path: log.screenshot_path ?? null,
    html_path: log.html_path ?? null,
    current_url: log.current_url ?? null,
    retry_count: log.retry_count ?? 0,
    started_at: log.started_at ?? null,
    finished_at: log.finished_at ?? null,
    duration: log.duration ?? null,
    created_at: new Date().toISOString(),
  });
  return id;
};

const getLogs = async (filter?: {
  runId?: string;
  workflowId?: number;
  status?: string;
  limit?: number;
}): Promise<RPA.TaskLog[]> => {
  const query = db('rpa_task_log').select('*').orderBy('id', 'desc');
  if (filter?.runId) query.where('run_id', filter.runId);
  if (filter?.workflowId) query.where('workflow_id', filter.workflowId);
  if (filter?.status) query.where('status', filter.status);
  query.limit(filter?.limit ?? 500);
  return await query;
};

const clearLogs = async (workflowId?: number) => {
  const query = db('rpa_task_log');
  if (workflowId) query.where('workflow_id', workflowId);
  return await query.delete();
};

// ---- Scheduler ------------------------------------------------------------

const scheduleFromRow = (row: ScheduleRow): RPA.ScheduleRecord => ({
  id: row.id,
  name: row.name,
  cron: row.cron,
  workflowId: row.workflow_id,
  workflowName: row.workflow_name ?? undefined,
  windowIds: parseJsonValue<number[]>(row.window_ids, []),
  variables: parseJsonValue<Record<string, unknown> | undefined>(row.variables, undefined),
  enabled: !!row.enabled,
  valid: !!row.valid,
  lastRun: row.last_run ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at ?? undefined,
});

const scheduleToRow = (schedule: RPA.ScheduleRecord): ScheduleRow => ({
  id: schedule.id,
  name: schedule.name,
  cron: schedule.cron,
  workflow_id: schedule.workflowId,
  window_ids: JSON.stringify(schedule.windowIds ?? []),
  variables: schedule.variables ? JSON.stringify(schedule.variables) : null,
  enabled: schedule.enabled,
  valid: schedule.valid,
  last_run: schedule.lastRun ?? null,
  created_at: schedule.created_at,
  updated_at: schedule.updated_at ?? null,
});

const listSchedules = async (): Promise<RPA.ScheduleRecord[]> => {
  const rows: ScheduleRow[] = await db('rpa_schedule')
    .select('rpa_schedule.*', 'rpa_workflow.name as workflow_name')
    .leftJoin('rpa_workflow', 'rpa_schedule.workflow_id', '=', 'rpa_workflow.id')
    .orderBy('rpa_schedule.created_at', 'desc');
  return rows.map(scheduleFromRow);
};

const createSchedule = async (schedule: RPA.ScheduleRecord): Promise<RPA.ScheduleRecord> => {
  const now = new Date().toISOString();
  const record = {...schedule, created_at: now, updated_at: now};
  await db('rpa_schedule').insert(scheduleToRow(record));
  return record;
};

const updateSchedule = async (
  id: string,
  changes: Partial<RPA.ScheduleRecord>,
): Promise<RPA.ScheduleRecord | undefined> => {
  const row: ScheduleRow | undefined = await db('rpa_schedule').where({id}).first();
  if (!row) return undefined;
  const current = scheduleFromRow(row);
  const next: RPA.ScheduleRecord = {
    ...current,
    ...changes,
    id,
    updated_at: new Date().toISOString(),
  };
  await db('rpa_schedule').where({id}).update(scheduleToRow(next));
  return next;
};

const deleteSchedule = async (id: string): Promise<boolean> => {
  const count = await db('rpa_schedule').where({id}).delete();
  return count > 0;
};

export const RpaDB = {
  all,
  getById,
  create,
  update,
  softDelete,
  restore,
  remove,
  duplicate,
  emptyWorkflow,
  insertLog,
  getLogs,
  clearLogs,
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
};

import {randomUUID} from 'crypto';
import type {RPA} from '../../../../shared/types/rpa';
import {firstValidationMessage, validateWorkflow} from '../../../../shared/rpa/validator';
import {createLogger} from '../../../../shared/utils/logger';
import {WINDOW_LOGGER_LABEL} from '../../constants';
import {WindowDB} from '../../db/window';
import {RpaDB} from '../../db/rpa';
import {getMainWindow} from '../../mainWindow';
import {acquireSession, releaseSession} from './browser-session';
import {getNode, type ExecutionContext, type NodeResult} from './registry';
import {resolveParams} from './variables';

// Side-effect imports: registering the built-in node library.
import './nodes/browser-nodes';
import './nodes/logic-nodes';
import './nodes/integration-nodes';

const logger = createLogger(WINDOW_LOGGER_LABEL);

/** Tracks in-flight runs so they can be cancelled by id. */
const activeRuns = new Map<string, {cancelled: boolean}>();

export const cancelRun = (runId: string): boolean => {
  const run = activeRuns.get(runId);
  if (run) {
    run.cancelled = true;
    return true;
  }
  return false;
};

interface Graph {
  nodes: Map<string, RPA.Node>;
  /** node id -> outgoing edges. */
  out: Map<string, RPA.Edge[]>;
}

const buildGraph = (wf: RPA.Workflow): Graph => {
  const nodes = new Map<string, RPA.Node>();
  wf.nodes.forEach(n => nodes.set(n.id, n));
  const out = new Map<string, RPA.Edge[]>();
  wf.edges.forEach(e => {
    const list = out.get(e.source) ?? [];
    list.push(e);
    out.set(e.source, list);
  });
  return {nodes, out};
};

/** Prefer the explicit Start node; otherwise fall back to a node with no incoming edges. */
const findStart = (wf: RPA.Workflow): RPA.Node | undefined => {
  const explicit = wf.nodes.find(n => n.type === 'start' && !n.isGroup);
  if (explicit) return explicit;
  const targets = new Set(wf.edges.map(e => e.target));
  return wf.nodes.find(n => !targets.has(n.id) && !n.isGroup);
};

/** Pick the next node id following a given source, honouring a branch handle. */
const nextNode = (graph: Graph, fromId: string, branch?: string): string | undefined => {
  const edges = graph.out.get(fromId) ?? [];
  if (branch) {
    const branched = edges.find(e => e.sourceHandle === branch);
    if (branched) return branched.target;
  }
  return edges[0]?.target;
};

/** Run a single node with the timeout + retry policy applied. */
const runNodeWithPolicy = async (
  node: RPA.Node,
  ctx: ExecutionContext,
  defaults: RPA.WorkflowSettings,
): Promise<NodeResult | void> => {
  const def = getNode(node.type);
  if (!def) {
    throw new Error(`Unknown node type: ${node.type}`);
  }
  const policy = node.error ?? {};
  const maxRetry = policy.onError === 'retry' ? policy.retryCount ?? defaults.defaultRetry ?? 0 : 0;
  const timeout = policy.timeout ?? defaults.defaultTimeout ?? 30000;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const exec = def.execute(node, ctx);
      const guarded = Promise.race([
        exec,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Node timed out after ${timeout}ms`)), timeout),
        ),
      ]);
      return await guarded;
    } catch (error) {
      attempt += 1;
      if (attempt <= maxRetry) {
        await ctx.log({
          node_id: node.id,
          node_type: node.type,
          status: 'retry',
          retry_count: attempt,
          message: `Retry ${attempt}/${maxRetry}: ${String(error)}`,
        });
        if (policy.retryInterval) {
          await new Promise(r => setTimeout(r, policy.retryInterval));
        }
        continue;
      }
      throw error;
    }
  }
};

/** Start a workflow in the background and return a run id immediately. */
export const startWorkflowRun = (options: RPA.RunOptions): RPA.RunResult => {
  const runId = randomUUID();
  void runWorkflow(options, undefined, runId).catch(error => {
    logger.error('background rpa run failed', error);
  });
  return {runId, status: 'running', variables: {}};
};

/**
 * Execute a workflow against a single profile. The traversal walks the edge
 * graph from the start node; `loop` containers re-run their body via the
 * `loopBody` edge handle until their count/condition is exhausted.
 */
export const runWorkflow = async (
  options: RPA.RunOptions,
  record?: RPA.WorkflowRecord,
  runIdOverride?: string,
): Promise<RPA.RunResult> => {
  const runId = runIdOverride ?? randomUUID();
  const runState = {cancelled: false};
  activeRuns.set(runId, runState);

  const wfRecord = record ?? (await RpaDB.getById(options.workflowId));
  const definition =
    typeof wfRecord?.definition === 'string'
      ? (JSON.parse(wfRecord.definition) as RPA.Workflow)
      : (wfRecord?.definition as RPA.Workflow | undefined);

  if (!definition) {
    activeRuns.delete(runId);
    return {runId, status: 'error', variables: {}, error: 'Workflow definition not found'};
  }

  const validation = validateWorkflow(definition);
  if (!validation.valid) {
    activeRuns.delete(runId);
    return {runId, status: 'error', variables: {}, error: firstValidationMessage(validation)};
  }

  const windowData = await WindowDB.getById(options.windowId);
  const profileId = windowData?.profile_id ?? null;

  // Seed variables: declared defaults first, then run-time overrides.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variables: Record<string, any> = {};
  (definition.variables ?? []).forEach(v => {
    if (v.value !== undefined) variables[v.name] = v.value;
  });
  Object.assign(variables, options.variables ?? {});

  const log = async (entry: Partial<RPA.TaskLog>) => {
    const row: RPA.TaskLog = {
      run_id: runId,
      workflow_id: options.workflowId ?? null,
      workflow_name: wfRecord?.name,
      window_id: options.windowId,
      profile_id: profileId,
      thread_id: options.windowId ? String(options.windowId) : null,
      ...entry,
    };
    try {
      await RpaDB.insertLog(row);
    } catch (e) {
      logger.error('failed to persist rpa log', e);
    }
    getMainWindow()?.webContents.send('rpa-run-event', row);
  };

  await log({status: 'running', message: 'Workflow started'});

  let session;
  let finalStatus: RPA.TaskStatus = 'completed';
  let runError: string | undefined;

  try {
    session = await acquireSession(options.windowId);
    const ctx: ExecutionContext = {
      runId,
      workflowId: options.workflowId ?? null,
      workflowName: wfRecord?.name ?? '',
      windowId: options.windowId,
      profileId,
      threadId: String(options.windowId),
      page: session.page,
      variables,
      cancelled: false,
      log,
    };

    const graph = buildGraph(definition);
    const start = findStart(definition);
    if (!start) throw new Error('Workflow has no start node');

    await executeFrom(start.id, graph, ctx, definition.settings ?? {}, runState, options);
  } catch (error) {
    finalStatus = runState.cancelled ? 'cancelled' : 'error';
    runError = String(error instanceof Error ? error.message : error);
    await log({status: finalStatus, message: runError, stack: (error as Error)?.stack});
  } finally {
    if (session) await releaseSession(session);
    activeRuns.delete(runId);
  }

  if (finalStatus === 'completed') {
    await log({status: 'completed', message: 'Workflow finished'});
  }
  return {runId, status: finalStatus, variables, error: runError};
};

/** Sequentially walk nodes from a starting id until a chain ends. */
const executeFrom = async (
  startId: string | undefined,
  graph: Graph,
  ctx: ExecutionContext,
  settings: RPA.WorkflowSettings,
  runState: {cancelled: boolean},
  options: RPA.RunOptions,
  stopAt?: string,
): Promise<NodeResult | void> => {
  let currentId: string | undefined = startId;

  while (currentId && currentId !== stopAt) {
    if (runState.cancelled) {
      ctx.cancelled = true;
      throw new Error('Run cancelled');
    }
    const node = graph.nodes.get(currentId);
    if (!node) break;

    if (node.disabled) {
      currentId = nextNode(graph, currentId);
      continue;
    }

    // Debug breakpoint: pause is represented as a logged stop in this slice.
    if (options.debug && options.breakpoints?.includes(node.id)) {
      await ctx.log({node_id: node.id, node_type: node.type, status: 'paused', message: 'Breakpoint'});
    }

    const startedAt = Date.now();
    await ctx.log({
      node_id: node.id,
      node_type: node.type,
      status: 'running',
      started_at: new Date(startedAt).toISOString(),
    });

    if (node.type === 'loop') {
      const loopResult = await runLoop(node, graph, ctx, settings, runState, options);
      await logFinished(ctx, node, startedAt);
      if (loopResult?.end || loopResult?.break || loopResult?.continue) return loopResult;
      currentId = nextNode(graph, currentId);
      continue;
    }

    let result: NodeResult | void;
    try {
      result = await runNodeWithPolicy(node, ctx, settings);
    } catch (error) {
      const policy = node.error ?? {};
      await ctx.log({
        node_id: node.id,
        node_type: node.type,
        status: 'error',
        message: String(error),
        stack: (error as Error)?.stack,
      });
      if (policy.onError === 'skip' || policy.onError === 'continue' || settings.continueOnError) {
        currentId = nextNode(graph, currentId);
        continue;
      }
      if (policy.onError === 'jump' && policy.jumpTo) {
        currentId = policy.jumpTo;
        continue;
      }
      throw error;
    }

    await logFinished(ctx, node, startedAt);

    if (result?.end || result?.break || result?.continue) {
      return result; // bubble up to the enclosing loop / caller
    }
    if (result?.jumpTo) {
      currentId = result.jumpTo;
      continue;
    }
    currentId = nextNode(graph, currentId, result?.branch);
  }
};

const runLoop = async (
  node: RPA.Node,
  graph: Graph,
  ctx: ExecutionContext,
  settings: RPA.WorkflowSettings,
  runState: {cancelled: boolean},
  options: RPA.RunOptions,
): Promise<NodeResult | void> => {
  const params = resolveParams(node.params, ctx.variables);
  const bodyEdge = (graph.out.get(node.id) ?? []).find(e => e.sourceHandle === 'loopBody');
  const bodyStart = bodyEdge?.target;
  if (!bodyStart) return;

  const items: unknown[] = Array.isArray(params.items)
    ? params.items
    : params.count
    ? Array.from({length: Number(params.count)})
    : [];

  for (let i = 0; i < items.length; i++) {
    if (runState.cancelled) throw new Error('Run cancelled');
    if (params.itemVar) ctx.variables[String(params.itemVar)] = items[i];
    if (params.indexVar) ctx.variables[String(params.indexVar)] = i;
    const signal = await executeFrom(bodyStart, graph, ctx, settings, runState, options);
    if (signal?.end) return signal;
    if (signal?.break) break;
  }
};

const logFinished = async (ctx: ExecutionContext, node: RPA.Node, startedAt: number) => {
  const finishedAt = Date.now();
  await ctx.log({
    node_id: node.id,
    node_type: node.type,
    status: 'completed',
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date(finishedAt).toISOString(),
    duration: finishedAt - startedAt,
  });
};

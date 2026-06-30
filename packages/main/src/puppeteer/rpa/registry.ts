import type {Page} from 'puppeteer';
import type {RPA} from '../../../../shared/types/rpa';
import type {RpaCancellationToken} from './cancellation';

/** Mutable run-time state shared across all nodes in one execution. */
export interface ExecutionContext {
  runId: string;
  workflowId: number | null;
  workflowName: string;
  windowId: number;
  profileId: string | null;
  threadId: string | null;
  page: Page;
  /** Flat variable bag, keyed by name. Resolved with `{{name}}` templates. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variables: Record<string, any>;
  /** Cooperative cancellation flag checked between nodes. */
  cancelled: boolean;
  /** Shared cancellation token for delay/fetch/native waits. */
  token: RpaCancellationToken;
  /** Structured logger that also persists a TaskLog row + emits to the UI. */
  log: (entry: Partial<RPA.TaskLog>) => Promise<void> | void;
}

/**
 * Control-flow result a node may return to steer the engine. Most nodes return
 * nothing (continue to the next node). Logic nodes use these signals.
 */
export interface NodeResult {
  /** For branching nodes: which source handle to follow ('true' / 'false'). */
  branch?: string;
  /** Stop the workflow gracefully. */
  end?: boolean;
  /** Break out of the nearest enclosing loop. */
  break?: boolean;
  /** Skip to the next loop iteration. */
  continue?: boolean;
  /** Jump directly to a node id (used by error policy 'jump'). */
  jumpTo?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output?: any;
}

export type NodeExecutor = (
  node: RPA.Node,
  ctx: ExecutionContext,
) => Promise<NodeResult | void>;

export interface NodeDefinition {
  type: string;
  /** Human-readable category for the builder palette. */
  category: 'browser' | 'logic' | 'data' | 'variable' | 'integration';
  execute: NodeExecutor;
}

const registry = new Map<string, NodeDefinition>();

export const registerNode = (def: NodeDefinition): void => {
  if (registry.has(def.type)) {
    throw new Error(`Duplicate RPA node type registered: ${def.type}`);
  }
  registry.set(def.type, def);
};

export const getNode = (type: string): NodeDefinition | undefined => registry.get(type);

export const registerNodeAlias = (aliasType: string, targetType: string): void => {
  const target = registry.get(targetType);
  if (!target) {
    throw new Error(`Cannot register RPA node alias ${aliasType}: target ${targetType} not found`);
  }
  if (registry.has(aliasType)) return;
  registry.set(aliasType, {...target, type: aliasType});
};

export const listNodes = (): NodeDefinition[] => [...registry.values()];

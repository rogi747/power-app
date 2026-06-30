// types/rpa.d.ts
//
// Browser RPA system shared types. Kept in `shared` so that main (engine,
// db, services), preload (bridge) and renderer (builder UI) all consume the
// exact same workflow contract. The execution engine depends ONLY on these
// JSON-serialisable structures, never on the UI.

export namespace RPA {
  /** A single connection between two node ports on the canvas. */
  export interface Edge {
    id: string;
    /** Source node id. */
    source: string;
    /** Target node id. */
    target: string;
    /** Optional source handle (e.g. 'true' / 'false' for an If node). */
    sourceHandle?: string | null;
    /** Optional target handle. */
    targetHandle?: string | null;
  }

  /** Canvas position of a node, persisted so the layout round-trips. */
  export interface NodePosition {
    x: number;
    y: number;
  }

  /** Per-node error handling policy. */
  export interface NodeErrorPolicy {
    /** What to do when the node throws. */
    onError?: 'stop' | 'skip' | 'continue' | 'retry' | 'jump';
    /** When onError === 'retry', how many times to retry. */
    retryCount?: number;
    /** Delay between retries, in milliseconds. */
    retryInterval?: number;
    /** Hard timeout for the node, in milliseconds. */
    timeout?: number;
    /** When onError === 'jump', the node id to jump to. */
    jumpTo?: string;
  }

  /**
   * A workflow node. `type` selects the executor from the node registry;
   * `params` is an opaque, node-specific bag validated by that executor.
   * Values inside `params` may contain `{{variable}}` templates that the
   * engine resolves at run time.
   */
  export interface Node {
    id: string;
    type: string;
    label?: string;
    position: NodePosition;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params?: Record<string, any>;
    error?: NodeErrorPolicy;
    /** Optional parent id when the node lives inside a group. */
    parentId?: string | null;
    /** True for grouping container nodes. */
    isGroup?: boolean;
    /** Set true to skip this node during execution without deleting it. */
    disabled?: boolean;
  }

  /** A workflow-scoped variable declaration. */
  export interface Variable {
    name: string;
    scope: 'local' | 'global' | 'environment';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value?: any;
    secret?: boolean;
  }

  /** Run-level settings that the engine honours. */
  export interface WorkflowSettings {
    /** Default per-node timeout (ms) when a node does not set its own. */
    defaultTimeout?: number;
    /** Default retry count applied to nodes without an explicit policy. */
    defaultRetry?: number;
    /** Continue running remaining nodes even after an unhandled error. */
    continueOnError?: boolean;
  }

  /** The canonical workflow document. This is the unit the engine executes. */
  export interface Workflow {
    nodes: Node[];
    edges: Edge[];
    variables: Variable[];
    settings: WorkflowSettings;
    /** Schema version, bumped when the workflow shape changes. */
    version: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>;
  }

  /** A stored workflow record (db-facing). `definition` is the Workflow JSON. */
  export interface WorkflowRecord {
    id?: number;
    name?: string;
    description?: string;
    /** Serialised Workflow JSON when read/written as a string column. */
    definition?: string | Workflow;
    folder?: string | null;
    tags?: string | string[] | null;
    pinned?: boolean;
    favorite?: boolean;
    /** 1: active, 0: soft-deleted. */
    status?: number;
    created_at?: string;
    updated_at?: string;
  }

  export type TaskStatus =
    | 'waiting'
    | 'queued'
    | 'running'
    | 'paused'
    | 'completed'
    | 'cancelled'
    | 'error'
    | 'retry';

  /** One log row per node execution (and one summary row per run). */
  export interface TaskLog {
    id?: number;
    /** Run identifier grouping all node logs of a single execution. */
    run_id?: string;
    workflow_id?: number | null;
    workflow_name?: string;
    /** The node this log entry belongs to; null for run-level summary rows. */
    node_id?: string | null;
    node_type?: string | null;
    window_id?: number | null;
    profile_id?: string | null;
    thread_id?: string | null;
    status?: TaskStatus;
    message?: string;
    stack?: string;
    /** Directory containing debug artifacts for a failed node/run. */
    artifact_dir?: string | null;
    /** Screenshot captured when a node failed. */
    screenshot_path?: string | null;
    /** HTML snapshot captured when a node failed. */
    html_path?: string | null;
    /** Page URL at the time of the log entry. */
    current_url?: string | null;
    retry_count?: number;
    started_at?: string;
    finished_at?: string;
    /** Duration in milliseconds. */
    duration?: number;
    created_at?: string;
  }

  /** Persisted cron schedule for running workflows in the background. */
  export interface ScheduleRecord {
    id: string;
    name: string;
    /** Standard 5-field cron expression: `m h dom mon dow`. */
    cron: string;
    workflowId: number;
    workflowName?: string;
    windowIds: number[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variables?: Record<string, any>;
    enabled: boolean;
    valid: boolean;
    lastRun: string | null;
    created_at?: string;
    updated_at?: string;
  }

  export interface ScheduleInput {
    name: string;
    cron: string;
    workflowId: number;
    windowIds: number[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variables?: Record<string, any>;
    enabled?: boolean;
  }

  export type RecorderEventType =
    | 'click'
    | 'input'
    | 'change'
    | 'submit'
    | 'navigation';

  export interface RecorderEvent {
    id: string;
    type: RecorderEventType;
    url: string;
    title?: string;
    selector?: string;
    text?: string;
    value?: string;
    tagName?: string;
    timestamp: string;
  }

  export interface RecorderSession {
    id: string;
    windowId: number;
    startedAt: string;
    eventCount: number;
  }

  export interface SelectorPickResult {
    selector: string;
    url: string;
    title?: string;
    text?: string;
    value?: string;
    tagName?: string;
    timestamp: string;
  }

  /** Result returned to the caller after a run finishes. */
  export interface RunResult {
    runId: string;
    status: TaskStatus;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variables: Record<string, any>;
    error?: string;
  }

  /** Options passed when starting a run for a single profile. */
  export interface RunOptions {
    workflowId: number;
    /** The profile/window to drive. Reuses the existing window lifecycle. */
    windowId: number;
    /** Override variables for this run (e.g. row data from a sheet). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variables?: Record<string, any>;
    /** Debug mode toggles step/breakpoint behaviour in the engine. */
    debug?: boolean;
    /** Node ids that should pause execution when reached (debug). */
    breakpoints?: string[];
  }

  export interface RunDataJob {
    windowId: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variables?: Record<string, any>;
  }
}

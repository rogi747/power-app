// Redux slice for the RPA Process Builder.
//
// App-level workflow state (the node/edge model, selected node, dirty flag,
// run status) lives here so the palette, canvas and property panels stay in
// sync. The canvas component keeps its own internal viewport/drag state; only
// the persisted node/edge data is mirrored into Redux.
import {createSlice, type PayloadAction} from '@reduxjs/toolkit';
import type {RPA} from '../../../shared/types/rpa';

interface BuilderSnapshot {
  nodes: RPA.Node[];
  edges: RPA.Edge[];
  variables: RPA.Variable[];
  settings: RPA.WorkflowSettings;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
}

interface ClipboardGraph {
  nodes: RPA.Node[];
  edges: RPA.Edge[];
}

export interface BuilderState {
  workflowId: number | null;
  name: string;
  description: string;
  nodes: RPA.Node[];
  edges: RPA.Edge[];
  variables: RPA.Variable[];
  settings: RPA.WorkflowSettings;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  dirty: boolean;
  running: boolean;
  runId: string | null;
  historyPast: BuilderSnapshot[];
  historyFuture: BuilderSnapshot[];
  clipboardNode: RPA.Node | null;
  clipboardNodes: ClipboardGraph | null;
}

const HISTORY_LIMIT = 50;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const createStartNode = (): RPA.Node => ({
  id: 'start',
  type: 'start',
  label: 'Start',
  position: {x: 80, y: 120},
  params: {},
});

const createInitialState = (): BuilderState => ({
  workflowId: null,
  name: 'Untitled workflow',
  description: '',
  nodes: [createStartNode()],
  edges: [],
  variables: [],
  settings: {defaultTimeout: 30000, defaultRetry: 0, continueOnError: false},
  selectedNodeId: 'start',
  selectedNodeIds: ['start'],
  dirty: false,
  running: false,
  runId: null,
  historyPast: [],
  historyFuture: [],
  clipboardNode: null,
  clipboardNodes: null,
});

const initialState: BuilderState = createInitialState();

const snapshot = (state: BuilderState): BuilderSnapshot => ({
  nodes: clone(state.nodes),
  edges: clone(state.edges),
  variables: clone(state.variables),
  settings: clone(state.settings),
  selectedNodeId: state.selectedNodeId,
  selectedNodeIds: clone(state.selectedNodeIds),
});

const restoreSnapshot = (state: BuilderState, snap: BuilderSnapshot) => {
  state.nodes = clone(snap.nodes);
  state.edges = clone(snap.edges);
  state.variables = clone(snap.variables);
  state.settings = clone(snap.settings);
  state.selectedNodeId = snap.selectedNodeId;
  state.selectedNodeIds = clone(snap.selectedNodeIds ?? (snap.selectedNodeId ? [snap.selectedNodeId] : []));
  state.dirty = true;
};

const pushHistory = (state: BuilderState) => {
  state.historyPast.push(snapshot(state));
  if (state.historyPast.length > HISTORY_LIMIT) state.historyPast.shift();
  state.historyFuture = [];
};

const makeNodeId = (type: string): string =>
  `n_${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

const cloneNodeForPaste = (node: RPA.Node, id?: string): RPA.Node => ({
  ...clone(node),
  id: id ?? makeNodeId(node.type),
  label: node.label,
  position: {x: node.position.x + 40, y: node.position.y + 40},
});

const selectableIds = (state: BuilderState): string[] =>
  state.selectedNodeIds.filter(id => state.nodes.some(n => n.id === id && n.type !== 'start'));

const selectedGraph = (state: BuilderState): ClipboardGraph | null => {
  const ids = selectableIds(state);
  if (ids.length === 0) return null;
  const idSet = new Set(ids);
  return {
    nodes: clone(state.nodes.filter(n => idSet.has(n.id))),
    edges: clone(state.edges.filter(e => idSet.has(e.source) && idSet.has(e.target))),
  };
};

const pasteGraph = (state: BuilderState, graph: ClipboardGraph) => {
  const idMap = new Map<string, string>();
  const newNodes = graph.nodes.map(node => {
    const id = makeNodeId(node.type);
    idMap.set(node.id, id);
    return cloneNodeForPaste(node, id);
  });
  const newEdges = graph.edges
    .map(edge => {
      const source = idMap.get(edge.source);
      const target = idMap.get(edge.target);
      if (!source || !target) return null;
      return {
        ...clone(edge),
        id: `e_${source}_${target}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        source,
        target,
      } as RPA.Edge;
    })
    .filter(Boolean) as RPA.Edge[];

  state.nodes.push(...newNodes);
  state.edges.push(...newEdges);
  state.selectedNodeIds = newNodes.map(n => n.id);
  state.selectedNodeId = newNodes[0]?.id ?? null;
  state.clipboardNode = newNodes[0] ? clone(newNodes[0]) : null;
  state.clipboardNodes = {nodes: clone(newNodes), edges: clone(newEdges)};
  state.dirty = true;
};

const builderSlice = createSlice({
  name: 'rpaBuilder',
  initialState,
  reducers: {
    loadWorkflow(state, action: PayloadAction<RPA.WorkflowRecord>) {
      const record = action.payload;
      const def =
        typeof record.definition === 'string'
          ? (JSON.parse(record.definition) as RPA.Workflow)
          : (record.definition as RPA.Workflow);
      state.workflowId = record.id ?? null;
      state.name = record.name ?? 'Untitled workflow';
      state.description = record.description ?? '';
      state.nodes = def?.nodes?.length ? def.nodes : [createStartNode()];
      state.edges = def?.edges ?? [];
      state.variables = def?.variables ?? [];
      state.settings = def?.settings ?? {defaultTimeout: 30000, defaultRetry: 0, continueOnError: false};
      state.selectedNodeId = null;
      state.selectedNodeIds = [];
      state.dirty = false;
      state.running = false;
      state.runId = null;
      state.historyPast = [];
      state.historyFuture = [];
      state.clipboardNode = null;
      state.clipboardNodes = null;
    },
    newWorkflow() {
      return createInitialState();
    },
    undo(state) {
      const previous = state.historyPast.pop();
      if (!previous) return;
      state.historyFuture.push(snapshot(state));
      restoreSnapshot(state, previous);
    },
    redo(state) {
      const next = state.historyFuture.pop();
      if (!next) return;
      state.historyPast.push(snapshot(state));
      restoreSnapshot(state, next);
    },
    setName(state, action: PayloadAction<string>) {
      state.name = action.payload;
      state.dirty = true;
    },
    setDescription(state, action: PayloadAction<string>) {
      state.description = action.payload;
      state.dirty = true;
    },
    setNodes(state, action: PayloadAction<RPA.Node[]>) {
      pushHistory(state);
      state.nodes = action.payload;
      state.selectedNodeIds = state.selectedNodeIds.filter(id => state.nodes.some(n => n.id === id));
      state.selectedNodeId = state.selectedNodeIds[0] ?? null;
      state.dirty = true;
    },
    setEdges(state, action: PayloadAction<RPA.Edge[]>) {
      pushHistory(state);
      state.edges = action.payload;
      state.dirty = true;
    },
    addNode(state, action: PayloadAction<RPA.Node>) {
      if (action.payload.type === 'start' && state.nodes.some(n => n.type === 'start')) return;
      pushHistory(state);
      state.nodes.push(action.payload);
      state.selectedNodeId = action.payload.id;
      state.selectedNodeIds = [action.payload.id];
      state.dirty = true;
    },
    addEdge(state, action: PayloadAction<RPA.Edge>) {
      // Avoid duplicate edges between the same handles.
      const exists = state.edges.some(
        e =>
          e.source === action.payload.source &&
          e.target === action.payload.target &&
          e.sourceHandle === action.payload.sourceHandle,
      );
      if (exists) return;
      pushHistory(state);
      state.edges.push(action.payload);
      state.dirty = true;
    },
    removeEdge(state, action: PayloadAction<string>) {
      pushHistory(state);
      state.edges = state.edges.filter(e => e.id !== action.payload);
      state.dirty = true;
    },
    moveNode(state, action: PayloadAction<{id: string; position: RPA.NodePosition}>) {
      const node = state.nodes.find(n => n.id === action.payload.id);
      if (node) node.position = action.payload.position;
      state.dirty = true;
    },
    moveNodes(state, action: PayloadAction<Record<string, RPA.NodePosition>>) {
      for (const node of state.nodes) {
        const position = action.payload[node.id];
        if (position) node.position = position;
      }
      state.dirty = true;
    },
    commitHistory(state) {
      pushHistory(state);
    },
    updateNode(state, action: PayloadAction<{id: string; changes: Partial<RPA.Node>}>) {
      const node = state.nodes.find(n => n.id === action.payload.id);
      if (!node) return;
      pushHistory(state);
      Object.assign(node, action.payload.changes);
      state.dirty = true;
    },
    updateNodeParams(
      state,
      action: PayloadAction<{id: string; params: Record<string, unknown>}>,
    ) {
      const node = state.nodes.find(n => n.id === action.payload.id);
      if (!node) return;
      pushHistory(state);
      node.params = {...node.params, ...action.payload.params};
      state.dirty = true;
    },
    removeNode(state, action: PayloadAction<string>) {
      const node = state.nodes.find(n => n.id === action.payload);
      if (!node || node.type === 'start') return;
      pushHistory(state);
      state.nodes = state.nodes.filter(n => n.id !== action.payload);
      state.edges = state.edges.filter(
        e => e.source !== action.payload && e.target !== action.payload,
      );
      state.selectedNodeIds = state.selectedNodeIds.filter(id => id !== action.payload);
      state.selectedNodeId = state.selectedNodeIds[0] ?? null;
      state.dirty = true;
    },
    deleteSelectedNode(state) {
      const ids = selectableIds(state);
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      pushHistory(state);
      state.nodes = state.nodes.filter(n => !idSet.has(n.id));
      state.edges = state.edges.filter(e => !idSet.has(e.source) && !idSet.has(e.target));
      state.selectedNodeId = null;
      state.selectedNodeIds = [];
      state.dirty = true;
    },
    duplicateSelectedNode(state) {
      const graph = selectedGraph(state);
      if (!graph) return;
      pushHistory(state);
      pasteGraph(state, graph);
    },
    copySelectedNode(state) {
      const graph = selectedGraph(state);
      if (!graph) return;
      state.clipboardNodes = graph;
      state.clipboardNode = graph.nodes[0] ? clone(graph.nodes[0]) : null;
    },
    pasteNode(state) {
      const graph = state.clipboardNodes ?? (state.clipboardNode ? {nodes: [state.clipboardNode], edges: []} : null);
      if (!graph || graph.nodes.length === 0) return;
      if (graph.nodes.some(n => n.type === 'start') && state.nodes.some(n => n.type === 'start')) return;
      pushHistory(state);
      pasteGraph(state, graph);
    },
    appendGraph(state, action: PayloadAction<{nodes: RPA.Node[]; edges: RPA.Edge[]}>) {
      if (action.payload.nodes.length === 0) return;
      pushHistory(state);
      state.nodes.push(...action.payload.nodes);
      state.edges.push(...action.payload.edges);
      state.selectedNodeIds = action.payload.nodes.map(node => node.id);
      state.selectedNodeId = state.selectedNodeIds[0] ?? null;
      state.dirty = true;
    },
    selectNode(state, action: PayloadAction<string | null>) {
      state.selectedNodeId = action.payload;
      state.selectedNodeIds = action.payload ? [action.payload] : [];
    },
    setSelectedNodeIds(state, action: PayloadAction<string[]>) {
      const existing = new Set(state.nodes.map(n => n.id));
      const ids = action.payload.filter(id => existing.has(id));
      state.selectedNodeIds = Array.from(new Set(ids));
      state.selectedNodeId = state.selectedNodeIds[0] ?? null;
    },
    toggleNodeSelection(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (!state.nodes.some(n => n.id === id)) return;
      if (state.selectedNodeIds.includes(id)) {
        state.selectedNodeIds = state.selectedNodeIds.filter(x => x !== id);
      } else {
        state.selectedNodeIds.push(id);
      }
      state.selectedNodeId = state.selectedNodeIds[0] ?? null;
    },
    setVariables(state, action: PayloadAction<RPA.Variable[]>) {
      pushHistory(state);
      state.variables = action.payload;
      state.dirty = true;
    },
    setSettings(state, action: PayloadAction<RPA.WorkflowSettings>) {
      pushHistory(state);
      state.settings = action.payload;
      state.dirty = true;
    },
    markSaved(state, action: PayloadAction<number | undefined>) {
      state.dirty = false;
      if (action.payload != null) state.workflowId = action.payload;
    },
    setRunning(state, action: PayloadAction<{running: boolean; runId?: string | null}>) {
      state.running = action.payload.running;
      state.runId = action.payload.runId ?? null;
    },
  },
});

export const {
  loadWorkflow,
  newWorkflow,
  undo,
  redo,
  setName,
  setDescription,
  setNodes,
  setEdges,
  addNode,
  addEdge,
  removeEdge,
  moveNode,
  moveNodes,
  commitHistory,
  updateNode,
  updateNodeParams,
  removeNode,
  deleteSelectedNode,
  duplicateSelectedNode,
  copySelectedNode,
  pasteNode,
  appendGraph,
  selectNode,
  setSelectedNodeIds,
  toggleNodeSelection,
  setVariables,
  setSettings,
  markSaved,
  setRunning,
} = builderSlice.actions;

export default builderSlice.reducer;

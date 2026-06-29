// Redux slice for the RPA Process Builder.
//
// App-level workflow state (the node/edge model, selected node, dirty flag,
// run status) lives here so the palette, canvas and property panels stay in
// sync. The canvas component keeps its own internal viewport/drag state; only
// the persisted node/edge data is mirrored into Redux.
import {createSlice, type PayloadAction} from '@reduxjs/toolkit';
import type {RPA} from '../../../../shared/types/rpa';

export interface BuilderState {
  workflowId: number | null;
  name: string;
  description: string;
  nodes: RPA.Node[];
  edges: RPA.Edge[];
  variables: RPA.Variable[];
  settings: RPA.WorkflowSettings;
  selectedNodeId: string | null;
  dirty: boolean;
  running: boolean;
  runId: string | null;
}

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
  dirty: false,
  running: false,
  runId: null,
});

const initialState: BuilderState = createInitialState();

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
      state.dirty = false;
      state.running = false;
      state.runId = null;
    },
    newWorkflow() {
      return createInitialState();
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
      state.nodes = action.payload;
      state.dirty = true;
    },
    setEdges(state, action: PayloadAction<RPA.Edge[]>) {
      state.edges = action.payload;
      state.dirty = true;
    },
    addNode(state, action: PayloadAction<RPA.Node>) {
      if (action.payload.type === 'start' && state.nodes.some(n => n.type === 'start')) return;
      state.nodes.push(action.payload);
      state.selectedNodeId = action.payload.id;
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
      if (!exists) state.edges.push(action.payload);
      state.dirty = true;
    },
    removeEdge(state, action: PayloadAction<string>) {
      state.edges = state.edges.filter(e => e.id !== action.payload);
      state.dirty = true;
    },
    moveNode(state, action: PayloadAction<{id: string; position: RPA.NodePosition}>) {
      const node = state.nodes.find(n => n.id === action.payload.id);
      if (node) node.position = action.payload.position;
      state.dirty = true;
    },
    updateNode(state, action: PayloadAction<{id: string; changes: Partial<RPA.Node>}>) {
      const node = state.nodes.find(n => n.id === action.payload.id);
      if (node) Object.assign(node, action.payload.changes);
      state.dirty = true;
    },
    updateNodeParams(
      state,
      action: PayloadAction<{id: string; params: Record<string, unknown>}>,
    ) {
      const node = state.nodes.find(n => n.id === action.payload.id);
      if (node) node.params = {...node.params, ...action.payload.params};
      state.dirty = true;
    },
    removeNode(state, action: PayloadAction<string>) {
      const node = state.nodes.find(n => n.id === action.payload);
      if (node?.type === 'start') return;
      state.nodes = state.nodes.filter(n => n.id !== action.payload);
      state.edges = state.edges.filter(
        e => e.source !== action.payload && e.target !== action.payload,
      );
      if (state.selectedNodeId === action.payload) state.selectedNodeId = null;
      state.dirty = true;
    },
    selectNode(state, action: PayloadAction<string | null>) {
      state.selectedNodeId = action.payload;
    },
    setVariables(state, action: PayloadAction<RPA.Variable[]>) {
      state.variables = action.payload;
      state.dirty = true;
    },
    setSettings(state, action: PayloadAction<RPA.WorkflowSettings>) {
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
  setName,
  setDescription,
  setNodes,
  setEdges,
  addNode,
  addEdge,
  removeEdge,
  moveNode,
  updateNode,
  updateNodeParams,
  removeNode,
  selectNode,
  setVariables,
  setSettings,
  markSaved,
  setRunning,
} = builderSlice.actions;

export default builderSlice.reducer;

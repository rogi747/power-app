import {useEffect, useMemo, useState} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {
  Alert,
  Button,
  Collapse,
  Drawer,
  Flex,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {Icon} from '@iconify/react';
import {
  ArrowLeftOutlined,
  CopyOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  ImportOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  SaveOutlined,
  SettingOutlined,
  SnippetsOutlined,
  StopOutlined,
  UndoOutlined,
  PlusOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {RpaBridge, WindowBridge} from '#preload';
import type {RootState, AppDispatch} from '/@/store';
import {
  addNode,
  appendGraph,
  applyRunEvent,
  clearNodeRunStatus,
  copySelectedNode,
  deleteSelectedNode,
  duplicateSelectedNode,
  loadWorkflow,
  markSaved,
  newWorkflow,
  setDescription,
  pasteNode,
  updateNodeParams,
  redo,
  selectNode,
  setName,
  setRunning,
  setSettings,
  setVariables,
  undo,
} from '/@/store/rpa-builder-slice';
import {
  NODE_CATALOG,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  type NodeSpec,
} from './node-catalog';
import FlowCanvas from './components/FlowCanvas';
import PropertyPanel from './components/PropertyPanel';
import type {RPA} from '../../../../shared/types/rpa';
import type {DB} from '../../../../shared/types/db';
import {MESSAGE_CONFIG} from '/@/constants';
import {firstValidationMessage, validateWorkflow} from '../../../../shared/rpa/validator';
import type {RpaValidationIssue} from '../../../../shared/rpa/validator';

const {Text} = Typography;

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
};

const parseCsvRows = (text: string): Record<string, string>[] => {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(header => header.trim()).filter(Boolean);
  if (headers.length === 0) return [];

  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index] ?? '';
      return row;
    }, {});
  });
};

const parseJsonVariables = (text: string): Record<string, unknown> => {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Variables JSON must be an object.');
  }
  return parsed as Record<string, unknown>;
};

interface NodeRegistryState {
  disabledTypes: string[];
  pinnedTypes: string[];
}

const NODE_REGISTRY_STORAGE_KEY = 'rpa.nodeRegistry.v1';

const normalizeRegistryState = (value: Partial<NodeRegistryState> | null | undefined): NodeRegistryState => {
  const knownTypes = new Set(NODE_CATALOG.map(spec => spec.type));
  const disabledTypes = Array.from(new Set(value?.disabledTypes ?? [])).filter(
    type => knownTypes.has(type) && type !== 'start',
  );
  const pinnedTypes = Array.from(new Set(value?.pinnedTypes ?? [])).filter(type =>
    knownTypes.has(type),
  );
  return {disabledTypes, pinnedTypes};
};

const loadNodeRegistryState = (): NodeRegistryState => {
  if (typeof window === 'undefined') return normalizeRegistryState(null);
  try {
    const raw = window.localStorage.getItem(NODE_REGISTRY_STORAGE_KEY);
    if (!raw) return normalizeRegistryState(null);
    return normalizeRegistryState(JSON.parse(raw) as Partial<NodeRegistryState>);
  } catch {
    return normalizeRegistryState(null);
  }
};

const saveNodeRegistryState = (state: NodeRegistryState) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NODE_REGISTRY_STORAGE_KEY, JSON.stringify(normalizeRegistryState(state)));
};



/**
 * Process Builder. Integrates the palette, FlowCanvas, PropertyPanel and the
 * Redux builder slice with workflow persistence (create/update) and execution
 * (run) via RpaBridge.
 */
const RpaBuilder = () => {
  const {t} = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const idParam = searchParams.get('id');
  const [messageApi, contextHolder] = message.useMessage(MESSAGE_CONFIG);

  const builder = useSelector((s: RootState) => s.rpaBuilder);
  const {
    name,
    description,
    dirty,
    running,
    variables,
    settings,
    nodes,
    edges,
    selectedNodeId,
    selectedNodeIds,
    historyPast,
    historyFuture,
    clipboardNode,
    clipboardNodes,
    nodeRunStatus,
    activeRunId,
  } = builder;
  const selectedNode = nodes.find(node => node.id === selectedNodeId);
  const selectedEditableCount = selectedNodeIds.filter(id => {
    const node = nodes.find(n => n.id === id);
    return node && node.type !== 'start';
  }).length;
  const canEditSelectedNode = selectedEditableCount > 0;
  const clipboardCount = clipboardNodes?.nodes.length ?? (clipboardNode ? 1 : 0);
  const completedNodeCount = Object.values(nodeRunStatus).filter(item => item.status === 'completed').length;
  const failedNodeCount = Object.values(nodeRunStatus).filter(item => item.status === 'error').length;
  const runningNodeCount = Object.values(nodeRunStatus).filter(item => item.status === 'running').length;
  const pausedNodeCount = Object.values(nodeRunStatus).filter(item => item.status === 'paused').length;

  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [varsOpen, setVarsOpen] = useState(false);

  // Run modal state.
  const [runOpen, setRunOpen] = useState(false);
  const [windows, setWindows] = useState<DB.Window[]>([]);
  const [selectedWindowIds, setSelectedWindowIds] = useState<number[]>([]);
  const [runVariablesText, setRunVariablesText] = useState('');
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [debugMode, setDebugMode] = useState(false);

  // Recorder drawer state.
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [recorderWindowId, setRecorderWindowId] = useState<number | undefined>();
  const [recorderSession, setRecorderSession] = useState<RPA.RecorderSession | null>(null);
  const [recorderEvents, setRecorderEvents] = useState<RPA.RecorderEvent[]>([]);
  const [recorderBusy, setRecorderBusy] = useState(false);

  // Selector picker state.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerWindowId, setPickerWindowId] = useState<number | undefined>();
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickedSelector, setPickedSelector] = useState<RPA.SelectorPickResult | null>(null);

  // Node registry UI state.
  const [registryOpen, setRegistryOpen] = useState(false);
  const [registrySearch, setRegistrySearch] = useState('');
  const [registryState, setRegistryState] = useState(loadNodeRegistryState);

  // Load workflow on mount (or start a fresh one).
  useEffect(() => {
    (async () => {
      if (idParam) {
        const record = await RpaBridge?.get(Number(idParam));
        if (record) dispatch(loadWorkflow(record));
        else dispatch(newWorkflow());
      } else {
        dispatch(newWorkflow());
      }
    })();
  }, [dispatch, idParam]);

  useEffect(() => {
    saveNodeRegistryState(registryState);
  }, [registryState]);

  const disabledNodeTypes = useMemo(
    () => new Set(registryState.disabledTypes),
    [registryState.disabledTypes],
  );
  const pinnedNodeTypes = useMemo(
    () => new Set(registryState.pinnedTypes),
    [registryState.pinnedTypes],
  );
  const enabledCatalog = useMemo(
    () => NODE_CATALOG.filter(spec => !disabledNodeTypes.has(spec.type)),
    [disabledNodeTypes],
  );
  const pinnedSpecs = useMemo(
    () => registryState.pinnedTypes
      .map(type => NODE_CATALOG.find(spec => spec.type === type))
      .filter((spec): spec is NodeSpec => !!spec && !disabledNodeTypes.has(spec.type)),
    [disabledNodeTypes, registryState.pinnedTypes],
  );
  const registryFilteredSpecs = useMemo(() => {
    const q = registrySearch.trim().toLowerCase();
    if (!q) return NODE_CATALOG;
    return NODE_CATALOG.filter(spec =>
      [spec.type, spec.label, spec.description, spec.category]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [registrySearch]);

  const palette = useMemo(() => {
    const grouped: Record<string, NodeSpec[]> = {};
    enabledCatalog.forEach(spec => {
      (grouped[spec.category] ??= []).push(spec);
    });
    return grouped;
  }, [enabledCatalog]);

  const toggleNodeEnabled = (spec: NodeSpec, enabled: boolean) => {
    if (spec.type === 'start' && !enabled) {
      messageApi.warning('Start node cannot be disabled.');
      return;
    }
    setRegistryState(current => {
      const disabled = new Set(current.disabledTypes);
      if (enabled) disabled.delete(spec.type);
      else disabled.add(spec.type);
      return normalizeRegistryState({...current, disabledTypes: [...disabled]});
    });
  };

  const toggleNodePinned = (spec: NodeSpec) => {
    setRegistryState(current => {
      const pinned = new Set(current.pinnedTypes);
      if (pinned.has(spec.type)) pinned.delete(spec.type);
      else pinned.add(spec.type);
      return normalizeRegistryState({...current, pinnedTypes: [...pinned]});
    });
  };

  const resetNodeRegistry = () => {
    setRegistryState(normalizeRegistryState(null));
    setRegistrySearch('');
    messageApi.success('Node registry reset.');
  };


  const isTextInputActive = () => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
  };

  useEffect(() => {
    const unsubscribe = RpaBridge?.onRunEvent((event: RPA.TaskLog) => {
      if (builder.workflowId && event.workflow_id && event.workflow_id !== builder.workflowId) return;
      dispatch(applyRunEvent(event));
    });
    return () => {
      unsubscribe?.();
    };
  }, [builder.workflowId, dispatch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;

      if (modifier && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        dispatch(undo());
        return;
      }
      if (modifier && (key === 'y' || (key === 'z' && event.shiftKey))) {
        event.preventDefault();
        dispatch(redo());
        return;
      }

      if (isTextInputActive()) return;

      if (modifier && key === 'c') {
        event.preventDefault();
        dispatch(copySelectedNode());
        return;
      }
      if (modifier && key === 'v') {
        event.preventDefault();
        dispatch(pasteNode());
        return;
      }
      if (modifier && key === 'd') {
        event.preventDefault();
        dispatch(duplicateSelectedNode());
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        dispatch(deleteSelectedNode());
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);

  const addNodeToCanvas = (spec: NodeSpec) => {
    const defaults: Record<string, unknown> = {};
    spec.fields.forEach(f => {
      defaults[f.key] = f.type === 'boolean' ? false : undefined;
    });
    const node: RPA.Node = {
      id: `n_${spec.type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      type: spec.type,
      label: spec.label,
      position: {x: 120 + Math.random() * 80, y: 80 + Math.random() * 120},
      params: defaults,
    };
    dispatch(addNode(node));
  };

  const buildDefinition = (): RPA.Workflow => ({
    nodes,
    edges,
    variables,
    settings,
    version: 1,
  });

  const validationResult = useMemo(
    () => validateWorkflow({nodes, edges, variables, settings, version: 1}),
    [nodes, edges, variables, settings],
  );

  const validationErrors = validationResult.issues.filter(i => i.level === 'error');
  const validationWarnings = validationResult.issues.filter(i => i.level === 'warning');

  const focusValidationIssue = (issue: RpaValidationIssue) => {
    if (issue.nodeId) dispatch(selectNode(issue.nodeId));
  };

  const validateCurrentWorkflow = (): boolean => {
    const result = validationResult;
    if (!result.valid) {
      messageApi.error(firstValidationMessage(result));
      return false;
    }
    return true;
  };

  const getCreatedWorkflowId = (created: unknown): number | null => {
    const payload = created as {id?: number; data?: {id?: number}} | number | null | undefined;
    if (typeof payload === 'number') return payload;
    return payload?.data?.id ?? payload?.id ?? null;
  };

  const save = async (): Promise<number | null> => {
    setSaving(true);
    try {
      const record: RPA.WorkflowRecord = {
        name: name || t('rpa_untitled'),
        description,
        definition: buildDefinition(),
      };
      if (builder.workflowId) {
        await RpaBridge?.update(builder.workflowId, record);
        dispatch(markSaved(builder.workflowId));
        messageApi.success(t('rpa_saved'));
        return builder.workflowId;
      }
      const created = await RpaBridge?.create(record);
      const newId = getCreatedWorkflowId(created);
      dispatch(markSaved(newId ?? undefined));
      messageApi.success(t('rpa_saved'));
      return newId;
    } catch (e) {
      messageApi.error(t('rpa_save_failed'));
      return null;
    } finally {
      setSaving(false);
    }
  };



  const sendDebugCommand = async (command: 'pause' | 'resume' | 'stepOver') => {
    if (!activeRunId) {
      messageApi.warning('No active run to debug.');
      return;
    }
    const result = await RpaBridge?.debugCommand(activeRunId, command);
    if (!result?.success) {
      messageApi.error(result?.message ?? 'Debug command failed.');
      return;
    }
    if (command === 'pause') messageApi.info('Pause requested. The run will stop before the next node.');
    if (command === 'resume') messageApi.success('Run resumed.');
    if (command === 'stepOver') messageApi.success('Step over requested.');
  };

  const cancelActiveRun = async () => {
    if (!activeRunId) return;
    const result = await RpaBridge?.cancel(activeRunId);
    if (result?.success) {
      dispatch(setRunning({running: false, runId: activeRunId}));
      messageApi.success('Run cancelled.');
    } else {
      messageApi.error(result?.message ?? 'Cancel failed.');
    }
  };

  const csvColumns = csvRows[0] ? Object.keys(csvRows[0]) : [];
  const dataJobCount = csvRows.length > 0 ? csvRows.length * selectedWindowIds.length : selectedWindowIds.length;

  const handleCsvFile = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCsvRows(text);
      if (rows.length === 0) {
        messageApi.warning('CSV must contain a header row and at least one data row.');
        return;
      }
      setCsvRows(rows);
      setCsvFileName(file.name);
      messageApi.success(`Loaded ${rows.length} CSV row${rows.length > 1 ? 's' : ''}.`);
    } catch (error) {
      messageApi.error('Failed to parse CSV file.');
    }
  };

  const clearCsvRows = () => {
    setCsvRows([]);
    setCsvFileName('');
  };

  const openRun = async () => {
    if (!validateCurrentWorkflow()) return;
    let id = builder.workflowId;
    if (dirty || !id) {
      const savedId = await save();
      if (!savedId) return;
      id = savedId;
    }
    setSelectedWindowIds([]);
    const list = (await WindowBridge?.getAll()) ?? [];
    setWindows(list);
    setRunOpen(true);
  };

  const confirmRun = async () => {
    if (!builder.workflowId || selectedWindowIds.length === 0) return;

    let baseVariables: Record<string, unknown>;
    try {
      baseVariables = parseJsonVariables(runVariablesText);
    } catch (error) {
      messageApi.error('Run variables must be a valid JSON object.');
      return;
    }

    const csvDataJobs: RPA.RunDataJob[] = csvRows.flatMap(row =>
      selectedWindowIds.map(windowId => ({
        windowId,
        variables: {...baseVariables, ...row},
      })),
    );

    try {
      dispatch(clearNodeRunStatus());
      dispatch(setRunning({running: true}));
      if (csvDataJobs.length > 0) {
        await RpaBridge?.runDataBatch(builder.workflowId, csvDataJobs);
        dispatch(setRunning({running: false, runId: null}));
        messageApi.success(`Queued ${csvDataJobs.length} data job${csvDataJobs.length > 1 ? 's' : ''}.`);
        setRunOpen(false);
        navigate('/rpa/logs');
        return;
      }

      if (selectedWindowIds.length === 1) {
        const result = await RpaBridge?.run({
          workflowId: builder.workflowId,
          windowId: selectedWindowIds[0],
          variables: baseVariables,
          debug: debugMode,
        });
        dispatch(setRunning({running: true, runId: result?.runId ?? null}));
        messageApi.success('Run started. Watch node status directly on the canvas.');
        setRunOpen(false);
        return;
      }

      await RpaBridge?.runBatch(builder.workflowId, selectedWindowIds, baseVariables);
      dispatch(setRunning({running: false, runId: null}));
      messageApi.success(t('rpa_run_started'));
      setRunOpen(false);
      navigate('/rpa/logs');
    } catch (e) {
      dispatch(setRunning({running: false, runId: null}));
      messageApi.error(t('rpa_run_failed'));
    }
  };

  const goBack = () => {
    if (dirty) {
      Modal.confirm({
        title: t('rpa_unsaved_title'),
        content: t('rpa_unsaved_body'),
        okText: t('rpa_save_and_leave'),
        cancelText: t('rpa_leave_without_saving'),
        onOk: async () => {
          await save();
          navigate('/rpa');
        },
        onCancel: () => navigate('/rpa'),
      });
    } else {
      navigate('/rpa');
    }
  };

  useEffect(() => {
    if (!recorderSession) return;
    const unsubscribe = RpaBridge?.onRecorderEvent((event: RPA.RecorderEvent) => {
      setRecorderEvents(prev => {
        const index = prev.findIndex(item => item.id === event.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = event;
          return next;
        }
        return [...prev, event];
      });
    });
    return () => {
      unsubscribe?.();
    };
  }, [recorderSession]);

  const openRecorder = async () => {
    setRecorderOpen(true);
    const list = (await WindowBridge?.getAll()) ?? [];
    setWindows(list);
    if (!recorderWindowId && list[0]?.id) setRecorderWindowId(list[0].id);
  };

  const startRecorder = async () => {
    if (!recorderWindowId) {
      messageApi.error('Please select a profile/window to record.');
      return;
    }
    setRecorderBusy(true);
    try {
      setRecorderEvents([]);
      const session = await RpaBridge?.startRecorder(recorderWindowId);
      if (session) {
        setRecorderSession(session);
        messageApi.success('Recorder started. Use the opened browser profile normally.');
      }
    } catch (error) {
      messageApi.error('Failed to start recorder.');
    } finally {
      setRecorderBusy(false);
    }
  };

  const stopRecorder = async () => {
    if (!recorderSession) return;
    setRecorderBusy(true);
    try {
      const res = await RpaBridge?.stopRecorder(recorderSession.id);
      if (res?.events) setRecorderEvents(res.events);
      setRecorderSession(null);
      messageApi.success('Recorder stopped.');
    } catch (error) {
      messageApi.error('Failed to stop recorder.');
    } finally {
      setRecorderBusy(false);
    }
  };

  const eventToNode = (event: RPA.RecorderEvent, index: number, x: number, y: number): RPA.Node | null => {
    const id = `n_rec_${event.type}_${Date.now()}_${index}`;
    const labelBase = event.selector || event.text || event.url;
    const label = `${event.type}: ${String(labelBase ?? '').slice(0, 36)}`;
    const position = {x, y};

    if (event.type === 'navigation') {
      if (!event.url || event.url === 'about:blank') return null;
      return {
        id,
        type: 'navigate',
        label,
        position,
        params: {url: event.url, waitUntil: 'networkidle2'},
      };
    }

    if ((event.type === 'input' || event.type === 'change') && event.selector) {
      return {
        id,
        type: 'type',
        label,
        position,
        params: {selector: event.selector, text: event.value ?? '', clear: true, delay: 0},
      };
    }

    if (event.type === 'click' && event.selector) {
      return {
        id,
        type: 'click',
        label,
        position,
        params: {selector: event.selector},
      };
    }

    if (event.type === 'submit') {
      return {
        id,
        type: 'keyboardPress',
        label: 'submit: Enter',
        position,
        params: {key: 'Enter'},
      };
    }

    return null;
  };

  const importRecorderEvents = () => {
    const maxX = nodes.length ? Math.max(...nodes.map(node => node.position.x + 260)) : 320;
    const minY = nodes.length ? Math.min(...nodes.map(node => node.position.y)) : 120;
    const generated: RPA.Node[] = [];
    const edgesToAdd: RPA.Edge[] = [];
    let previousId: string | null = selectedNodeId;
    let lastNavUrl = '';

    recorderEvents.forEach(event => {
      if (event.type === 'navigation') {
        if (event.url === lastNavUrl) return;
        lastNavUrl = event.url;
      }
      const node = eventToNode(event, generated.length, maxX, minY + generated.length * 110);
      if (!node) return;
      generated.push(node);
      if (previousId && previousId !== node.id) {
        edgesToAdd.push({
          id: `e_${previousId}_${node.id}_${Date.now()}_${generated.length}`,
          source: previousId,
          target: node.id,
          sourceHandle: 'default',
        });
      }
      previousId = node.id;
    });

    if (generated.length === 0) {
      messageApi.warning('No recorder events can be converted to nodes.');
      return;
    }

    dispatch(appendGraph({nodes: generated, edges: edgesToAdd}));
    messageApi.success(`Imported ${generated.length} recorded step${generated.length > 1 ? 's' : ''}.`);
  };


  const selectorNodeTypes = new Set([
    'click',
    'doubleClick',
    'hover',
    'type',
    'waitForSelector',
    'getText',
    'getAttribute',
  ]);

  const openSelectorPicker = async () => {
    setPickerOpen(true);
    const list = (await WindowBridge?.getAll()) ?? [];
    setWindows(list);
    if (!pickerWindowId && list[0]?.id) setPickerWindowId(list[0].id);
  };

  const startSelectorPicker = async () => {
    if (!pickerWindowId) {
      messageApi.error('Please select a profile/window first.');
      return;
    }
    setPickerBusy(true);
    try {
      const result = await RpaBridge?.pickSelector(pickerWindowId);
      if (!result) return;
      setPickedSelector(result);
      await navigator.clipboard?.writeText(result.selector).catch(() => undefined);
      messageApi.success('Selector captured and copied.');
    } catch (error) {
      messageApi.error('Selector picker failed or timed out.');
    } finally {
      setPickerBusy(false);
    }
  };

  const copyPickedSelector = async () => {
    if (!pickedSelector?.selector) return;
    await navigator.clipboard?.writeText(pickedSelector.selector).catch(() => undefined);
    messageApi.success('Selector copied.');
  };

  const applyPickedSelector = () => {
    if (!pickedSelector?.selector) {
      messageApi.error('No selector picked yet.');
      return;
    }
    if (!selectedNode) {
      messageApi.error('Please select a node first.');
      return;
    }
    if (!selectorNodeTypes.has(selectedNode.type)) {
      messageApi.error('Selected node does not use a selector parameter.');
      return;
    }
    dispatch(updateNodeParams({id: selectedNode.id, params: {selector: pickedSelector.selector}}));
    messageApi.success('Selector applied to selected node.');
  };

  // ---- Variable editor -----------------------------------------------------
  const addVariable = () => {
    dispatch(
      setVariables([...variables, {name: '', scope: 'local', value: '', secret: false}]),
    );
  };
  const updateVariable = (index: number, changes: Partial<RPA.Variable>) => {
    const next = variables.map((v, i) => (i === index ? {...v, ...changes} : v));
    dispatch(setVariables(next));
  };
  const removeVariable = (index: number) => {
    dispatch(setVariables(variables.filter((_, i) => i !== index)));
  };

  const renderPaletteNode = (spec: NodeSpec, pinned = false) => (
    <div
      key={spec.type}
      onClick={() => addNodeToCanvas(spec)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 8,
        cursor: 'pointer',
        border: '1px solid #f0f2f5',
        borderLeft: `3px solid ${CATEGORY_COLORS[spec.category]}`,
        background: pinned ? '#fff7e6' : '#fff',
      }}
    >
      <Icon
        icon={spec.icon}
        style={{color: CATEGORY_COLORS[spec.category], fontSize: 16}}
      />
      <Text style={{fontSize: 13, flex: 1}}>{spec.label}</Text>
      {pinned && <Icon icon="mdi:star" style={{color: '#f59e0b', fontSize: 14}} />}
    </div>
  );

  return (
    <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
      {contextHolder}
      {/* Toolbar */}
      <Flex
        align="center"
        justify="space-between"
        style={{padding: '10px 16px', borderBottom: '1px solid #eef0f3', gap: 12}}
      >
        <Space size={12}>
          <Button icon={<ArrowLeftOutlined />} onClick={goBack}>
            {t('rpa_back')}
          </Button>
          <Input
            value={name}
            onChange={e => dispatch(setName(e.target.value))}
            placeholder={t('rpa_workflow_name')}
            style={{width: 260, fontWeight: 600}}
          />
          {dirty && <Tag color="orange">{t('rpa_unsaved')}</Tag>}
          {!dirty && builder.workflowId && <Tag color="green">{t('rpa_all_saved')}</Tag>}
          {validationErrors.length > 0 && (
            <Tag color="red" icon={<ExclamationCircleOutlined />}>
              {validationErrors.length} error{validationErrors.length > 1 ? 's' : ''}
            </Tag>
          )}
          {validationErrors.length === 0 && validationWarnings.length > 0 && (
            <Tag color="gold" icon={<ExclamationCircleOutlined />}>
              {validationWarnings.length} warning{validationWarnings.length > 1 ? 's' : ''}
            </Tag>
          )}
          {selectedNodeIds.length > 1 && <Tag color="blue">{selectedNodeIds.length} selected</Tag>}
          {registryState.disabledTypes.length > 0 && (
            <Tag color="default">{registryState.disabledTypes.length} node disabled</Tag>
          )}
          {registryState.pinnedTypes.length > 0 && (
            <Tag color="gold">{registryState.pinnedTypes.length} pinned</Tag>
          )}
          {activeRunId && <Tag color="processing">run {activeRunId.slice(0, 8)}</Tag>}
          {runningNodeCount > 0 && <Tag color="blue">{runningNodeCount} running</Tag>}
          {pausedNodeCount > 0 && <Tag color="purple">{pausedNodeCount} paused</Tag>}
          {completedNodeCount > 0 && <Tag color="green">{completedNodeCount} passed</Tag>}
          {failedNodeCount > 0 && <Tag color="red">{failedNodeCount} failed</Tag>}
        </Space>
        <Space size={8}>
          {activeRunId && running && (
            <>
              <Tooltip title="Pause before next node">
                <Button
                  icon={<Icon icon="mdi:pause" />}
                  onClick={() => void sendDebugCommand('pause')}
                />
              </Tooltip>
              <Tooltip title="Resume continuously">
                <Button
                  icon={<Icon icon="mdi:play" />}
                  onClick={() => void sendDebugCommand('resume')}
                />
              </Tooltip>
              <Tooltip title="Step over one node">
                <Button
                  icon={<Icon icon="mdi:debug-step-over" />}
                  disabled={pausedNodeCount === 0}
                  onClick={() => void sendDebugCommand('stepOver')}
                />
              </Tooltip>
              <Tooltip title="Cancel active run">
                <Button
                  danger
                  icon={<Icon icon="mdi:stop" />}
                  onClick={() => void cancelActiveRun()}
                />
              </Tooltip>
            </>
          )}
          <Tooltip title="Clear run highlights">
            <Button
              icon={<Icon icon="mdi:eraser" />}
              disabled={Object.keys(nodeRunStatus).length === 0}
              onClick={() => dispatch(clearNodeRunStatus())}
            />
          </Tooltip>
          <Tooltip title="Undo (Ctrl+Z)">
            <Button
              icon={<UndoOutlined />}
              disabled={historyPast.length === 0}
              onClick={() => dispatch(undo())}
            />
          </Tooltip>
          <Tooltip title="Redo (Ctrl+Y)">
            <Button
              icon={<RedoOutlined />}
              disabled={historyFuture.length === 0}
              onClick={() => dispatch(redo())}
            />
          </Tooltip>
          <Tooltip title={`Copy ${selectedEditableCount || 'node'} (Ctrl+C)`}>
            <Button
              icon={<CopyOutlined />}
              disabled={!canEditSelectedNode}
              onClick={() => dispatch(copySelectedNode())}
            />
          </Tooltip>
          <Tooltip title={`Paste ${clipboardCount || 'node'} (Ctrl+V)`}>
            <Button
              icon={<SnippetsOutlined />}
              disabled={clipboardCount === 0}
              onClick={() => dispatch(pasteNode())}
            />
          </Tooltip>
          <Tooltip title={`Duplicate ${selectedEditableCount || 'node'} (Ctrl+D)`}>
            <Button
              icon={<Icon icon="mdi:content-duplicate" />}
              disabled={!canEditSelectedNode}
              onClick={() => dispatch(duplicateSelectedNode())}
            />
          </Tooltip>
          <Tooltip title={`Delete ${selectedEditableCount || 'node'} (Delete)`}>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={!canEditSelectedNode}
              onClick={() => dispatch(deleteSelectedNode())}
            />
          </Tooltip>
          <Tooltip title="Manage node registry">
            <Button icon={<Icon icon="mdi:puzzle-outline" />} onClick={() => setRegistryOpen(true)}>
              Registry
            </Button>
          </Tooltip>
          <Tooltip title="Record browser actions">
            <Button icon={<VideoCameraOutlined />} onClick={openRecorder}>
              Recorder
            </Button>
          </Tooltip>
          <Tooltip title="Pick selector from browser">
            <Button icon={<Icon icon="mdi:cursor-default-click-outline" />} onClick={openSelectorPicker}>
              Pick Selector
            </Button>
          </Tooltip>
          <Tooltip title={t('rpa_variables')}>
            <Button icon={<Icon icon="mdi:variable" />} onClick={() => setVarsOpen(true)}>
              {t('rpa_variables')}
            </Button>
          </Tooltip>
          <Tooltip title={t('rpa_settings')}>
            <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)} />
          </Tooltip>
          <Button icon={<SaveOutlined />} loading={saving} onClick={save}>
            {t('rpa_save')}
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={running}
            onClick={openRun}
          >
            {t('rpa_run')}
          </Button>
        </Space>
      </Flex>

      {/* Body: palette | canvas | properties */}
      <div style={{flex: 1, display: 'flex', minHeight: 0}}>
        {/* Palette */}
        <div
          style={{
            width: 220,
            borderRight: '1px solid #eef0f3',
            overflowY: 'auto',
            background: '#fff',
          }}
        >
          {pinnedSpecs.length > 0 && (
            <div style={{padding: '10px 12px 4px'}}>
              <Flex align="center" gap={6} style={{marginBottom: 8}}>
                <Icon icon="mdi:star" style={{color: '#f59e0b'}} />
                <span style={{fontWeight: 600, fontSize: 13}}>Pinned</span>
              </Flex>
              <Space direction="vertical" style={{width: '100%'}} size={6}>
                {pinnedSpecs.map(spec => renderPaletteNode(spec, true))}
              </Space>
            </div>
          )}
          <Collapse
            defaultActiveKey={Object.keys(palette)}
            ghost
            items={Object.entries(palette).map(([category, specs]) => ({
              key: category,
              label: (
                <span style={{fontWeight: 600, fontSize: 13}}>
                  {CATEGORY_LABELS[category as NodeSpec['category']]}
                </span>
              ),
              children: (
                <Space direction="vertical" style={{width: '100%'}} size={6}>
                  {specs.map(spec => renderPaletteNode(spec))}
                </Space>
              ),
            }))}
          />
        </div>

        {/* Canvas */}
        <div style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column'}}>
          {validationResult.issues.length > 0 && (
            <div style={{padding: '8px 12px', borderBottom: '1px solid #eef0f3', background: '#fff'}}>
              <Alert
                type={validationErrors.length > 0 ? 'error' : 'warning'}
                showIcon
                message={
                  <Flex align="center" justify="space-between" gap={12}>
                    <span>
                      {validationErrors.length > 0
                        ? `${validationErrors.length} validation error${validationErrors.length > 1 ? 's' : ''}`
                        : `${validationWarnings.length} validation warning${validationWarnings.length > 1 ? 's' : ''}`}
                    </span>
                    <Space size={6} wrap>
                      {validationResult.issues.slice(0, 5).map((issue, index) => (
                        <Tag
                          key={`${issue.nodeId ?? issue.edgeId ?? 'workflow'}_${index}`}
                          color={issue.level === 'error' ? 'red' : 'gold'}
                          style={{cursor: issue.nodeId ? 'pointer' : 'default', marginInlineEnd: 0}}
                          onClick={() => focusValidationIssue(issue)}
                        >
                          {issue.nodeId ? `${issue.nodeId}: ` : ''}
                          {issue.message}
                        </Tag>
                      ))}
                      {validationResult.issues.length > 5 && (
                        <Tag color="default">+{validationResult.issues.length - 5} more</Tag>
                      )}
                    </Space>
                  </Flex>
                }
              />
            </div>
          )}
          <div style={{flex: 1, minHeight: 0}}>
            <FlowCanvas />
          </div>
        </div>

        {/* Properties */}
        <div style={{width: 320, borderLeft: '1px solid #eef0f3', background: '#fff'}}>
          <PropertyPanel />
        </div>
      </div>

      {/* Workflow settings drawer */}
      <Drawer
        title={t('rpa_settings')}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        width={360}
      >
        <label style={{fontSize: 12, color: '#475569'}}>{t('rpa_description')}</label>
        <Input.TextArea
          rows={3}
          value={description}
          style={{marginTop: 4, marginBottom: 16}}
          onChange={e => dispatch(setDescription(e.target.value))}
        />
        <label style={{fontSize: 12, color: '#475569'}}>{t('rpa_default_timeout')}</label>
        <InputNumber
          style={{width: '100%', marginTop: 4, marginBottom: 16}}
          value={settings.defaultTimeout}
          placeholder="30000"
          onChange={v => dispatch(setSettings({...settings, defaultTimeout: v ?? undefined}))}
        />
        <label style={{fontSize: 12, color: '#475569'}}>{t('rpa_default_retry')}</label>
        <InputNumber
          style={{width: '100%', marginTop: 4, marginBottom: 16}}
          value={settings.defaultRetry}
          placeholder="0"
          onChange={v => dispatch(setSettings({...settings, defaultRetry: v ?? undefined}))}
        />
        <Flex align="center" gap={8}>
          <Switch
            checked={!!settings.continueOnError}
            onChange={v => dispatch(setSettings({...settings, continueOnError: v}))}
          />
          <span style={{fontSize: 13, color: '#475569'}}>{t('rpa_continue_on_error')}</span>
        </Flex>
      </Drawer>

      {/* Variables drawer */}
      <Drawer
        title={t('rpa_variables')}
        open={varsOpen}
        onClose={() => setVarsOpen(false)}
        width={520}
        extra={
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addVariable}>
            {t('rpa_add_variable')}
          </Button>
        }
      >
        <Table
          rowKey={(_, i) => String(i)}
          size="small"
          pagination={false}
          dataSource={variables}
          columns={[
            {
              title: t('rpa_var_name'),
              render: (_, v, i) => (
                <Input
                  value={v.name}
                  onChange={e => updateVariable(i, {name: e.target.value})}
                />
              ),
            },
            {
              title: t('rpa_var_scope'),
              width: 130,
              render: (_, v, i) => (
                <Select
                  style={{width: '100%'}}
                  value={v.scope}
                  onChange={value => updateVariable(i, {scope: value})}
                  options={[
                    {label: 'Local', value: 'local'},
                    {label: 'Global', value: 'global'},
                    {label: 'Environment', value: 'environment'},
                  ]}
                />
              ),
            },
            {
              title: t('rpa_var_value'),
              render: (_, v, i) =>
                v.secret ? (
                  <Input.Password
                    value={v.value as string}
                    onChange={e => updateVariable(i, {value: e.target.value})}
                  />
                ) : (
                  <Input
                    value={v.value as string}
                    onChange={e => updateVariable(i, {value: e.target.value})}
                  />
                ),
            },
            {
              title: '',
              width: 40,
              render: (_, __, i) => (
                <DeleteOutlined
                  style={{color: '#ef4444', cursor: 'pointer'}}
                  onClick={() => removeVariable(i)}
                />
              ),
            },
          ]}
        />
      </Drawer>



      {/* Node registry drawer */}
      <Drawer
        title="Node Registry"
        open={registryOpen}
        onClose={() => setRegistryOpen(false)}
        width={860}
        extra={
          <Space>
            <Tag color="blue">{enabledCatalog.length} enabled</Tag>
            <Tag color="default">{registryState.disabledTypes.length} disabled</Tag>
            <Button size="small" onClick={resetNodeRegistry}>Reset</Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{width: '100%'}} size={12}>
          <Alert
            type="info"
            showIcon
            message="This registry controls which built-in/plugin nodes appear in the palette. Runtime executors are unchanged; this is the management UI layer for the node/plugin system."
          />
          <Input.Search
            allowClear
            placeholder="Search by node name, type, category, description..."
            value={registrySearch}
            onChange={event => setRegistrySearch(event.target.value)}
          />
          <Table<NodeSpec>
            size="small"
            rowKey="type"
            dataSource={registryFilteredSpecs}
            pagination={{pageSize: 8}}
            expandable={{
              expandedRowRender: (spec: NodeSpec) => (
                <Space direction="vertical" style={{width: '100%'}} size={8}>
                  <div>
                    <Text strong>Fields</Text>
                    <div style={{marginTop: 6}}>
                      {spec.fields.length === 0 ? (
                        <Tag color="default">No fields</Tag>
                      ) : (
                        spec.fields.map(field => (
                          <Tag key={field.key} color={field.secret ? 'red' : 'blue'}>
                            {field.key}: {field.type}{field.secret ? ' secret' : ''}
                          </Tag>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <Text strong>Outputs</Text>
                    <div style={{marginTop: 6}}>
                      {(spec.outputs ?? [{id: 'default', label: 'Default'}]).map(output => (
                        <Tag key={output.id} color="green">
                          {output.id}{output.label ? `: ${output.label}` : ''}
                        </Tag>
                      ))}
                    </div>
                  </div>
                </Space>
              ),
            }}
            columns={[
              {
                title: 'Node',
                render: (_: unknown, spec: NodeSpec) => (
                  <Flex align="center" gap={10}>
                    <Icon
                      icon={spec.icon}
                      style={{color: CATEGORY_COLORS[spec.category], fontSize: 20}}
                    />
                    <div style={{minWidth: 0}}>
                      <div style={{fontWeight: 600}}>{spec.label}</div>
                      <div style={{fontSize: 12, color: '#64748b'}}>{spec.type}</div>
                      <div style={{fontSize: 12, color: '#94a3b8'}}>{spec.description}</div>
                    </div>
                  </Flex>
                ),
              },
              {
                title: 'Category',
                width: 120,
                render: (_: unknown, spec: NodeSpec) => (
                  <Tag color={CATEGORY_COLORS[spec.category]}>
                    {CATEGORY_LABELS[spec.category]}
                  </Tag>
                ),
              },
              {
                title: 'Schema',
                width: 130,
                render: (_: unknown, spec: NodeSpec) => (
                  <Space direction="vertical" size={2}>
                    <Tag color="blue">{spec.fields.length} fields</Tag>
                    <Tag color="green">{(spec.outputs ?? [{id: 'default', label: 'Default'}]).length} outputs</Tag>
                  </Space>
                ),
              },
              {
                title: 'Pin',
                width: 80,
                render: (_: unknown, spec: NodeSpec) => (
                  <Button
                    size="small"
                    type={pinnedNodeTypes.has(spec.type) ? 'primary' : 'default'}
                    icon={<Icon icon={pinnedNodeTypes.has(spec.type) ? 'mdi:star' : 'mdi:star-outline'} />}
                    onClick={() => toggleNodePinned(spec)}
                  />
                ),
              },
              {
                title: 'Enabled',
                width: 100,
                render: (_: unknown, spec: NodeSpec) => (
                  <Switch
                    size="small"
                    checked={!disabledNodeTypes.has(spec.type)}
                    disabled={spec.type === 'start'}
                    onChange={checked => toggleNodeEnabled(spec, checked)}
                  />
                ),
              },
              {
                title: '',
                width: 92,
                render: (_: unknown, spec: NodeSpec) => (
                  <Button
                    size="small"
                    disabled={disabledNodeTypes.has(spec.type)}
                    onClick={() => {
                      addNodeToCanvas(spec);
                      setRegistryOpen(false);
                    }}
                  >
                    Add
                  </Button>
                ),
              },
            ]}
          />
        </Space>
      </Drawer>

      {/* Selector picker drawer */}
      <Drawer
        title="Selector Picker"
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        width={560}
        extra={
          <Space>
            <Button loading={pickerBusy} icon={<Icon icon="mdi:cursor-default-click-outline" />} onClick={startSelectorPicker}>
              Pick
            </Button>
            <Button disabled={!pickedSelector?.selector} onClick={copyPickedSelector}>
              Copy
            </Button>
            <Button type="primary" disabled={!pickedSelector?.selector} onClick={applyPickedSelector}>
              Apply to node
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{width: '100%'}} size={12}>
          <Alert
            type="info"
            showIcon
            message="Choose a profile, press Pick, then click the target element in the browser. The selector will be captured automatically."
          />
          <Select
            style={{width: '100%'}}
            placeholder="Select profile/window"
            value={pickerWindowId}
            disabled={pickerBusy}
            onChange={setPickerWindowId}
            optionFilterProp="label"
            showSearch
            options={windows.map(w => ({
              label: `${w.name ?? w.profile_id ?? w.id} (#${w.id})`,
              value: w.id!,
            }))}
          />
          <Input.TextArea
            rows={3}
            value={pickedSelector?.selector ?? ''}
            placeholder="Picked selector will appear here"
            readOnly
          />
          {pickedSelector && (
            <Space direction="vertical" style={{width: '100%'}} size={8}>
              <Tag color="blue">{pickedSelector.tagName || 'element'}</Tag>
              <Input value={pickedSelector.text ?? ''} placeholder="Text" readOnly />
              <Input value={pickedSelector.value ?? ''} placeholder="Value" readOnly />
              <Input value={pickedSelector.url} placeholder="URL" readOnly />
            </Space>
          )}
          <Alert
            type={selectedNode && selectorNodeTypes.has(selectedNode.type) ? 'success' : 'warning'}
            showIcon
            message={
              selectedNode
                ? selectorNodeTypes.has(selectedNode.type)
                  ? `Ready to apply selector to node: ${selectedNode.label || selectedNode.type}`
                  : `Selected node ${selectedNode.label || selectedNode.type} does not use selector.`
                : 'Select a selector-based node on the canvas before applying.'
            }
          />
        </Space>
      </Drawer>

      {/* Recorder drawer */}
      <Drawer
        title="Recorder"
        open={recorderOpen}
        onClose={() => setRecorderOpen(false)}
        width={720}
        extra={
          <Space>
            {recorderSession ? (
              <Button danger icon={<StopOutlined />} loading={recorderBusy} onClick={stopRecorder}>
                Stop
              </Button>
            ) : (
              <Button type="primary" icon={<VideoCameraOutlined />} loading={recorderBusy} onClick={startRecorder}>
                Start
              </Button>
            )}
            <Button
              icon={<ImportOutlined />}
              disabled={recorderEvents.length === 0}
              onClick={importRecorderEvents}
            >
              Import nodes
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{width: '100%'}} size={12}>
          <Alert
            type={recorderSession ? 'success' : 'info'}
            showIcon
            message={
              recorderSession
                ? `Recording profile #${recorderSession.windowId}. Interact with the opened browser.`
                : 'Select a profile, start recorder, then use the browser normally.'
            }
          />
          <Select
            style={{width: '100%'}}
            placeholder="Select profile/window"
            value={recorderWindowId}
            disabled={!!recorderSession}
            onChange={setRecorderWindowId}
            optionFilterProp="label"
            showSearch
            options={windows.map(w => ({
              label: `${w.name ?? w.profile_id ?? w.id} (#${w.id})`,
              value: w.id!,
            }))}
          />
          <Table
            size="small"
            rowKey="id"
            pagination={{pageSize: 8}}
            dataSource={recorderEvents}
            columns={[
              {
                title: 'Type',
                dataIndex: 'type',
                width: 110,
                render: value => <Tag color={value === 'navigation' ? 'blue' : 'green'}>{value}</Tag>,
              },
              {
                title: 'Selector / URL',
                render: (_, event) => (
                  <Tooltip title={event.selector || event.url}>
                    <span>{event.selector || event.url || '—'}</span>
                  </Tooltip>
                ),
                ellipsis: true,
              },
              {
                title: 'Value/Text',
                width: 180,
                render: (_, event) => (
                  <Tooltip title={event.value || event.text}>
                    <span>{event.value || event.text || '—'}</span>
                  </Tooltip>
                ),
                ellipsis: true,
              },
              {
                title: 'Time',
                width: 90,
                render: (_, event) => new Date(event.timestamp).toLocaleTimeString(),
              },
            ]}
          />
        </Space>
      </Drawer>

      {/* Run modal */}
      <Modal
        title={t('rpa_run_title', {name})}
        open={runOpen}
        centered
        width={680}
        okText={csvRows.length > 0 ? `Queue ${dataJobCount} job${dataJobCount > 1 ? 's' : ''}` : t('rpa_run')}
        cancelText={t('footer_cancel')}
        okButtonProps={{disabled: selectedWindowIds.length === 0 || dataJobCount === 0}}
        onOk={confirmRun}
        onCancel={() => setRunOpen(false)}
      >
        <Space direction="vertical" style={{width: '100%'}} size={12}>
          <div>
            <p style={{marginBottom: 8, color: '#475569'}}>{t('rpa_run_select_profiles')}</p>
            <Select
              mode="multiple"
              allowClear
              style={{width: '100%'}}
              placeholder={t('rpa_run_profiles_placeholder')}
              value={selectedWindowIds}
              onChange={setSelectedWindowIds}
              optionFilterProp="label"
              options={windows.map(w => ({
                label: `${w.name ?? w.profile_id ?? w.id} (#${w.id})`,
                value: w.id!,
              }))}
            />
          </div>

          <div>
            <Flex align="center" justify="space-between" style={{marginBottom: 8}}>
              <span style={{fontSize: 13, color: '#475569'}}>Base variables JSON</span>
              <Tag color="default">merged into every run</Tag>
            </Flex>
            <Input.TextArea
              rows={4}
              value={runVariablesText}
              onChange={event => setRunVariablesText(event.target.value)}
              placeholder={'{"username":"demo@example.com","password":"secret"}'}
            />
          </div>

          <div>
            <Flex align="center" justify="space-between" style={{marginBottom: 8}}>
              <Space>
                <span style={{fontSize: 13, color: '#475569'}}>CSV data rows</span>
                {csvRows.length > 0 && <Tag color="blue">{csvRows.length} rows</Tag>}
                {csvFileName && <Tag color="default">{csvFileName}</Tag>}
              </Space>
              <Space>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={event => {
                    void handleCsvFile(event.target.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
                <Button size="small" disabled={csvRows.length === 0} onClick={clearCsvRows}>
                  Clear CSV
                </Button>
              </Space>
            </Flex>
            <Alert
              type="info"
              showIcon
              message="CSV headers become variables. Each CSV row is merged over the base JSON variables."
            />
          </div>

          {csvRows.length > 0 && (
            <Table
              size="small"
              rowKey={(_, index) => String(index)}
              dataSource={csvRows.slice(0, 5)}
              pagination={false}
              scroll={{x: true}}
              columns={csvColumns.map(column => ({
                title: column,
                dataIndex: column,
                ellipsis: true,
                render: value => <span>{String(value ?? '')}</span>,
              }))}
            />
          )}

          <Flex align="center" gap={8}>
            <Switch
              checked={debugMode}
              disabled={csvRows.length > 0 || selectedWindowIds.length !== 1}
              onChange={setDebugMode}
            />
            <span style={{fontSize: 13, color: '#475569'}}>Debug step mode</span>
            <Tag color="purple">pause before each node</Tag>
          </Flex>

          <Alert
            type={csvRows.length > 0 ? 'success' : debugMode ? 'warning' : 'info'}
            showIcon
            message={
              csvRows.length > 0
                ? `Will queue ${dataJobCount} job${dataJobCount > 1 ? 's' : ''}: ${csvRows.length} row${csvRows.length > 1 ? 's' : ''} × ${selectedWindowIds.length} profile${selectedWindowIds.length > 1 ? 's' : ''}.`
                : debugMode
                ? 'Debug run will pause before the first node. Use Resume or Step Over from the toolbar.'
                : selectedWindowIds.length === 1
                ? 'Single profile run will stay on Builder so you can watch node highlights.'
                : 'Multi-profile run will be queued and opened in Logs.'
            }
          />
        </Space>
      </Modal>
    </div>
  );
};

export default RpaBuilder;

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
  copySelectedNode,
  deleteSelectedNode,
  duplicateSelectedNode,
  loadWorkflow,
  markSaved,
  newWorkflow,
  setDescription,
  pasteNode,
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
  } = builder;
  const selectedNode = nodes.find(node => node.id === selectedNodeId);
  const selectedEditableCount = selectedNodeIds.filter(id => {
    const node = nodes.find(n => n.id === id);
    return node && node.type !== 'start';
  }).length;
  const canEditSelectedNode = selectedEditableCount > 0;
  const clipboardCount = clipboardNodes?.nodes.length ?? (clipboardNode ? 1 : 0);

  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [varsOpen, setVarsOpen] = useState(false);

  // Run modal state.
  const [runOpen, setRunOpen] = useState(false);
  const [windows, setWindows] = useState<DB.Window[]>([]);
  const [selectedWindowIds, setSelectedWindowIds] = useState<number[]>([]);

  // Recorder drawer state.
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [recorderWindowId, setRecorderWindowId] = useState<number | undefined>();
  const [recorderSession, setRecorderSession] = useState<RPA.RecorderSession | null>(null);
  const [recorderEvents, setRecorderEvents] = useState<RPA.RecorderEvent[]>([]);
  const [recorderBusy, setRecorderBusy] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam]);

  const palette = useMemo(() => {
    const grouped: Record<string, NodeSpec[]> = {};
    NODE_CATALOG.forEach(spec => {
      (grouped[spec.category] ??= []).push(spec);
    });
    return grouped;
  }, []);

  const isTextInputActive = () => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
  };

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
    () => validateWorkflow(buildDefinition()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    try {
      dispatch(setRunning({running: true}));
      if (selectedWindowIds.length === 1) {
        await RpaBridge?.run({workflowId: builder.workflowId, windowId: selectedWindowIds[0]});
      } else {
        await RpaBridge?.runBatch(builder.workflowId, selectedWindowIds);
      }
      messageApi.success(t('rpa_run_started'));
      setRunOpen(false);
      navigate('/rpa/logs');
    } catch (e) {
      messageApi.error(t('rpa_run_failed'));
    } finally {
      dispatch(setRunning({running: false}));
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
        </Space>
        <Space size={8}>
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
          <Tooltip title="Record browser actions">
            <Button icon={<VideoCameraOutlined />} onClick={openRecorder}>
              Recorder
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
                  {specs.map(spec => (
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
                      }}
                    >
                      <Icon
                        icon={spec.icon}
                        style={{color: CATEGORY_COLORS[spec.category], fontSize: 16}}
                      />
                      <Text style={{fontSize: 13}}>{spec.label}</Text>
                    </div>
                  ))}
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
        width={520}
        okText={t('rpa_run')}
        cancelText={t('footer_cancel')}
        okButtonProps={{disabled: selectedWindowIds.length === 0}}
        onOk={confirmRun}
        onCancel={() => setRunOpen(false)}
      >
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
      </Modal>
    </div>
  );
};

export default RpaBuilder;

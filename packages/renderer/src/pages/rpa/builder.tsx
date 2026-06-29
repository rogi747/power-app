import {useEffect, useMemo, useState} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {
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
  PlayCircleOutlined,
  SaveOutlined,
  SettingOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {RpaBridge, WindowBridge} from '#preload';
import type {RootState, AppDispatch} from '/@/store';
import {
  addNode,
  loadWorkflow,
  markSaved,
  newWorkflow,
  setDescription,
  setName,
  setRunning,
  setSettings,
  setVariables,
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
  const {name, description, dirty, running, variables, settings, nodes, edges} = builder;

  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [varsOpen, setVarsOpen] = useState(false);

  // Run modal state.
  const [runOpen, setRunOpen] = useState(false);
  const [windows, setWindows] = useState<DB.Window[]>([]);
  const [selectedWindowIds, setSelectedWindowIds] = useState<number[]>([]);

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

  const validateCurrentWorkflow = (): boolean => {
    const result = validateWorkflow(buildDefinition());
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
        </Space>
        <Space size={8}>
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
        <div style={{flex: 1, minWidth: 0}}>
          <FlowCanvas />
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

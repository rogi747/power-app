import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Button,
  Card,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import {
  ClockCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import {RpaBridge, WindowBridge} from '#preload';
import type {RPA} from '../../../../shared/types/rpa';
import type {DB} from '../../../../shared/types/db';
import {MESSAGE_CONFIG} from '/@/constants';

/**
 * A persisted schedule entry as returned by the scheduler service. Mirrors the
 * createSchedule payload plus the runtime id and next-run hint.
 */
interface Schedule {
  id: string;
  name: string;
  cron: string;
  workflowId: number;
  workflowName?: string;
  windowIds: number[];
  enabled: boolean;
  nextRun?: string;
  lastRun?: string;
}

interface ScheduleForm {
  name: string;
  cron: string;
  workflowId: number;
  windowIds: number[];
  enabled: boolean;
}

/** Common cron presets surfaced as quick picks in the create dialog. */
const CRON_PRESETS = [
  {labelKey: 'rpa_cron_every_15m', value: '*/15 * * * *'},
  {labelKey: 'rpa_cron_hourly', value: '0 * * * *'},
  {labelKey: 'rpa_cron_daily_9', value: '0 9 * * *'},
  {labelKey: 'rpa_cron_weekly_mon', value: '0 9 * * 1'},
];

/**
 * RPA Scheduler. Lists cron-based schedules and lets a user create, enable,
 * disable and delete them. Each schedule binds a workflow to a cron expression
 * and a set of profiles, executed by the main-process scheduler service.
 */
const RpaScheduler = () => {
  const {t} = useTranslation();
  const [messageApi, contextHolder] = message.useMessage(MESSAGE_CONFIG);
  const [form] = Form.useForm<ScheduleForm>();

  const [loading, setLoading] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [workflows, setWorkflows] = useState<RPA.WorkflowRecord[]>([]);
  const [windows, setWindows] = useState<DB.Window[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const list = ((await RpaBridge?.listSchedules()) as Schedule[]) ?? [];
      setSchedules(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // Live scheduler updates (next-run recalculated, enable/disable elsewhere).
  useEffect(() => {
    const unsubscribe = RpaBridge?.onScheduleEvent(payload => {
      if (Array.isArray(payload)) setSchedules(payload as Schedule[]);
    });
    return () => unsubscribe?.();
  }, []);

  const openCreate = async () => {
    const [wfList, winList] = await Promise.all([
      RpaBridge?.list() ?? [],
      WindowBridge?.getAll() ?? [],
    ]);
    setWorkflows(wfList);
    setWindows(winList);
    form.resetFields();
    form.setFieldsValue({enabled: true, windowIds: []});
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await RpaBridge?.createSchedule({
        name: values.name,
        cron: values.cron,
        workflowId: values.workflowId,
        windowIds: values.windowIds,
        enabled: values.enabled,
      });
      messageApi.success(t('rpa_schedule_created'));
      setCreateOpen(false);
      await fetchSchedules();
    } catch (e) {
      messageApi.error(t('rpa_schedule_create_failed'));
    } finally {
      setSaving(false);
    }
  };

  const toggleSchedule = async (record: Schedule, enabled: boolean) => {
    await RpaBridge?.toggleSchedule(record.id, enabled);
    setSchedules(prev =>
      prev.map(s => (s.id === record.id ? {...s, enabled} : s)),
    );
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await RpaBridge?.deleteSchedule(deleteTarget.id);
    setDeleteTarget(null);
    messageApi.success(t('rpa_schedule_deleted'));
    await fetchSchedules();
  };

  const columns: ColumnsType<Schedule> = useMemo(
    () => [
      {
        title: t('rpa_schedule_name'),
        dataIndex: 'name',
        key: 'name',
        render: (v: string) => <span style={{fontWeight: 600}}>{v}</span>,
      },
      {
        title: t('rpa_schedule_workflow'),
        dataIndex: 'workflowName',
        key: 'workflowName',
        render: (v, r) => v ?? `#${r.workflowId}`,
      },
      {
        title: t('rpa_schedule_cron'),
        dataIndex: 'cron',
        key: 'cron',
        width: 160,
        render: (v: string) => <Tag icon={<ClockCircleOutlined />}>{v}</Tag>,
      },
      {
        title: t('rpa_schedule_profiles'),
        dataIndex: 'windowIds',
        key: 'windowIds',
        width: 110,
        render: (ids: number[]) => t('rpa_schedule_profile_count', {count: ids?.length ?? 0}),
      },
      {
        title: t('rpa_schedule_next_run'),
        dataIndex: 'nextRun',
        key: 'nextRun',
        width: 180,
        render: (v: string | undefined) => (v ? new Date(v).toLocaleString() : '—'),
      },
      {
        title: t('rpa_schedule_enabled'),
        dataIndex: 'enabled',
        key: 'enabled',
        width: 100,
        render: (enabled: boolean, r) => (
          <Switch checked={enabled} onChange={v => toggleSchedule(r, v)} />
        ),
      },
      {
        title: '',
        key: 'operation',
        width: 60,
        align: 'center',
        render: (_, r) => (
          <Tooltip title={t('rpa_delete')}>
            <DeleteOutlined
              style={{color: '#ef4444', cursor: 'pointer'}}
              onClick={() => setDeleteTarget(r)}
            />
          </Tooltip>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  return (
    <div className="page-container">
      {contextHolder}
      <Flex align="center" justify="space-between" className="page-toolbar">
        <Button icon={<SyncOutlined />} onClick={fetchSchedules}>
          {t('refresh')}
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('rpa_schedule_new')}
        </Button>
      </Flex>

      <Card variant="borderless" className="page-card">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={schedules}
          scroll={{x: 900, y: 'auto'}}
          pagination={false}
          locale={{emptyText: t('rpa_schedule_empty')}}
        />
      </Card>

      <Modal
        title={t('rpa_schedule_new')}
        open={createOpen}
        centered
        width={560}
        okText={t('footer_confirm')}
        cancelText={t('footer_cancel')}
        confirmLoading={saving}
        onOk={submitCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <Form form={form} layout="vertical" style={{marginTop: 16}}>
          <Form.Item
            name="name"
            label={t('rpa_schedule_name')}
            rules={[{required: true, message: t('rpa_schedule_name_required')}]}
          >
            <Input placeholder={t('rpa_schedule_name_placeholder')} />
          </Form.Item>
          <Form.Item
            name="workflowId"
            label={t('rpa_schedule_workflow')}
            rules={[{required: true, message: t('rpa_schedule_workflow_required')}]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('rpa_schedule_workflow_placeholder')}
              options={workflows.map(w => ({label: w.name || t('rpa_untitled'), value: w.id!}))}
            />
          </Form.Item>
          <Form.Item
            name="cron"
            label={t('rpa_schedule_cron')}
            rules={[{required: true, message: t('rpa_schedule_cron_required')}]}
            extra={
              <Space size={4} wrap style={{marginTop: 8}}>
                {CRON_PRESETS.map(p => (
                  <Tag
                    key={p.value}
                    style={{cursor: 'pointer'}}
                    onClick={() => form.setFieldValue('cron', p.value)}
                  >
                    {t(p.labelKey)}
                  </Tag>
                ))}
              </Space>
            }
          >
            <Input placeholder="0 9 * * *" />
          </Form.Item>
          <Form.Item
            name="windowIds"
            label={t('rpa_schedule_profiles')}
            rules={[{required: true, message: t('rpa_schedule_profiles_required')}]}
          >
            <Select
              mode="multiple"
              allowClear
              optionFilterProp="label"
              placeholder={t('rpa_run_profiles_placeholder')}
              options={windows.map(w => ({
                label: `${w.name ?? w.profile_id ?? w.id} (#${w.id})`,
                value: w.id!,
              }))}
            />
          </Form.Item>
          <Form.Item name="enabled" label={t('rpa_schedule_enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('rpa_delete')}
        open={!!deleteTarget}
        centered
        okText={t('footer_confirm')}
        cancelText={t('footer_cancel')}
        onOk={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      >
        {t('rpa_schedule_delete_confirm', {name: deleteTarget?.name})}
      </Modal>
    </div>
  );
};

export default RpaScheduler;

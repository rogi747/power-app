import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Button,
  Card,
  Flex,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import {
  ClearOutlined,
  DownloadOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import {CommonBridge, RpaBridge} from '#preload';
import type {RPA} from '../../../../shared/types/rpa';
import {MESSAGE_CONFIG} from '/@/constants';

/**
 * RPA run logs. Streams live execution events from the engine and lists the
 * persisted task-log rows so a user can audit every node of every run. Live
 * events are merged into the same list and can be paused.
 */
const STATUS_COLORS: Record<RPA.TaskStatus, string> = {
  waiting: 'default',
  queued: 'blue',
  running: 'processing',
  paused: 'gold',
  completed: 'success',
  cancelled: 'default',
  error: 'error',
  retry: 'orange',
};

const RpaLogs = () => {
  const {t} = useTranslation();
  const [messageApi, contextHolder] = message.useMessage(MESSAGE_CONFIG);

  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<RPA.TaskLog[]>([]);
  const [statusFilter, setStatusFilter] = useState<RPA.TaskStatus | undefined>();
  const [live, setLive] = useState(true);
  const liveRef = useRef(live);
  liveRef.current = live;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const list = (await RpaBridge?.logs({status: statusFilter, limit: 500})) ?? [];
      setLogs(list);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Subscribe to live run events; merge them into the head of the list.
  useEffect(() => {
    const unsubscribe = RpaBridge?.onRunEvent(event => {
      if (!liveRef.current) return;
      setLogs(prev => [event, ...prev].slice(0, 1000));
    });
    return () => unsubscribe?.();
  }, []);

  const clearLogs = async () => {
    await RpaBridge?.clearLogs();
    setLogs([]);
    messageApi.success(t('rpa_logs_cleared'));
  };

  const exportLogs = async () => {
    const json = JSON.stringify(logs, null, 2);
    const result = await CommonBridge?.saveDialog({
      title: t('rpa_logs_export'),
      defaultPath: `rpa-logs-${Date.now()}.json`,
      filters: [{name: 'JSON', extensions: ['json']}],
    });
    if (result?.filePath) {
      await CommonBridge?.saveFile(result.filePath, Buffer.from(json, 'utf-8'));
      messageApi.success(t('rpa_logs_exported'));
    }
  };

  const cancelRun = async (runId?: string) => {
    if (!runId) return;
    await RpaBridge?.cancel(runId);
    messageApi.success(t('rpa_run_cancelled'));
    await fetchLogs();
  };

  const columns: ColumnsType<RPA.TaskLog> = useMemo(
    () => [
      {
        title: t('rpa_log_time'),
        dataIndex: 'started_at',
        key: 'started_at',
        width: 170,
        render: (v: string | undefined, r) =>
          v || r.created_at ? new Date(v ?? r.created_at!).toLocaleString() : '—',
      },
      {
        title: t('rpa_log_workflow'),
        dataIndex: 'workflow_name',
        key: 'workflow_name',
        width: 160,
        ellipsis: true,
        render: v => v || '—',
      },
      {
        title: t('rpa_log_node'),
        key: 'node',
        width: 180,
        ellipsis: true,
        render: (_, r) => r.node_type ?? r.node_id ?? <Tag>{t('rpa_log_run_summary')}</Tag>,
      },
      {
        title: t('rpa_log_profile'),
        dataIndex: 'profile_id',
        key: 'profile_id',
        width: 130,
        render: (v, r) => v ?? (r.window_id != null ? `#${r.window_id}` : '—'),
      },
      {
        title: t('rpa_log_status'),
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (status: RPA.TaskStatus | undefined) =>
          status ? (
            <Tag color={STATUS_COLORS[status]}>{t(`rpa_status_${status}`)}</Tag>
          ) : (
            '—'
          ),
      },
      {
        title: t('rpa_log_duration'),
        dataIndex: 'duration',
        key: 'duration',
        width: 110,
        render: (v: number | undefined) => (v != null ? `${v} ms` : '—'),
      },
      {
        title: t('rpa_log_message'),
        dataIndex: 'message',
        key: 'message',
        ellipsis: true,
        render: (v, r) => (
          <Tooltip title={r.stack || v}>
            <span style={{color: r.status === 'error' ? '#ef4444' : undefined}}>
              {v || '—'}
            </span>
          </Tooltip>
        ),
      },
      {
        title: '',
        key: 'operation',
        width: 60,
        align: 'center',
        render: (_, r) =>
          r.status === 'running' || r.status === 'queued' ? (
            <Tooltip title={t('rpa_run_cancel')}>
              <StopOutlined
                style={{color: '#ef4444', cursor: 'pointer'}}
                onClick={() => cancelRun(r.run_id)}
              />
            </Tooltip>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  return (
    <div className="page-container">
      {contextHolder}
      <Flex align="center" justify="space-between" className="page-toolbar">
        <Space size={16}>
          <Select
            allowClear
            style={{width: 180}}
            placeholder={t('rpa_log_filter_status')}
            value={statusFilter}
            onChange={setStatusFilter}
            options={(
              [
                'waiting',
                'queued',
                'running',
                'paused',
                'completed',
                'cancelled',
                'error',
                'retry',
              ] as RPA.TaskStatus[]
            ).map(s => ({label: t(`rpa_status_${s}`), value: s}))}
          />
          <Button icon={<SyncOutlined />} onClick={fetchLogs}>
            {t('refresh')}
          </Button>
          <Tooltip title={live ? t('rpa_logs_live_on') : t('rpa_logs_live_off')}>
            <Button
              icon={live ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              type={live ? 'primary' : 'default'}
              onClick={() => setLive(v => !v)}
            >
              {live ? t('rpa_logs_pause') : t('rpa_logs_resume')}
            </Button>
          </Tooltip>
        </Space>
        <Space size={8}>
          <Button icon={<DownloadOutlined />} onClick={exportLogs} disabled={!logs.length}>
            {t('rpa_logs_export')}
          </Button>
          <Button danger icon={<ClearOutlined />} onClick={clearLogs} disabled={!logs.length}>
            {t('rpa_logs_clear')}
          </Button>
        </Space>
      </Flex>

      <Card variant="borderless" className="page-card">
        <Table
          rowKey={(r, i) => String(r.id ?? `${r.run_id}-${r.node_id}-${i}`)}
          loading={loading}
          columns={columns}
          dataSource={logs}
          scroll={{x: 1100, y: 'auto'}}
          pagination={{pageSize: 50, showSizeChanger: true, pageSizeOptions: [50, 100, 200]}}
        />
      </Card>
    </div>
  );
};

export default RpaLogs;

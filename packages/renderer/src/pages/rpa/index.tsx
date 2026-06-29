import {
  Button,
  Card,
  Dropdown,
  Flex,
  Input,
  Modal,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import type {MenuProps} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import type {MenuInfo} from 'rc-menu/lib/interface';
import {debounce} from 'lodash';
import {useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {
  PlusOutlined,
  SearchOutlined,
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  ExportOutlined,
  ImportOutlined,
  PlayCircleOutlined,
  SyncOutlined,
  ExclamationCircleFilled,
} from '@ant-design/icons';
import {CommonBridge, RpaBridge, WindowBridge} from '#preload';
import type {RPA} from '../../../../shared/types/rpa';
import type {DB} from '../../../../shared/types/db';
import {MESSAGE_CONFIG} from '/@/constants';
import {containsKeyword} from '/@/utils/str';
import {firstValidationMessage, validateWorkflow} from '../../../../shared/rpa/validator';

/**
 * RPA workflow list. The home of the Browser RPA feature: lists stored
 * workflows and exposes the lifecycle actions (open builder, run, duplicate,
 * export/import, delete) wired straight to RpaBridge.
 */
const Rpa = () => {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage(MESSAGE_CONFIG);

  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<RPA.WorkflowRecord[]>([]);
  const [dataCopy, setDataCopy] = useState<RPA.WorkflowRecord[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [deleteTarget, setDeleteTarget] = useState<RPA.WorkflowRecord | null>(null);

  // Run modal state.
  const [runTarget, setRunTarget] = useState<RPA.WorkflowRecord | null>(null);
  const [windows, setWindows] = useState<DB.Window[]>([]);
  const [selectedWindowIds, setSelectedWindowIds] = useState<number[]>([]);
  const [running, setRunning] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const list = (await RpaBridge?.list()) ?? [];
    setData(list);
    setDataCopy(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onSearch = (value: string) => {
    const keyword = value.trim().toLowerCase();
    if (!keyword) {
      setData(dataCopy);
      return;
    }
    setData(
      dataCopy.filter(
        w => containsKeyword(w.name, keyword) || containsKeyword(w.description, keyword),
      ),
    );
    setCurrentPage(1);
  };

  const debouncedSearch = useMemo(() => debounce(onSearch, 400), [dataCopy]);

  const openBuilder = (id?: number) => {
    navigate(id ? `/rpa/builder?id=${id}` : '/rpa/builder');
  };

  const duplicateWorkflow = async (id: number) => {
    await RpaBridge?.duplicate(id);
    messageApi.success(t('rpa_duplicated'));
    await fetchData();
  };

  const exportWorkflow = async (record: RPA.WorkflowRecord) => {
    const res = await RpaBridge?.export(record.id!);
    if (!res?.success) {
      messageApi.error(res?.message ?? t('rpa_export_failed'));
      return;
    }
    const json = JSON.stringify(res.data, null, 2);
    const result = await CommonBridge?.saveDialog({
      title: t('rpa_export'),
      defaultPath: `${record.name ?? 'workflow'}.json`,
      filters: [{name: 'JSON', extensions: ['json']}],
    });
    if (result?.filePath) {
      await CommonBridge?.saveFile(result.filePath, Buffer.from(json, 'utf-8'));
      messageApi.success(t('rpa_exported'));
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const importWorkflow = () => {
    fileInputRef.current?.click();
  };

  const onImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const raw = await file.text();
      const payload = JSON.parse(raw) as RPA.WorkflowRecord;
      await RpaBridge?.import(payload);
      messageApi.success(t('rpa_imported'));
      await fetchData();
    } catch (err) {
      messageApi.error(t('rpa_import_failed'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;
    await RpaBridge?.delete(deleteTarget.id);
    setDeleteTarget(null);
    messageApi.success(t('rpa_deleted'));
    await fetchData();
  };

  const openRunModal = async (record: RPA.WorkflowRecord) => {
    setRunTarget(record);
    setSelectedWindowIds([]);
    const list = (await WindowBridge?.getAll()) ?? [];
    setWindows(list);
  };

  const confirmRun = async () => {
    if (!runTarget?.id || selectedWindowIds.length === 0) return;
    const definition =
      typeof runTarget.definition === 'string'
        ? (JSON.parse(runTarget.definition) as RPA.Workflow)
        : (runTarget.definition as RPA.Workflow | undefined);
    const validation = validateWorkflow(definition);
    if (!validation.valid) {
      messageApi.error(firstValidationMessage(validation));
      return;
    }
    setRunning(true);
    try {
      if (selectedWindowIds.length === 1) {
        await RpaBridge?.run({workflowId: runTarget.id, windowId: selectedWindowIds[0]});
      } else {
        await RpaBridge?.runBatch(runTarget.id, selectedWindowIds);
      }
      messageApi.success(t('rpa_run_started'));
      setRunTarget(null);
      navigate('/rpa/logs');
    } catch (e) {
      messageApi.error(t('rpa_run_failed'));
    } finally {
      setRunning(false);
    }
  };

  const rowMenu = (record: RPA.WorkflowRecord): MenuProps['items'] => [
    {key: 'edit', label: t('rpa_edit'), icon: <EditOutlined />},
    {key: 'duplicate', label: t('rpa_duplicate'), icon: <CopyOutlined />},
    {key: 'export', label: t('rpa_export'), icon: <ExportOutlined />},
    {type: 'divider'},
    {key: 'delete', danger: true, label: t('rpa_delete'), icon: <DeleteOutlined />},
  ];

  const onRowAction = (info: MenuInfo, record: RPA.WorkflowRecord) => {
    switch (info.key) {
      case 'edit':
        openBuilder(record.id);
        break;
      case 'duplicate':
        duplicateWorkflow(record.id!);
        break;
      case 'export':
        exportWorkflow(record);
        break;
      case 'delete':
        setDeleteTarget(record);
        break;
      default:
        break;
    }
  };

  const columns: ColumnsType<RPA.WorkflowRecord> = [
    {title: 'ID', dataIndex: 'id', key: 'id', width: 60, fixed: 'left'},
    {
      title: t('rpa_column_name'),
      dataIndex: 'name',
      key: 'name',
      render: (_, r) => (
        <a onClick={() => openBuilder(r.id)} style={{fontWeight: 600}}>
          {r.name || t('rpa_untitled')}
        </a>
      ),
    },
    {
      title: t('rpa_column_description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: text => text || <span style={{color: '#cbd5e1'}}>—</span>,
    },
    {
      title: t('rpa_column_tags'),
      dataIndex: 'tags',
      key: 'tags',
      width: 200,
      render: (tags: RPA.WorkflowRecord['tags']) => {
        const list = Array.isArray(tags)
          ? tags
          : typeof tags === 'string' && tags
            ? (() => {
                try {
                  return JSON.parse(tags) as string[];
                } catch {
                  return [];
                }
              })()
            : [];
        return list.length ? (
          <Space size={4} wrap>
            {list.map(tag => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </Space>
        ) : (
          <span style={{color: '#cbd5e1'}}>—</span>
        );
      },
    },
    {
      title: t('rpa_column_updated'),
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: v => (v ? new Date(v).toLocaleString() : '—'),
    },
    {
      title: '',
      key: 'operation',
      fixed: 'right',
      align: 'center',
      width: 100,
      render: (_, record) => (
        <Space size={16}>
          <PlayCircleOutlined
            title={t('rpa_run')}
            onClick={() => openRunModal(record)}
            style={{color: '#2f80ed', cursor: 'pointer'}}
          />
          <Dropdown
            menu={{items: rowMenu(record), onClick: info => onRowAction(info, record)}}
          >
            <MoreOutlined style={{cursor: 'pointer'}} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      {contextHolder}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{display: 'none'}}
        onChange={onImportFileChange}
      />
      <Flex align="center" justify="space-between" className="page-toolbar">
        <Space size={16}>
          <Input
            value={search}
            placeholder={t('rpa_search_placeholder')}
            prefix={<SearchOutlined />}
            onChange={e => {
              setSearch(e.target.value);
              debouncedSearch(e.target.value);
            }}
          />
          <Button
            icon={<SyncOutlined />}
            onClick={async () => {
              await fetchData();
              messageApi.success(t('refresh'));
            }}
          >
            {t('refresh')}
          </Button>
        </Space>
        <Space size={8}>
          <Button icon={<ImportOutlined />} onClick={importWorkflow}>
            {t('rpa_import')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openBuilder()}>
            {t('rpa_new_workflow')}
          </Button>
        </Space>
      </Flex>

      <Card variant="borderless" className="page-card">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={data.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
          scroll={{x: 1000, y: 'auto'}}
          pagination={false}
        />
      </Card>

      <Flex justify="flex-end" align="center" className="page-pagination">
        <Pagination
          current={currentPage}
          total={data.length}
          pageSize={pageSize}
          pageSizeOptions={[20, 50, 100]}
          showSizeChanger
          onChange={(page, size) => {
            setCurrentPage(page);
            setPageSize(size);
          }}
        />
      </Flex>

      <Modal
        title={
          <>
            <ExclamationCircleFilled className="modal-warning-icon" />
            <span>{t('rpa_delete')}</span>
          </>
        }
        open={!!deleteTarget}
        centered
        closable={false}
        okText={t('footer_confirm')}
        cancelText={t('footer_cancel')}
        onOk={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      >
        <div className="pl-[36px]">{t('rpa_delete_confirm', {name: deleteTarget?.name})}</div>
      </Modal>

      <Modal
        title={t('rpa_run_title', {name: runTarget?.name})}
        open={!!runTarget}
        centered
        width={520}
        okText={t('rpa_run')}
        cancelText={t('footer_cancel')}
        confirmLoading={running}
        okButtonProps={{disabled: selectedWindowIds.length === 0}}
        onOk={confirmRun}
        onCancel={() => setRunTarget(null)}
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

export default Rpa;

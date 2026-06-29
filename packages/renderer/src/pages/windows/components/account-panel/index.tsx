import {Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Typography, message} from 'antd';
import {DeleteOutlined, PlusOutlined} from '@ant-design/icons';
import {useEffect, useState} from 'react';
import {AccountBridge} from '#preload';
import type {DB} from '../../../../../../shared/types/db';

const {Text} = Typography;

/**
 * Phase 3.5 — Account credentials section for the profile editor.
 *
 * Lists accounts bound to a window and lets the user add/edit/delete them.
 * Credentials are encrypted at rest by the main process; this panel only ever
 * works with the decrypted, app-facing shape returned by AccountBridge.
 */
const AccountPanel = ({windowId}: {windowId?: number}) => {
  const [accounts, setAccounts] = useState<DB.Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DB.Account | null>(null);
  const [form] = Form.useForm<DB.Account>();
  const [messageApi, contextHolder] = message.useMessage({duration: 2, top: 100});

  const fetchAccounts = async () => {
    if (!windowId) {
      return;
    }
    setLoading(true);
    try {
      const data = await AccountBridge?.getByWindowId(windowId);
      setAccounts(data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowId]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (account: DB.Account) => {
    setEditing(account);
    form.setFieldsValue(account);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload: DB.Account = {...values, window_id: windowId ?? null};
    const res = editing?.id
      ? await AccountBridge?.update(editing.id, payload)
      : await AccountBridge?.create(payload);
    if (res?.success) {
      messageApi.success(editing ? 'Account updated' : 'Account added');
      setModalOpen(false);
      fetchAccounts();
    } else {
      messageApi.error(res?.message || 'Failed to save account');
    }
  };

  const handleDelete = async (id?: number) => {
    if (!id) return;
    await AccountBridge?.delete(id);
    messageApi.success('Account deleted');
    fetchAccounts();
  };

  const columns = [
    {title: 'Platform', dataIndex: 'platform', key: 'platform'},
    {title: 'Username', dataIndex: 'username', key: 'username'},
    {
      title: 'Password',
      dataIndex: 'password',
      key: 'password',
      render: (value: string) => (value ? '••••••••' : ''),
    },
    {title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true},
    {
      title: '',
      key: 'action',
      width: 110,
      render: (_: unknown, record: DB.Account) => (
        <Space>
          <Button
            size="small"
            type="link"
            onClick={() => openEdit(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete this account?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button
              size="small"
              type="link"
              danger
              icon={<DeleteOutlined />}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!windowId) {
    return (
      <Card
        size="small"
        title="Accounts"
      >
        <Text type="secondary">Save the profile first to manage its accounts.</Text>
      </Card>
    );
  }

  return (
    <Card
      size="small"
      title="Accounts"
      extra={
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={openAdd}
        >
          Add
        </Button>
      }
    >
      {contextHolder}
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={accounts}
        pagination={false}
        locale={{emptyText: 'No accounts yet. Add one to store login credentials.'}}
      />
      <Modal
        title={editing ? 'Edit Account' : 'Add Account'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="Save"
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="platform"
            label="Platform"
          >
            <Input placeholder="e.g. Facebook, Gmail" />
          </Form.Item>
          <Form.Item
            name="username"
            label="Username"
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="secret"
            label="2FA secret"
          >
            <Input.Password
              autoComplete="new-password"
              placeholder="TOTP / 2FA secret (optional)"
            />
          </Form.Item>
          <Form.Item
            name="notes"
            label="Notes"
          >
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default AccountPanel;

import {Button, Input, Modal, Segmented, Space, Typography, message} from 'antd';
import {useEffect, useState} from 'react';
import {WindowBridge} from '#preload';

const {Text} = Typography;

/**
 * Phase 3.5 — Cookie import/export modal.
 *
 * Import accepts EditThisCookie JSON, Netscape cookies.txt, or a raw Cookie
 * header string (auto-detected by the main process) and applies it to the given
 * profile id(s). Export pulls live cookies (CDP) from a running profile, or the
 * stored preset cookies otherwise.
 */
const CookieModal = ({
  open,
  windowIds,
  onClose,
}: {
  open: boolean;
  windowIds: number[];
  onClose: () => void;
}) => {
  const [mode, setMode] = useState<'import' | 'export'>('import');
  const [raw, setRaw] = useState('');
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [messageApi, contextHolder] = message.useMessage({duration: 2, top: 100});

  // Export only makes sense for a single profile; force import mode for bulk.
  useEffect(() => {
    if (windowIds.length !== 1) {
      setMode('import');
    }
  }, [windowIds, open]);

  const handleImport = async () => {
    if (!raw.trim()) {
      messageApi.warning('Paste cookies to import.');
      return;
    }
    setBusy(true);
    try {
      const res = await WindowBridge?.importCookie(windowIds, raw, domain || undefined);
      if (res?.success) {
        messageApi.success(res.message);
        onClose();
      } else {
        messageApi.error(res?.message || 'No valid cookies found.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      const res = await WindowBridge?.exportCookie(windowIds[0]);
      if (res?.success) {
        setRaw(res.data ?? '');
        messageApi.success('Cookies loaded. Copy the JSON below.');
      } else {
        messageApi.error(res?.message || 'Failed to export cookies.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Cookies"
      open={open}
      onCancel={onClose}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={onClose}>Close</Button>
          {mode === 'import' ? (
            <Button
              type="primary"
              loading={busy}
              onClick={handleImport}
            >
              Import to {windowIds.length} profile(s)
            </Button>
          ) : (
            <Button
              type="primary"
              loading={busy}
              onClick={handleExport}
            >
              Load cookies
            </Button>
          )}
        </Space>
      }
    >
      {contextHolder}
      <Space
        direction="vertical"
        style={{width: '100%'}}
        size="middle"
      >
        {windowIds.length === 1 ? (
          <Segmented
            value={mode}
            onChange={value => {
              setMode(value as 'import' | 'export');
              setRaw('');
            }}
            options={[
              {label: 'Import', value: 'import'},
              {label: 'Export', value: 'export'},
            ]}
          />
        ) : (
          <Text type="secondary">Importing to {windowIds.length} selected profiles.</Text>
        )}

        {mode === 'import' ? (
          <Input
            placeholder="Default domain (optional, for header-string cookies)"
            value={domain}
            onChange={e => setDomain(e.target.value)}
          />
        ) : null}

        <Input.TextArea
          rows={10}
          value={raw}
          onChange={e => setRaw(e.target.value)}
          placeholder={
            mode === 'import'
              ? 'Paste EditThisCookie JSON, Netscape cookies.txt, or a Cookie header string'
              : 'Exported cookies will appear here'
          }
        />
      </Space>
    </Modal>
  );
};

export default CookieModal;

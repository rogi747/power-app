import {Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Switch, Typography, message} from 'antd';
import {ReloadOutlined, LockOutlined, UnlockOutlined} from '@ant-design/icons';
import {useEffect, useState} from 'react';
import {WindowBridge} from '#preload';
import type {Fingerprint} from '../../../../../../shared/types/fingerprint';
import './index.css';

const {Text} = Typography;

const OS_OPTIONS = ['Windows', 'macOS', 'Linux', 'Android', 'iOS'].map(v => ({label: v, value: v}));
const NOISE_MODE_OPTIONS = ['noise', 'block', 'real', 'custom'].map(v => ({label: v, value: v}));
const WEBRTC_OPTIONS = ['proxy', 'forward', 'local', 'disabled'].map(v => ({label: v, value: v}));

/**
 * Fingerprint editor panel for the create/edit profile form.
 *
 * - Random: re-rolls a fresh, internally-consistent fingerprint.
 * - Lock: when on, the fingerprint is pinned (won't be auto-regenerated on open).
 * - Override: edit individual fields inline; changes propagate up via `onChange`.
 */
const FingerprintPanel = ({
  windowId,
  profileId,
  value,
  locked,
  onChange,
  onLockChange,
}: {
  windowId?: number;
  profileId?: string;
  value?: Fingerprint;
  locked?: boolean;
  onChange: (fp: Fingerprint) => void;
  onLockChange?: (locked: boolean) => void;
}) => {
  const [fp, setFp] = useState<Fingerprint | undefined>(value);
  const [generating, setGenerating] = useState(false);
  const [messageApi, contextHolder] = message.useMessage({duration: 2, top: 100});

  useEffect(() => {
    setFp(value);
  }, [value]);

  const ensureFingerprint = async () => {
    if (!fp || !fp.fpVersion) {
      const generated = await WindowBridge?.generateFingerprint(profileId);
      setFp(generated);
      onChange(generated);
    }
  };

  useEffect(() => {
    ensureFingerprint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRandom = async () => {
    setGenerating(true);
    try {
      // Re-roll with a fresh random seed so the user gets a genuinely new identity.
      const generated = await WindowBridge?.generateFingerprint(
        `${profileId ?? 'new'}-${Date.now()}`,
      );
      setFp(generated);
      onChange(generated);
      messageApi.success('New fingerprint generated');
    } finally {
      setGenerating(false);
    }
  };

  const patch = (partial: Partial<Fingerprint>) => {
    if (!fp) return;
    const next = {...fp, ...partial};
    setFp(next);
    onChange(next);
  };

  const handleSavePersist = async () => {
    if (!windowId || !fp) return;
    const res = await WindowBridge?.updateFingerprint(windowId, fp);
    if (res?.success) {
      messageApi.success('Fingerprint saved');
    } else {
      messageApi.error(res?.message || 'Failed to save fingerprint');
    }
  };

  return (
    <Card
      size="small"
      className="fingerprint-panel"
      title={
        <Space>
          <Text strong>Fingerprint</Text>
          <Switch
            size="small"
            checked={locked ?? true}
            checkedChildren={<LockOutlined />}
            unCheckedChildren={<UnlockOutlined />}
            onChange={checked => onLockChange?.(checked)}
          />
        </Space>
      }
      extra={
        <Space>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={generating}
            onClick={handleRandom}
          >
            Random
          </Button>
          {windowId ? (
            <Button
              size="small"
              type="primary"
              onClick={handleSavePersist}
            >
              Save
            </Button>
          ) : null}
        </Space>
      }
    >
      {contextHolder}
      {fp ? (
        <Form
          layout="vertical"
          size="small"
        >
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label="User-Agent">
                <Input
                  value={fp.ua}
                  onChange={e => patch({ua: e.target.value})}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="OS">
                <Select
                  options={OS_OPTIONS}
                  value={fp.os}
                  onChange={v => patch({os: v})}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Screen Resolution">
                <Input
                  value={fp.screen_resolution}
                  onChange={e => patch({screen_resolution: e.target.value})}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Languages">
                <Input
                  value={fp.languages}
                  onChange={e => patch({languages: e.target.value})}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Hardware Concurrency">
                <InputNumber
                  style={{width: '100%'}}
                  min={1}
                  max={64}
                  value={fp.hardware_concurrency}
                  onChange={v => patch({hardware_concurrency: Number(v)})}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Device Memory (GB)">
                <InputNumber
                  style={{width: '100%'}}
                  min={1}
                  max={128}
                  value={fp.device_memory}
                  onChange={v => patch({device_memory: Number(v)})}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="WebRTC">
                <Select
                  options={WEBRTC_OPTIONS}
                  value={fp.webrtc?.mode}
                  onChange={v => patch({webrtc: {mode: v}})}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Canvas">
                <Select
                  options={NOISE_MODE_OPTIONS}
                  value={fp.canvas}
                  onChange={v => patch({canvas: v})}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="WebGL Image">
                <Select
                  options={NOISE_MODE_OPTIONS}
                  value={fp.webgl_image}
                  onChange={v => patch({webgl_image: v})}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Audio">
                <Select
                  options={NOISE_MODE_OPTIONS}
                  value={fp.audio}
                  onChange={v => patch({audio: v})}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      ) : (
        <Text type="secondary">Generating fingerprint...</Text>
      )}
    </Card>
  );
};

export default FingerprintPanel;

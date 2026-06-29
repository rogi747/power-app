import React from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {Input, Select, Switch, Collapse, Empty} from 'antd';
import type {RootState} from '../../../store';
import {updateNode, updateNodeParams} from '../../../store/rpa-builder-slice';
import {getSpec} from '../node-catalog';

/**
 * Right-hand property panel. Renders the form for the selected node, driven by
 * the field schema in the node catalog. Secret fields are masked.
 */
const PropertyPanel: React.FC = () => {
  const dispatch = useDispatch();
  const {nodes, selectedNodeId} = useSelector((s: RootState) => s.rpaBuilder);
  const node = nodes.find(n => n.id === selectedNodeId);

  if (!node) {
    return (
      <div style={{padding: 24}}>
        <Empty description="Select a step to edit its settings" />
      </div>
    );
  }

  const spec = getSpec(node.type);
  const params = node.params ?? {};
  const error = node.error ?? {};

  const setParam = (key: string, value: unknown) =>
    dispatch(updateNodeParams({id: node.id, params: {[key]: value}}));

  return (
    <div style={{padding: 16, overflowY: 'auto', height: '100%'}}>
      <div style={{marginBottom: 8, fontSize: 12, color: '#94a3b8', textTransform: 'uppercase'}}>
        {spec?.category} step
      </div>

      <label style={{fontSize: 12, color: '#475569'}}>Step name</label>
      <Input
        value={node.label ?? ''}
        placeholder={spec?.label}
        onChange={e => dispatch(updateNode({id: node.id, changes: {label: e.target.value}}))}
        style={{marginBottom: 12, marginTop: 4}}
      />

      {spec?.description && (
        <p style={{fontSize: 12, color: '#94a3b8', marginBottom: 16}}>{spec.description}</p>
      )}

      {spec?.fields.map(field => (
        <div key={field.key} style={{marginBottom: 12}}>
          <label style={{fontSize: 12, color: '#475569'}}>{field.label}</label>
          <div style={{marginTop: 4}}>
            {field.type === 'textarea' ? (
              <Input.TextArea
                rows={3}
                value={(params[field.key] as string) ?? ''}
                placeholder={field.placeholder}
                onChange={e => setParam(field.key, e.target.value)}
              />
            ) : field.type === 'select' ? (
              <Select
                style={{width: '100%'}}
                value={params[field.key] as string}
                options={field.options}
                onChange={v => setParam(field.key, v)}
                allowClear
              />
            ) : field.type === 'number' ? (
              <Input
                type="number"
                value={(params[field.key] as number) ?? ''}
                placeholder={field.placeholder}
                onChange={e => setParam(field.key, Number(e.target.value))}
              />
            ) : field.type === 'boolean' ? (
              <Switch
                checked={Boolean(params[field.key])}
                onChange={v => setParam(field.key, v)}
              />
            ) : field.secret ? (
              <Input.Password
                value={(params[field.key] as string) ?? ''}
                placeholder={field.placeholder}
                onChange={e => setParam(field.key, e.target.value)}
              />
            ) : (
              <Input
                value={(params[field.key] as string) ?? ''}
                placeholder={field.placeholder}
                onChange={e => setParam(field.key, e.target.value)}
              />
            )}
          </div>
        </div>
      ))}

      <Collapse
        ghost
        style={{marginTop: 8}}
        items={[
          {
            key: 'error',
            label: 'Error handling',
            children: (
              <>
                <label style={{fontSize: 12, color: '#475569'}}>On error</label>
                <Select
                  style={{width: '100%', marginTop: 4, marginBottom: 12}}
                  value={error.onError ?? 'stop'}
                  options={[
                    {label: 'Stop workflow', value: 'stop'},
                    {label: 'Skip step', value: 'skip'},
                    {label: 'Continue', value: 'continue'},
                    {label: 'Retry', value: 'retry'},
                  ]}
                  onChange={v =>
                    dispatch(updateNode({id: node.id, changes: {error: {...error, onError: v}}}))
                  }
                />
                {error.onError === 'retry' && (
                  <>
                    <label style={{fontSize: 12, color: '#475569'}}>Retry count</label>
                    <Input
                      type="number"
                      style={{marginTop: 4, marginBottom: 12}}
                      value={error.retryCount ?? 1}
                      onChange={e =>
                        dispatch(
                          updateNode({
                            id: node.id,
                            changes: {error: {...error, retryCount: Number(e.target.value)}},
                          }),
                        )
                      }
                    />
                  </>
                )}
                <label style={{fontSize: 12, color: '#475569'}}>Timeout (ms)</label>
                <Input
                  type="number"
                  style={{marginTop: 4}}
                  value={error.timeout ?? ''}
                  placeholder="30000"
                  onChange={e =>
                    dispatch(
                      updateNode({
                        id: node.id,
                        changes: {error: {...error, timeout: Number(e.target.value)}},
                      }),
                    )
                  }
                />
              </>
            ),
          },
        ]}
      />

      <div style={{marginTop: 16, display: 'flex', alignItems: 'center', gap: 8}}>
        <Switch
          checked={!node.disabled}
          onChange={v => dispatch(updateNode({id: node.id, changes: {disabled: !v}}))}
        />
        <span style={{fontSize: 13, color: '#475569'}}>Step enabled</span>
      </div>
    </div>
  );
};

export default PropertyPanel;

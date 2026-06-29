import React, {useCallback, useRef, useState} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {Icon} from '@iconify/react';
import type {RootState} from '../../../store';
import {
  addEdge,
  moveNode,
  removeEdge,
  removeNode,
  selectNode,
} from '../../../store/rpa-builder-slice';
import {getSpec, CATEGORY_COLORS} from '../node-catalog';
import type {RPA} from '../../../../../shared/types/rpa';

/**
 * Self-contained flow canvas for the Process Builder.
 *
 * A dependency-free SVG/DOM canvas: nodes are absolutely-positioned cards,
 * edges are SVG bezier paths. Supports drag-to-move, click-to-select, and
 * drag-from-output-handle-to-input to connect. This mirrors the React Flow
 * interaction model while keeping the build free of extra runtime deps.
 */

const NODE_W = 200;
const NODE_H = 64;

interface DragState {
  nodeId: string;
  offsetX: number;
  offsetY: number;
}

interface ConnectState {
  source: string;
  sourceHandle: string;
  x: number;
  y: number;
}

const handlePoint = (node: RPA.Node, side: 'in' | 'out', index = 0, total = 1) => {
  const x = node.position.x + (side === 'in' ? 0 : NODE_W);
  const slot = total > 1 ? ((index + 1) / (total + 1)) * NODE_H : NODE_H / 2;
  return {x, y: node.position.y + slot};
};

const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

const FlowCanvas: React.FC = () => {
  const dispatch = useDispatch();
  const {nodes, edges, selectedNodeId} = useSelector((s: RootState) => s.rpaBuilder);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [connect, setConnect] = useState<ConnectState | null>(null);

  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: clientX - (rect?.left ?? 0) + (canvasRef.current?.scrollLeft ?? 0),
      y: clientY - (rect?.top ?? 0) + (canvasRef.current?.scrollTop ?? 0),
    };
  }, []);

  const onNodeMouseDown = (e: React.MouseEvent, node: RPA.Node) => {
    e.stopPropagation();
    dispatch(selectNode(node.id));
    const pt = toCanvas(e.clientX, e.clientY);
    setDrag({nodeId: node.id, offsetX: pt.x - node.position.x, offsetY: pt.y - node.position.y});
  };

  const onHandleMouseDown = (e: React.MouseEvent, node: RPA.Node, handle: string) => {
    e.stopPropagation();
    const pt = toCanvas(e.clientX, e.clientY);
    setConnect({source: node.id, sourceHandle: handle, x: pt.x, y: pt.y});
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const pt = toCanvas(e.clientX, e.clientY);
    if (drag) {
      dispatch(
        moveNode({
          id: drag.nodeId,
          position: {x: pt.x - drag.offsetX, y: pt.y - drag.offsetY},
        }),
      );
    } else if (connect) {
      setConnect({...connect, x: pt.x, y: pt.y});
    }
  };

  const onMouseUp = () => {
    setDrag(null);
    setConnect(null);
  };

  const onInputMouseUp = (e: React.MouseEvent, target: RPA.Node) => {
    e.stopPropagation();
    if (connect && connect.source !== target.id) {
      dispatch(
        addEdge({
          id: `e_${connect.source}_${target.id}_${Date.now()}`,
          source: connect.source,
          target: target.id,
          sourceHandle: connect.sourceHandle,
        }),
      );
    }
    setConnect(null);
  };

  return (
    <div
      ref={canvasRef}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={() => dispatch(selectNode(null))}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'auto',
        backgroundColor: '#fafbfc',
        backgroundImage:
          'radial-gradient(circle, #dfe3e8 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      {nodes.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            pointerEvents: 'none',
            fontSize: 14,
          }}
        >
          Drag a step from the left to start building.
        </div>
      )}

      {/* Edges */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 4000,
          height: 3000,
          pointerEvents: 'none',
        }}
      >
        {edges.map(edge => {
          const src = nodes.find(n => n.id === edge.source);
          const tgt = nodes.find(n => n.id === edge.target);
          if (!src || !tgt) return null;
          const outs = getSpec(src.type)?.outputs ?? [{id: 'default', label: ''}];
          const idx = Math.max(
            0,
            outs.findIndex(o => o.id === edge.sourceHandle),
          );
          const p1 = handlePoint(src, 'out', idx, outs.length);
          const p2 = handlePoint(tgt, 'in');
          return (
            <g key={edge.id}>
              <path
                d={bezier(p1.x, p1.y, p2.x, p2.y)}
                stroke="#94a3b8"
                strokeWidth={2}
                fill="none"
                style={{pointerEvents: 'stroke', cursor: 'pointer'}}
                onClick={() => dispatch(removeEdge(edge.id))}
              />
            </g>
          );
        })}
        {connect && (
          (() => {
            const src = nodes.find(n => n.id === connect.source);
            if (!src) return null;
            const outs = getSpec(src.type)?.outputs ?? [{id: 'default', label: ''}];
            const idx = Math.max(0, outs.findIndex(o => o.id === connect.sourceHandle));
            const p1 = handlePoint(src, 'out', idx, outs.length);
            return (
              <path
                d={bezier(p1.x, p1.y, connect.x, connect.y)}
                stroke="#2f80ed"
                strokeWidth={2}
                strokeDasharray="4 4"
                fill="none"
              />
            );
          })()
        )}
      </svg>

      {/* Nodes */}
      {nodes.map(node => {
        const spec = getSpec(node.type);
        const color = spec ? CATEGORY_COLORS[spec.category] : '#64748b';
        const outs = spec?.outputs ?? [{id: 'default', label: ''}];
        const selected = node.id === selectedNodeId;
        return (
          <div
            key={node.id}
            onMouseDown={e => onNodeMouseDown(e, node)}
            style={{
              position: 'absolute',
              left: node.position.x,
              top: node.position.y,
              width: NODE_W,
              minHeight: NODE_H,
              background: '#fff',
              borderRadius: 10,
              borderLeft: `4px solid ${color}`,
              boxShadow: selected
                ? `0 0 0 2px ${color}, 0 6px 16px rgba(0,0,0,0.12)`
                : '0 2px 8px rgba(0,0,0,0.08)',
              cursor: 'grab',
              userSelect: 'none',
            }}
          >
            {/* Input handle */}
            <span
              onMouseUp={e => onInputMouseUp(e, node)}
              title="Input"
              style={{
                position: 'absolute',
                left: -7,
                top: NODE_H / 2 - 6,
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#fff',
                border: '2px solid #94a3b8',
              }}
            />
            <div style={{padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8}}>
              <Icon icon={spec?.icon ?? 'mdi:cube-outline'} style={{color, fontSize: 18}} />
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{fontSize: 13, fontWeight: 600, color: '#1e293b'}}>
                  {node.label || spec?.label || node.type}
                </div>
                {node.disabled && (
                  <div style={{fontSize: 11, color: '#cbd5e1'}}>disabled</div>
                )}
              </div>
              <Icon
                icon="mdi:close"
                onMouseDown={e => {
                  e.stopPropagation();
                  dispatch(removeNode(node.id));
                }}
                style={{color: '#cbd5e1', fontSize: 14, cursor: 'pointer'}}
              />
            </div>

            {/* Output handles */}
            {outs.map((out, i) => {
              const slot =
                outs.length > 1 ? ((i + 1) / (outs.length + 1)) * NODE_H : NODE_H / 2;
              return (
                <span
                  key={out.id}
                  onMouseDown={e => onHandleMouseDown(e, node, out.id)}
                  title={out.label || 'Output'}
                  style={{
                    position: 'absolute',
                    right: -7,
                    top: slot - 6,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: color,
                    border: '2px solid #fff',
                    cursor: 'crosshair',
                  }}
                >
                  {outs.length > 1 && (
                    <span
                      style={{
                        position: 'absolute',
                        left: 14,
                        top: -4,
                        fontSize: 10,
                        color: '#64748b',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {out.label}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

export default FlowCanvas;

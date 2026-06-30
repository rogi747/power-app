import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {Icon} from '@iconify/react';
import type {RootState} from '../../../store';
import {
  addEdge,
  commitHistory,
  moveNodes,
  removeEdge,
  removeNode,
  selectNode,
  setSelectedNodeIds,
  toggleNodeSelection,
} from '../../../store/rpa-builder-slice';
import {getSpec, CATEGORY_COLORS} from '../node-catalog';
import type {RPA} from '../../../../../shared/types/rpa';
import {validateWorkflow} from '../../../../../shared/rpa/validator';

/**
 * Self-contained flow canvas for the Process Builder.
 *
 * A dependency-free SVG/DOM canvas: nodes are absolutely-positioned cards,
 * edges are SVG bezier paths. Supports drag-to-move, click-to-select,
 * Ctrl/Shift-click multi-select, group drag, zoom/pan viewport, fit-to-screen,
 * a simple mini-map, and drag-from-output-handle-to-input to connect.
 */

const NODE_W = 200;
const NODE_H = 64;
const WORLD_W = 4000;
const WORLD_H = 3000;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

const RUN_STATUS_COLORS: Partial<Record<RPA.TaskStatus, string>> = {
  running: '#2563eb',
  completed: '#16a34a',
  error: '#dc2626',
  cancelled: '#64748b',
  retry: '#f59e0b',
  paused: '#7c3aed',
};

const RUN_STATUS_ICONS: Partial<Record<RPA.TaskStatus, string>> = {
  running: 'mdi:play-circle',
  completed: 'mdi:check-circle',
  error: 'mdi:close-circle',
  cancelled: 'mdi:stop-circle',
  retry: 'mdi:refresh-circle',
  paused: 'mdi:pause-circle',
};

interface DragState {
  anchorX: number;
  anchorY: number;
  nodeIds: string[];
  startPositions: Record<string, RPA.NodePosition>;
}

interface ConnectState {
  source: string;
  sourceHandle: string;
  x: number;
  y: number;
}

interface PanState {
  anchorClientX: number;
  anchorClientY: number;
  startX: number;
  startY: number;
}

interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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
  const {nodes, edges, variables, settings, selectedNodeId, selectedNodeIds, nodeRunStatus} = useSelector(
    (s: RootState) => s.rpaBuilder,
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [connect, setConnect] = useState<ConnectState | null>(null);
  const [pan, setPan] = useState<PanState | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [viewport, setViewport] = useState<ViewportState>({x: 0, y: 0, scale: 1});

  const nodeIssueMap = useMemo(() => {
    const result = validateWorkflow({nodes, edges, variables, settings, version: 1});
    const map = new Map<string, {level: 'error' | 'warning'; messages: string[]}>();
    for (const issue of result.issues) {
      if (!issue.nodeId) continue;
      const current = map.get(issue.nodeId);
      if (!current) {
        map.set(issue.nodeId, {level: issue.level, messages: [issue.message]});
        continue;
      }
      current.messages.push(issue.message);
      if (issue.level === 'error') current.level = 'error';
    }
    return map;
  }, [nodes, edges, variables, settings]);

  const bounds = useMemo(() => {
    if (nodes.length === 0) return null;
    const minX = Math.min(...nodes.map(n => n.position.x));
    const minY = Math.min(...nodes.map(n => n.position.y));
    const maxX = Math.max(...nodes.map(n => n.position.x + NODE_W));
    const maxY = Math.max(...nodes.map(n => n.position.y + NODE_H));
    return {minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY};
  }, [nodes]);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      return {
        x: (clientX - (rect?.left ?? 0) - viewport.x) / viewport.scale,
        y: (clientY - (rect?.top ?? 0) - viewport.y) / viewport.scale,
      };
    },
    [viewport],
  );

  const zoomAt = useCallback((clientX: number, clientY: number, nextScale: number) => {
    setViewport(current => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const screenX = clientX - (rect?.left ?? 0);
      const screenY = clientY - (rect?.top ?? 0);
      const worldX = (screenX - current.x) / current.scale;
      const worldY = (screenY - current.y) / current.scale;
      const scale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
      return {
        scale,
        x: screenX - worldX * scale,
        y: screenY - worldY * scale,
      };
    });
  }, []);

  const zoomBy = (factor: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    zoomAt((rect?.left ?? 0) + (rect?.width ?? 0) / 2, (rect?.top ?? 0) + (rect?.height ?? 0) / 2, viewport.scale * factor);
  };

  const resetView = () => setViewport({x: 0, y: 0, scale: 1});

  const fitView = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !bounds) {
      resetView();
      return;
    }
    const padding = 120;
    const scale = clamp(
      Math.min(rect.width / Math.max(bounds.width + padding, 1), rect.height / Math.max(bounds.height + padding, 1)),
      MIN_ZOOM,
      Math.min(MAX_ZOOM, 1.3),
    );
    setViewport({
      scale,
      x: rect.width / 2 - (bounds.minX + bounds.width / 2) * scale,
      y: rect.height / 2 - (bounds.minY + bounds.height / 2) * scale,
    });
  }, [bounds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        const el = document.activeElement as HTMLElement | null;
        const tag = el?.tagName.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && !el?.isContentEditable) {
          event.preventDefault();
          setSpaceDown(true);
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const onNodeMouseDown = (e: React.MouseEvent, node: RPA.Node) => {
    e.stopPropagation();

    const multiToggle = e.ctrlKey || e.metaKey || e.shiftKey;
    if (multiToggle) {
      dispatch(toggleNodeSelection(node.id));
      return;
    }

    const dragIds =
      selectedNodeIds.includes(node.id) && selectedNodeIds.length > 1
        ? selectedNodeIds
        : [node.id];

    if (!selectedNodeIds.includes(node.id) || selectedNodeIds.length <= 1) {
      dispatch(selectNode(node.id));
    }

    dispatch(commitHistory());
    const pt = toWorld(e.clientX, e.clientY);
    const idSet = new Set(dragIds);
    const startPositions: Record<string, RPA.NodePosition> = {};
    nodes.forEach(n => {
      if (idSet.has(n.id)) startPositions[n.id] = {...n.position};
    });
    setDrag({anchorX: pt.x, anchorY: pt.y, nodeIds: dragIds, startPositions});
  };

  const onHandleMouseDown = (e: React.MouseEvent, node: RPA.Node, handle: string) => {
    e.stopPropagation();
    const pt = toWorld(e.clientX, e.clientY);
    setConnect({source: node.id, sourceHandle: handle, x: pt.x, y: pt.y});
  };

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    const shouldPan = e.button === 1 || spaceDown;
    if (shouldPan) {
      e.preventDefault();
      setPan({
        anchorClientX: e.clientX,
        anchorClientY: e.clientY,
        startX: viewport.x,
        startY: viewport.y,
      });
      return;
    }
    if (e.button === 0 && e.target === canvasRef.current) {
      dispatch(setSelectedNodeIds([]));
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const pt = toWorld(e.clientX, e.clientY);
    if (pan) {
      setViewport(current => ({
        ...current,
        x: pan.startX + (e.clientX - pan.anchorClientX),
        y: pan.startY + (e.clientY - pan.anchorClientY),
      }));
    } else if (drag) {
      const dx = pt.x - drag.anchorX;
      const dy = pt.y - drag.anchorY;
      const positions: Record<string, RPA.NodePosition> = {};
      drag.nodeIds.forEach(id => {
        const start = drag.startPositions[id];
        if (!start) return;
        positions[id] = {x: start.x + dx, y: start.y + dy};
      });
      dispatch(moveNodes(positions));
    } else if (connect) {
      setConnect({...connect, x: pt.x, y: pt.y});
    }
  };

  const onMouseUp = () => {
    setDrag(null);
    setConnect(null);
    setPan(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomAt(e.clientX, e.clientY, viewport.scale * factor);
      return;
    }
    setViewport(current => ({
      ...current,
      x: current.x - e.deltaX,
      y: current.y - e.deltaY,
    }));
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

  const minimap = useMemo(() => {
    const w = 180;
    const h = 120;
    const sx = w / WORLD_W;
    const sy = h / WORLD_H;
    const rect = canvasRef.current?.getBoundingClientRect();
    const view = rect
      ? {
          x: clamp((-viewport.x / viewport.scale) * sx, 0, w),
          y: clamp((-viewport.y / viewport.scale) * sy, 0, h),
          width: clamp((rect.width / viewport.scale) * sx, 2, w),
          height: clamp((rect.height / viewport.scale) * sy, 2, h),
        }
      : {x: 0, y: 0, width: 0, height: 0};
    return {w, h, sx, sy, view};
  }, [viewport, nodes.length]);

  const jumpFromMinimap = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / minimap.w) * WORLD_W;
    const y = ((e.clientY - rect.top) / minimap.h) * WORLD_H;
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    setViewport(current => ({
      ...current,
      x: canvasRect.width / 2 - x * current.scale,
      y: canvasRect.height / 2 - y * current.scale,
    }));
  };

  const cursor = pan ? 'grabbing' : spaceDown ? 'grab' : 'default';

  return (
    <div
      ref={canvasRef}
      onMouseDown={onCanvasMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#fafbfc',
        backgroundImage:
          'radial-gradient(circle, #dfe3e8 1px, transparent 1px)',
        backgroundSize: `${20 * viewport.scale}px ${20 * viewport.scale}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        cursor,
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

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: WORLD_W,
          height: WORLD_H,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {/* Edges */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: WORLD_W,
            height: WORLD_H,
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
          const selected = selectedNodeIds.includes(node.id);
          const primarySelected = node.id === selectedNodeId;
          const issue = nodeIssueMap.get(node.id);
          const issueColor = issue?.level === 'error' ? '#ef4444' : issue?.level === 'warning' ? '#f59e0b' : undefined;
          const runState = nodeRunStatus[node.id];
          const runColor = runState?.status ? RUN_STATUS_COLORS[runState.status] : undefined;
          const highlightColor = runColor ?? issueColor;
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
                  ? `0 0 0 ${primarySelected ? 3 : 2}px ${highlightColor ?? color}, 0 6px 16px rgba(0,0,0,0.12)`
                  : highlightColor
                  ? `0 0 0 2px ${highlightColor}, 0 2px 8px rgba(0,0,0,0.08)`
                  : '0 2px 8px rgba(0,0,0,0.08)',
                cursor: spaceDown ? 'grab' : 'grab',
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
                  {runState?.status && (
                    <div style={{fontSize: 11, color: runColor}}>
                      {runState.status}
                      {runState.duration != null ? ` · ${runState.duration}ms` : ''}
                    </div>
                  )}
                </div>
                {selectedNodeIds.length > 1 && selected && (
                  <span style={{fontSize: 11, color: '#64748b'}}>#{selectedNodeIds.indexOf(node.id) + 1}</span>
                )}
                {runState?.status && (
                  <span
                    title={`${runState.status}${runState.message ? `: ${runState.message}` : ''}`}
                    style={{display: 'inline-flex'}}
                  >
                    <Icon
                      icon={RUN_STATUS_ICONS[runState.status] ?? 'mdi:circle'}
                      style={{color: runColor, fontSize: 16}}
                    />
                  </span>
                )}
                {issue && (
                  <span title={issue.messages.join('\n')} style={{display: 'inline-flex'}}>
                    <Icon
                      icon={issue.level === 'error' ? 'mdi:alert-circle' : 'mdi:alert'}
                      style={{color: issueColor, fontSize: 16}}
                    />
                  </span>
                )}
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

      {/* Viewport toolbar */}
      <div
        style={{
          position: 'absolute',
          right: 12,
          top: 12,
          zIndex: 10,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          padding: 6,
          borderRadius: 10,
          background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 2px 10px rgba(15,23,42,0.12)',
        }}
      >
        <button title="Zoom out" onClick={() => zoomBy(0.9)} style={toolButtonStyle}>−</button>
        <span style={{fontSize: 12, color: '#475569', minWidth: 44, textAlign: 'center'}}>
          {Math.round(viewport.scale * 100)}%
        </span>
        <button title="Zoom in" onClick={() => zoomBy(1.1)} style={toolButtonStyle}>+</button>
        <button title="Fit to screen" onClick={fitView} style={toolButtonStyle}>Fit</button>
        <button title="Reset view" onClick={resetView} style={toolButtonStyle}>1:1</button>
      </div>

      {/* Mini-map */}
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          zIndex: 10,
          padding: 6,
          borderRadius: 10,
          background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 2px 10px rgba(15,23,42,0.12)',
        }}
      >
        <svg
          width={minimap.w}
          height={minimap.h}
          onClick={jumpFromMinimap}
          style={{display: 'block', cursor: 'pointer', background: '#f8fafc', borderRadius: 6}}
        >
          <rect x={0} y={0} width={minimap.w} height={minimap.h} fill="#f8fafc" stroke="#cbd5e1" />
          {nodes.map(node => {
            const spec = getSpec(node.type);
            const color = spec ? CATEGORY_COLORS[spec.category] : '#64748b';
            const runState = nodeRunStatus[node.id];
            const runColor = runState?.status ? RUN_STATUS_COLORS[runState.status] : undefined;
            const fill = runColor ?? (selectedNodeIds.includes(node.id) ? color : '#94a3b8');
            return (
              <rect
                key={node.id}
                x={node.position.x * minimap.sx}
                y={node.position.y * minimap.sy}
                width={Math.max(3, NODE_W * minimap.sx)}
                height={Math.max(3, NODE_H * minimap.sy)}
                fill={fill}
                opacity={selectedNodeIds.includes(node.id) || runColor ? 0.95 : 0.65}
              />
            );
          })}
          <rect
            x={minimap.view.x}
            y={minimap.view.y}
            width={minimap.view.width}
            height={minimap.view.height}
            fill="none"
            stroke="#2563eb"
            strokeWidth={1.5}
          />
        </svg>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 12,
          bottom: 12,
          color: '#94a3b8',
          fontSize: 12,
          pointerEvents: 'none',
          background: 'rgba(255,255,255,0.7)',
          padding: '4px 8px',
          borderRadius: 8,
        }}
      >
        Ctrl + wheel: zoom · Wheel: pan · Space/middle mouse: drag canvas
      </div>
    </div>
  );
};

const toolButtonStyle: React.CSSProperties = {
  height: 26,
  minWidth: 28,
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  background: '#fff',
  color: '#334155',
  cursor: 'pointer',
  fontSize: 12,
};

export default FlowCanvas;

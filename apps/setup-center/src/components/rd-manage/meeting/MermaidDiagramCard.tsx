/**
 * 函数级方案 · Mermaid 架构图卡片：按原始尺寸渲染保证清晰，支持缩放与全屏查看
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Tooltip } from 'antd';
import {
  GitBranch,
  ListOrdered,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import { normalizeMermaidSource } from '@/components/product/markdownCodeChildren';

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.2;

type RenderState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; svg: string; naturalWidth: number; naturalHeight: number };

function buildThemeVariables(isDark: boolean) {
  return isDark
    ? {
        primaryColor: 'rgba(32, 43, 34, 0.85)',
        primaryBorderColor: '#33a06f',
        primaryTextColor: '#e2e8f0',
        lineColor: '#7c8aa0',
        clusterBkg: 'rgba(30, 38, 46, 0.45)',
        clusterBorder: '#475569',
        nodeBorder: '#33a06f',
        textColor: '#e2e8f0',
        mainBkg: 'rgba(32, 43, 34, 0.85)',
        edgeLabelBackground: '#1e293b',
        actorBkg: 'rgba(32, 43, 34, 0.85)',
        actorBorder: '#33a06f',
        actorTextColor: '#e2e8f0',
        signalColor: '#94a3b8',
        signalTextColor: '#cbd5e1',
        fontSize: '14px',
      }
    : {
        primaryColor: 'rgba(240, 253, 244, 0.9)',
        primaryBorderColor: '#22c55e',
        primaryTextColor: '#0f172a',
        lineColor: '#64748b',
        clusterBkg: 'rgba(248, 250, 252, 0.7)',
        clusterBorder: '#cbd5e1',
        nodeBorder: '#22c55e',
        textColor: '#0f172a',
        mainBkg: 'rgba(240, 253, 244, 0.9)',
        edgeLabelBackground: '#f1f5f9',
        actorBkg: 'rgba(240, 253, 244, 0.9)',
        actorBorder: '#22c55e',
        actorTextColor: '#0f172a',
        signalColor: '#475569',
        signalTextColor: '#334155',
        fontSize: '14px',
      };
}

function extractNaturalSize(svg: string): { width: number; height: number } {
  const vb = /viewBox="[\d.\-]+[ ,]+[\d.\-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/.exec(svg);
  if (vb) {
    return { width: Math.ceil(parseFloat(vb[1])), height: Math.ceil(parseFloat(vb[2])) };
  }
  const maxW = /max-width:\s*([\d.]+)px/.exec(svg);
  return { width: maxW ? Math.ceil(parseFloat(maxW[1])) : 800, height: 0 };
}

let mermaidSeq = 0;

function useMermaidSvg(source: string, isDark: boolean): RenderState {
  const [state, setState] = useState<RenderState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    const chart = normalizeMermaidSource(source.replace(/\n$/, ''));
    if (!chart) {
      setState({ status: 'error', message: '空的图表定义' });
      return;
    }
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: buildThemeVariables(isDark),
          securityLevel: 'loose',
          fontFamily:
            "ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'",
        });
        mermaidSeq += 1;
        const { svg } = await mermaid.render(`func-sol-diagram-${mermaidSeq}`, chart);
        if (!cancelled) {
          const { width, height } = extractNaturalSize(svg);
          setState({ status: 'done', svg, naturalWidth: width, naturalHeight: height });
        }
      } catch (e) {
        if (!cancelled) {
          setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, isDark]);

  return state;
}

function diagramKindMeta(kind?: string): { icon: LucideIcon; label: string } {
  const k = (kind || '').toLowerCase();
  if (k.includes('sequence')) return { icon: ListOrdered, label: '时序图' };
  if (k.includes('flow')) return { icon: Workflow, label: '流程图' };
  return { icon: GitBranch, label: '关系图' };
}

const ToolbarButton: React.FC<{
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ title, disabled, onClick, children }) => (
  <Tooltip title={title} mouseEnterDelay={0.4}>
    <button
      type="button"
      disabled={disabled}
      aria-label={title}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-cyan-400/35 bg-cyan-500/15 text-cyan-100 shadow-[0_1px_4px_rgba(0,0,0,0.25)] transition-colors hover:border-cyan-300/70 hover:bg-cyan-400/25 hover:text-white disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/[0.04] disabled:text-white/30"
      onClick={onClick}
    >
      {children}
    </button>
  </Tooltip>
);

const ZoomToolbar: React.FC<{
  zoom: number;
  onZoom: (next: number) => void;
  onFullscreen?: () => void;
}> = ({ zoom, onZoom, onFullscreen }) => (
  <div className="flex shrink-0 items-center gap-1">
    <ToolbarButton title="缩小" disabled={zoom <= ZOOM_MIN} onClick={() => onZoom(Math.max(ZOOM_MIN, +(zoom - ZOOM_STEP).toFixed(2)))}>
      <Minus className="h-3.5 w-3.5" />
    </ToolbarButton>
    <span className="w-11 select-none text-center font-mono text-[11px] tabular-nums text-muted-foreground">
      {Math.round(zoom * 100)}%
    </span>
    <ToolbarButton title="放大" disabled={zoom >= ZOOM_MAX} onClick={() => onZoom(Math.min(ZOOM_MAX, +(zoom + ZOOM_STEP).toFixed(2)))}>
      <Plus className="h-3.5 w-3.5" />
    </ToolbarButton>
    <ToolbarButton title="重置缩放" disabled={zoom === 1} onClick={() => onZoom(1)}>
      <RotateCcw className="h-3.5 w-3.5" />
    </ToolbarButton>
    {onFullscreen ? (
      <ToolbarButton title="全屏查看" onClick={onFullscreen}>
        <Maximize2 className="h-3.5 w-3.5" />
      </ToolbarButton>
    ) : null}
  </div>
);

const DiagramCanvas: React.FC<{
  state: RenderState;
  zoom: number;
  maxHeight?: number | string;
}> = ({ state, zoom, maxHeight = 520 }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // 仅左键触发拖拽
    if (e.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    el.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = scrollRef.current;
    if (!drag || !el) return;
    // 通过 scrollLeft/scrollTop 平移：天然被滚动范围钳制，不会拖出图形
    el.scrollLeft = drag.scrollLeft - (e.clientX - drag.startX);
    el.scrollTop = drag.scrollTop - (e.clientY - drag.startY);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    scrollRef.current?.releasePointerCapture?.(e.pointerId);
  };

  if (state.status === 'loading') {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在渲染架构图…
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <pre className="m-3 whitespace-pre-wrap break-words rounded-md bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
        {state.message}
      </pre>
    );
  }
  const widthPx = Math.max(280, Math.round(state.naturalWidth * zoom));
  const heightPx = state.naturalHeight > 0
    ? Math.round(state.naturalHeight * (widthPx / state.naturalWidth))
    : undefined;
  return (
    <div
      ref={scrollRef}
      className={`flex select-none overflow-auto custom-scrollbar ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ maxHeight }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* m-auto：内容小于容器时水平/垂直居中；大于容器时由滚动条接管，滚动范围 = 图形尺寸 + padding */}
      <div className="m-auto shrink-0 p-4">
        <div
          className="overflow-hidden [&_svg]:!block [&_svg]:!h-full [&_svg]:!w-full [&_svg]:!max-w-none"
          style={{ width: widthPx, height: heightPx }}
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      </div>
    </div>
  );
};

export const MermaidDiagramCard: React.FC<{
  title?: string;
  kind?: string;
  source: string;
  isDark: boolean;
}> = ({ title, kind, source, isDark }) => {
  const state = useMermaidSvg(source, isDark);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsZoom, setFsZoom] = useState(1);
  const { icon: KindIcon, label: kindLabel } = diagramKindMeta(kind);

  return (
    <div className="overflow-hidden rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.04] via-transparent to-violet-500/[0.04] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-cyan-500/15 bg-cyan-500/[0.06] px-4 py-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/15 text-cyan-200">
          <KindIcon className="h-4 w-4" />
        </div>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
          {title || '架构图'}
        </span>
        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-200/90">
          {kindLabel}
        </span>
        <ZoomToolbar
          zoom={zoom}
          onZoom={setZoom}
          onFullscreen={() => {
            setFsZoom(Math.max(1, zoom));
            setFullscreen(true);
          }}
        />
      </div>
      <DiagramCanvas state={state} zoom={zoom} />

      <Modal
        open={fullscreen}
        onCancel={() => setFullscreen(false)}
        footer={null}
        width="94vw"
        centered
        destroyOnClose
        title={
          <div className="flex items-center gap-2 pr-10">
            <KindIcon className="h-4 w-4 text-cyan-400" />
            <span className="min-w-0 flex-1 truncate">{title || '架构图'}</span>
            <ZoomToolbar zoom={fsZoom} onZoom={setFsZoom} />
          </div>
        }
      >
        <DiagramCanvas state={state} zoom={fsZoom} maxHeight="78vh" />
      </Modal>
    </div>
  );
};

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, message } from 'antd';
import { UnorderedListOutlined } from '@ant-design/icons';
import { updateRdViewDemandEnjoyFeedback } from '@rd-view/api/rdViewService';
import { useDashboard } from '@rd-view/context/DashboardContext';
import { buildWorkOrderStatusPresentation } from '@rd-view/utils/workOrder';
import type { DemandEnjoyComment, WorkOrderTicket } from '@rd-view/types';
import { formatElapsedSince } from '@rd-view/utils/workOrder';
import { formatPersonDisplayName, personNameTitle } from '@rd-view/utils/personName';
import { mergeOwnEnjoyComment } from '@rd-view/utils/demandEnjoyFeedback';
import { AUTO_SCROLL_LOOP_DIVIDER_HEIGHT } from '../../utils/popoverScrollList';
import { ScrollLoopDivider } from '../../utils/ScrollLoopDivider';
import { WorkOrderDetailDrawer } from './WorkOrderDetailDrawer';
import { WorkOrderEnjoyBar } from './WorkOrderEnjoyBar';
import { chartCardTitleIconStyle, chartCardTitleStyle, chartCardTitleTextStyle, dashboardCardStyle } from '@rd-view/constants/dashboardTheme';
import type { WorkOrderStatusTagVariant } from '@rd-view/utils/workOrder';

const PRIORITY_COLOR: Record<WorkOrderTicket['priority'], string> = {
  高: '#F53F3F',
  中: '#FF7D00',
  低: '#86909C',
};

const ITEM_HEIGHT = 168;
const SCROLL_SECONDS_PER_ITEM = 3.6;
const PAUSE_HOVER_DELAY_MS = 120;

function StatusTag({ variant, label }: { variant: WorkOrderStatusTagVariant; label: string }) {
  return <span className={`work-order-status-tag work-order-status-tag--${variant}`}>{label}</span>;
}

function readTrackOffset(track: HTMLDivElement | null): number {
  if (!track) return 0;

  const transform = window.getComputedStyle(track).transform;
  if (!transform || transform === 'none') return 0;

  return Math.max(0, -new DOMMatrix(transform).m42);
}

function WorkOrderRow({
  item,
  enjoyComments,
  currentEmployeeId,
  currentUserName,
  onOpen,
  onOwnEnjoySelect,
}: {
  item: WorkOrderTicket;
  enjoyComments: DemandEnjoyComment[];
  currentEmployeeId: string;
  currentUserName: string;
  onOpen: (order: WorkOrderTicket) => void;
  onOwnEnjoySelect: (orderId: string, enjoyId: string) => void;
}) {
  const statusPresentation = buildWorkOrderStatusPresentation(item);
  const elapsedLabel = item.status === 'completed' || item.status === 'archived' ? '总耗时' : '至今';
  const elapsedValue = formatElapsedSince(item.createdAt);
  const description = item.content.trim() || item.summary.trim();

  return (
    <div className="work-scroll-item work-order-card-wrap" style={{ height: ITEM_HEIGHT }}>
      <div className={`work-order-card work-order-card--${statusPresentation.cardTone}`}>
        <div className="work-order-card-inner">
          <button type="button" className="work-order-card-main" onClick={() => onOpen(item)}>
            <div className="work-order-card-head">
              <div
                className={`work-scroll-avatar work-scroll-avatar--${statusPresentation.cardTone}`}
                title={personNameTitle(item.assignee)}
              >
                {formatPersonDisplayName(item.assignee)}
              </div>
              <div className="work-order-card-head-body">
                <div className="work-order-row-title">
                  <span className="work-order-row-id">{item.id}</span>
                  <span className="work-order-row-name">{item.title}</span>
                </div>
                <div className="work-order-row-meta">
                  <span className="work-order-meta-elapsed">{elapsedLabel} {elapsedValue}</span>
                  <span className="work-scroll-dot">·</span>
                  <span className="work-order-meta-priority" style={{ color: PRIORITY_COLOR[item.priority] }}>
                    {item.priority}优先级
                  </span>
                  <span className="work-scroll-dot">·</span>
                  <StatusTag variant={statusPresentation.headerTagVariant} label={statusPresentation.label} />
                </div>
              </div>
            </div>
            <p className="work-order-row-desc">{description || '暂无工单描述'}</p>
          </button>

          <div className="work-order-emoji-bar">
            <WorkOrderEnjoyBar
              comments={enjoyComments}
              currentEmployeeId={currentEmployeeId}
              currentUserName={currentUserName}
              onOwnEnjoySelect={(enjoyId) => onOwnEnjoySelect(item.id, enjoyId)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ScrollChartPanel() {
  const { dashboard, currentUser, synapseApiBase } = useDashboard();
  const workOrderTicketData = dashboard.workOrders;
  const [interactive, setInteractive] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrderTicket | null>(null);
  const [enjoyOverrides, setEnjoyOverrides] = useState<Record<string, DemandEnjoyComment[]>>({});
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const pauseTimerRef = useRef<number>();
  const interactiveRef = useRef(false);
  const drawerOpenRef = useRef(false);
  const viewportHoveredRef = useRef(false);

  const currentEmployeeId = currentUser?.employeeId ?? '';
  const currentUserName = currentUser?.name ?? '';

  const resolveEnjoyComments = useCallback(
    (ticket: WorkOrderTicket) => enjoyOverrides[ticket.id] ?? ticket.enjoyComments,
    [enjoyOverrides],
  );

  const shouldLoop = workOrderTicketData.length > 1;
  const loopSplitIndex = workOrderTicketData.length;
  const loopItems = useMemo(
    () => (shouldLoop ? [...workOrderTicketData, ...workOrderTicketData] : workOrderTicketData),
    [workOrderTicketData, shouldLoop],
  );
  const durationSec = useMemo(
    () => (shouldLoop ? Math.max(workOrderTicketData.length * SCROLL_SECONDS_PER_ITEM, 30) : 0),
    [workOrderTicketData.length, shouldLoop],
  );
  const loopHeight = useMemo(
    () => (shouldLoop ? workOrderTicketData.length * ITEM_HEIGHT + AUTO_SCROLL_LOOP_DIVIDER_HEIGHT : 0),
    [workOrderTicketData.length, shouldLoop],
  );

  useEffect(() => {
    setEnjoyOverrides({});
  }, [workOrderTicketData]);

  useEffect(() => () => {
    window.clearTimeout(pauseTimerRef.current);
  }, []);

  const normalizeOffset = (offset: number) => {
    if (loopHeight <= 0) return 0;
    return ((offset % loopHeight) + loopHeight) % loopHeight;
  };

  const applyManualOffset = (offset: number) => {
    const track = trackRef.current;
    if (!track) return;

    offsetRef.current = normalizeOffset(offset);
    track.style.animation = 'none';
    track.style.animationDelay = '';
    track.style.transform = `translate3d(0, -${offsetRef.current}px, 0)`;
  };

  const resumeAnimation = () => {
    const track = trackRef.current;
    if (!track || loopHeight <= 0) return;

    offsetRef.current = normalizeOffset(offsetRef.current);
    const progress = offsetRef.current / loopHeight;

    track.style.transform = '';
    track.style.animation = '';
    track.style.animationDelay = `${-progress * durationSec}s`;
    interactiveRef.current = false;
    setInteractive(false);
  };

  const pauseAtCurrentPosition = () => {
    const currentOffset = readTrackOffset(trackRef.current);
    offsetRef.current = currentOffset;
    applyManualOffset(currentOffset);
    interactiveRef.current = true;
    setInteractive(true);
  };

  const isPointerOverViewport = () => {
    const viewport = viewportRef.current;
    if (!viewport) return viewportHoveredRef.current;

    return viewport.matches(':hover');
  };

  const tryResumeScroll = () => {
    if (drawerOpenRef.current) return;
    if (!interactiveRef.current) return;
    if (isPointerOverViewport()) return;

    resumeAnimation();
  };

  const handleMouseEnter = () => {
    viewportHoveredRef.current = true;
    window.clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = window.setTimeout(pauseAtCurrentPosition, PAUSE_HOVER_DELAY_MS);
  };

  const handleMouseLeave = () => {
    viewportHoveredRef.current = false;
    window.clearTimeout(pauseTimerRef.current);
    tryResumeScroll();
  };

  const handleWheel = (event: React.WheelEvent) => {
    if (!interactiveRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    applyManualOffset(offsetRef.current + event.deltaY);
  };

  const handleOpenOrder = (order: WorkOrderTicket) => {
    window.clearTimeout(pauseTimerRef.current);
    pauseAtCurrentPosition();
    drawerOpenRef.current = true;
    setSelectedOrder(order);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    drawerOpenRef.current = false;
    setDrawerOpen(false);
    setSelectedOrder(null);
    window.requestAnimationFrame(() => tryResumeScroll());
  };

  const handleOwnEnjoySelect = (orderId: string, enjoyId: string) => {
    if (!currentEmployeeId || !synapseApiBase?.trim()) return;

    const ticket = workOrderTicketData.find((item) => item.id === orderId);
    const base = enjoyOverrides[orderId] ?? ticket?.enjoyComments ?? [];
    const next = mergeOwnEnjoyComment(base, enjoyId, currentEmployeeId, currentUserName);

    setEnjoyOverrides((prev) => ({
      ...prev,
      [orderId]: next,
    }));

    void updateRdViewDemandEnjoyFeedback(synapseApiBase, orderId, next).catch((e) => {
      setEnjoyOverrides((prev) => {
        const copy = { ...prev };
        delete copy[orderId];
        return copy;
      });
      const msg = e instanceof Error ? e.message : String(e);
      message.error(`表情保存失败：${msg}`);
    });
  };

  return (
    <>
      <Card
        className={`dashboard-card work-scroll-panel${interactive ? ' work-scroll-interactive' : ''}`}
        title={(
          <div style={chartCardTitleStyle}>
            <UnorderedListOutlined style={chartCardTitleIconStyle} />
            <span style={chartCardTitleTextStyle}>工作内容</span>
          </div>
        )}
        styles={{ body: { padding: 0, flex: 1, minHeight: 0, overflow: 'hidden' } }}
        style={{ ...dashboardCardStyle, minHeight: 0, overflow: 'hidden' }}
      >
        <div
          ref={viewportRef}
          className={`work-scroll-viewport${interactive ? ' work-scroll-viewport--interactive' : ''}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
        >
          <div
            ref={trackRef}
            className={`work-scroll-track${shouldLoop ? '' : ' work-scroll-track--static'}`}
            style={{
              ['--scroll-duration' as string]: `${durationSec}s`,
              ['--loop-height' as string]: `${loopHeight}px`,
            }}
          >
            {loopItems.map((item, index) => (
              <Fragment key={`${item.id}-${index}`}>
                {shouldLoop && index === loopSplitIndex ? <ScrollLoopDivider /> : null}
                <WorkOrderRow
                  item={item}
                  enjoyComments={resolveEnjoyComments(item)}
                  currentEmployeeId={currentEmployeeId}
                  currentUserName={currentUserName}
                  onOpen={handleOpenOrder}
                  onOwnEnjoySelect={handleOwnEnjoySelect}
                />
              </Fragment>
            ))}
          </div>
        </div>
      </Card>

      <WorkOrderDetailDrawer
        order={selectedOrder}
        open={drawerOpen}
        onClose={handleCloseDrawer}
      />
    </>
  );
}

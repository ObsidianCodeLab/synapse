import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { LikeFilled, DislikeFilled, MinusCircleOutlined } from '@ant-design/icons';
import { useDashboard } from '@rd-view/context/DashboardContext';
import type { DemandPriorityLevel, OrderSatisfactionDetailItem } from '@rd-view/types';
import { ScrollLoopDivider } from '../../utils/ScrollLoopDivider';
import { buildPopoverScrollModel } from '../../utils/popoverScrollList';

const ROW_HEIGHT = 40;
const SCROLL_VIEWPORT_HEIGHT = 200;
const PAUSE_HOVER_DELAY_MS = 120;

const PRIORITY_COLOR: Record<DemandPriorityLevel, string> = {
  非常紧急: '#F53F3F',
  紧急: '#F76560',
  普通: '#FF7D00',
  较低: '#86909C',
};

const PRIORITY_SORT_WEIGHT: Record<DemandPriorityLevel, number> = {
  非常紧急: 0,
  紧急: 1,
  普通: 2,
  较低: 3,
};

const NO_PRIORITY_SORT_WEIGHT = 4;

function prioritySortWeight(priority?: DemandPriorityLevel): number {
  if (!priority) return NO_PRIORITY_SORT_WEIGHT;
  return PRIORITY_SORT_WEIGHT[priority];
}

function SatisfactionOrderRow({ item }: { item: OrderSatisfactionDetailItem }) {
  return (
    <div className="order-coverage-row" style={{ height: ROW_HEIGHT }}>
      {item.priority && (
        <span
          className="order-coverage-dot"
          style={{ backgroundColor: PRIORITY_COLOR[item.priority] }}
          title={`${item.priority}优先级`}
        />
      )}
      <div className="order-coverage-title-wrap">
        <span className="order-coverage-id">{item.id}</span>
        <span className="order-coverage-title" title={item.title}>
          {item.title}
        </span>
      </div>
      {item.liked === true ? (
        <LikeFilled className="order-coverage-icon order-satisfaction-icon--liked" />
      ) : item.liked === false ? (
        <DislikeFilled className="order-coverage-icon order-satisfaction-icon--disliked" />
      ) : (
        <MinusCircleOutlined
          className="order-coverage-icon order-satisfaction-icon--unset"
          title="未评价"
        />
      )}
    </div>
  );
}

function readTrackOffset(track: HTMLDivElement | null): number {
  if (!track) return 0;

  const transform = window.getComputedStyle(track).transform;
  if (!transform || transform === 'none') return 0;

  return Math.max(0, -new DOMMatrix(transform).m42);
}

export function OrderSatisfactionPopoverContent() {
  const { dashboard } = useDashboard();
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const pauseTimerRef = useRef<number>();

  const sortedItems = useMemo(
    () => [...dashboard.details.satisfaction].sort((a, b) => {
      const priorityDiff = prioritySortWeight(a.priority) - prioritySortWeight(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return a.title.localeCompare(b.title, 'zh-CN');
    }),
    [dashboard.details.satisfaction],
  );

  const { displayItems, shouldScroll, scrollDuration, loopHeight, loopSplitIndex } = useMemo(
    () => buildPopoverScrollModel(sortedItems, ROW_HEIGHT, SCROLL_VIEWPORT_HEIGHT),
    [sortedItems],
  );

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
    track.style.animationDelay = `${-progress * scrollDuration}s`;
  };

  const pauseAtCurrentPosition = () => {
    const currentOffset = readTrackOffset(trackRef.current);
    offsetRef.current = currentOffset;
    applyManualOffset(currentOffset);
    setPaused(true);
  };

  const handleMouseEnter = () => {
    if (!shouldScroll) return;
    window.clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = window.setTimeout(pauseAtCurrentPosition, PAUSE_HOVER_DELAY_MS);
  };

  const handleMouseLeave = () => {
    window.clearTimeout(pauseTimerRef.current);

    if (paused) {
      resumeAnimation();
      setPaused(false);
    }
  };

  const handleWheel = (event: React.WheelEvent) => {
    if (!paused) return;

    event.preventDefault();
    event.stopPropagation();
    applyManualOffset(offsetRef.current + event.deltaY);
  };

  return (
    <div className="efficiency-popover">
      <div className="efficiency-popover-header">工单处理满意度明细</div>
      <div
        className={`efficiency-popover-viewport${paused && shouldScroll ? ' efficiency-popover-viewport--interactive' : ''}`}
        style={{ height: SCROLL_VIEWPORT_HEIGHT }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      >
        <div
          ref={trackRef}
          className={`efficiency-popover-track${shouldScroll ? '' : ' efficiency-popover-track--static'}`}
          style={{
            ['--scroll-duration' as string]: `${scrollDuration}s`,
            ['--loop-height' as string]: `${loopHeight}px`,
          }}
        >
          {displayItems.map((item, index) => (
            <Fragment key={shouldScroll ? `${item.id}-${index}` : item.id}>
              {shouldScroll && index === loopSplitIndex ? <ScrollLoopDivider /> : null}
              <SatisfactionOrderRow item={item} />
            </Fragment>
          ))}
        </div>
      </div>
      <div className="efficiency-popover-formula">
        满意度 = 点赞工单数 / 已评价工单数 × 5.0
      </div>
      <div className="efficiency-popover-legend">
        <span className="efficiency-popover-legend-item">
          <LikeFilled className="order-satisfaction-icon--liked" />
          点赞
        </span>
        <span className="efficiency-popover-legend-item">
          <DislikeFilled className="order-satisfaction-icon--disliked" />
          点踩
        </span>
        <span className="efficiency-popover-legend-item">
          <MinusCircleOutlined className="order-satisfaction-icon--unset" />
          未评价
        </span>
      </div>
    </div>
  );
}

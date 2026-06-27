import { AUTO_SCROLL_LOOP_DIVIDER_HEIGHT } from './ScrollLoopDivider';

/** Popover 列表滚动：仅当内容高度超出视口时才复制一份用于无缝循环 */
export function buildPopoverScrollModel<T>(
  items: T[],
  rowHeight: number,
  viewportHeight: number,
): {
  displayItems: T[];
  shouldScroll: boolean;
  scrollDuration: number;
  loopHeight: number;
  /** 第二段循环起始下标；在此位置前插入分隔线 */
  loopSplitIndex: number;
} {
  const contentHeight = items.length * rowHeight;
  const shouldScroll = contentHeight > viewportHeight;

  return {
    displayItems: shouldScroll ? [...items, ...items] : items,
    shouldScroll,
    scrollDuration: Math.max(items.length * 2.8, 16),
    loopHeight: shouldScroll ? contentHeight + AUTO_SCROLL_LOOP_DIVIDER_HEIGHT : 0,
    loopSplitIndex: shouldScroll ? items.length : -1,
  };
}

export { AUTO_SCROLL_LOOP_DIVIDER_HEIGHT };

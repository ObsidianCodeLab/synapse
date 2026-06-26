/** 与 index.css `.auto-scroll-loop-divider` 的占位高度一致，用于 loopHeight 计算 */
export const AUTO_SCROLL_LOOP_DIVIDER_HEIGHT = 26;
export function ScrollLoopDivider() {
  return <div className="auto-scroll-loop-divider" aria-hidden="true" />;
}

import type { RdViewThemePalette } from './palette';

/** palette 字段 → CSS 变量名（与 index.css / theme.css 中 var(--*) 一致） */
const PALETTE_TO_CSS_VAR: Record<keyof RdViewThemePalette, string> = {
  bgPage: '--bg-page',
  bgShell: '--bg-shell',
  bgCard: '--bg-card',
  bgCardHover: '--bg-card-hover',
  bgElevated: '--bg-elevated',
  bgMuted: '--bg-muted',
  bgSubtle: '--bg-subtle',
  bgInput: '--bg-input',
  border: '--border',
  borderLight: '--border-light',
  borderStrong: '--border-strong',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textMuted: '--text-muted',
  textDisabled: '--text-disabled',
  primary: '--primary',
  primaryHover: '--primary-hover',
  primarySoft: '--primary-soft',
  primaryBorder: '--primary-border',
  success: '--success',
  successBg: '--success-bg',
  successBorder: '--success-border',
  error: '--error',
  errorBg: '--error-bg',
  errorBorder: '--error-border',
  warning: '--warning',
  warningBg: '--warning-bg',
  shadowCard: '--shadow-card',
  shadowCardHover: '--shadow-card-hover',
  shadowPopover: '--shadow-popover',
  scrollbarTrack: '--scrollbar-track',
  scrollbarThumb: '--scrollbar-thumb',
  headerBg: '--header-bg',
  headerBorder: '--header-border',
  headerShadow: '--header-shadow',
  chartGrid: '--chart-grid',
  chatUserBg: '--chat-user-bg',
  chatAssistantBg: '--chat-assistant-bg',
  chatSystemBg: '--chat-system-bg',
  maskFade: '--mask-fade',
  overlayBg: '--overlay-bg',
  chartHoverRow: '--chart-hover-row',
  chartTooltipCursorLight: '--chart-tooltip-cursor-light',
  woAccentWidth: '--wo-accent-width',
  woItemBg: '--wo-item-bg',
  woItemBgCompleted: '--wo-item-bg-completed',
  woItemBgInProgress: '--wo-item-bg-inProgress',
  woItemBgPending: '--wo-item-bg-pending',
  woItemBgError: '--wo-item-bg-error',
  woItemBgManual: '--wo-item-bg-manual',
  woItemBorder: '--wo-item-border',
  woItemBorderCompleted: '--wo-item-border-completed',
  woItemBorderInProgress: '--wo-item-border-inProgress',
  woItemBorderPending: '--wo-item-border-pending',
  woItemBorderError: '--wo-item-border-error',
  woItemBorderManual: '--wo-item-border-manual',
  woItemBorderWidth: '--wo-item-border-width',
  woItemRadius: '--wo-item-radius',
  woItemMainBg: '--wo-item-main-bg',
  woItemMainHoverBg: '--wo-item-main-hover-bg',
  woItemHoverShadow: '--wo-item-hover-shadow',
  woEmojiBarBorderWidth: '--wo-emoji-bar-border-width',
  woEmojiBarBorder: '--wo-emoji-bar-border',
  woEmojiBarBg: '--wo-emoji-bar-bg',
  woEmojiTriggerBg: '--wo-emoji-trigger-bg',
  woEmojiTriggerBorder: '--wo-emoji-trigger-border',
  woAvatarBg: '--wo-avatar-bg',
  woAvatarColor: '--wo-avatar-color',
  woAvatarBorder: '--wo-avatar-border',
  woTagCompletedFg: '--wo-tag-completed-fg',
  woTagCompletedBg: '--wo-tag-completed-bg',
  woTagCompletedBorder: '--wo-tag-completed-border',
  woTagInProgressFg: '--wo-tag-inProgress-fg',
  woTagInProgressBg: '--wo-tag-inProgress-bg',
  woTagInProgressBorder: '--wo-tag-inProgress-border',
  woTagPendingFg: '--wo-tag-pending-fg',
  woTagPendingBg: '--wo-tag-pending-bg',
  woTagPendingBorder: '--wo-tag-pending-border',
  woTagErrorFg: '--wo-tag-error-fg',
  woTagErrorBg: '--wo-tag-error-bg',
  woTagErrorBorder: '--wo-tag-error-border',
  woTagManualFg: '--wo-tag-manual-fg',
  woTagManualBg: '--wo-tag-manual-bg',
  woTagManualBorder: '--wo-tag-manual-border',
  woTagSopCompletedFg: '--wo-tag-sop-completed-fg',
  woTagSopCompletedBg: '--wo-tag-sop-completed-bg',
  woTagSopCompletedBorder: '--wo-tag-sop-completed-border',
  woTagSopRunningFg: '--wo-tag-sop-running-fg',
  woTagSopRunningBg: '--wo-tag-sop-running-bg',
  woTagSopRunningBorder: '--wo-tag-sop-running-border',
  woTagSopManualFg: '--wo-tag-sop-manual-fg',
  woTagSopManualBg: '--wo-tag-sop-manual-bg',
  woTagSopManualBorder: '--wo-tag-sop-manual-border',
  woTagSopAbnormalFg: '--wo-tag-sop-abnormal-fg',
  woTagSopAbnormalBg: '--wo-tag-sop-abnormal-bg',
  woTagSopAbnormalBorder: '--wo-tag-sop-abnormal-border',
  woTagSopPendingFg: '--wo-tag-sop-pending-fg',
  woTagSopPendingBg: '--wo-tag-sop-pending-bg',
  woTagSopPendingBorder: '--wo-tag-sop-pending-border',
  woAccentCompleted: '--wo-accent-completed',
  woAccentInProgress: '--wo-accent-inProgress',
  woAccentPending: '--wo-accent-pending',
  woAccentError: '--wo-accent-error',
  woAccentManual: '--wo-accent-manual',
};

export function paletteToCssVariables(palette: RdViewThemePalette): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, cssVar] of Object.entries(PALETTE_TO_CSS_VAR) as [keyof RdViewThemePalette, string][]) {
    vars[cssVar] = palette[key];
  }
  return vars;
}

/** 将 CSS 变量写入指定 DOM 节点（用于 rdViewRoot 与 Drawer 等 portal 容器） */
export function applyCssVariables(target: HTMLElement, palette: RdViewThemePalette): void {
  const vars = paletteToCssVariables(palette);
  for (const [name, value] of Object.entries(vars)) {
    target.style.setProperty(name, value);
  }
}

/** portal 容器 class，需与 Drawer / Popover overlayClassName 等保持一致 */
export const RD_VIEW_PORTAL_THEME_CLASSES = [
  'person-workload-drawer',
  'work-order-drawer',
  'efficiency-popover-overlay',
] as const;

export function syncPortalThemeVariables(palette: RdViewThemePalette): void {
  for (const className of RD_VIEW_PORTAL_THEME_CLASSES) {
    document.querySelectorAll(`.${className}`).forEach((node) => {
      if (node instanceof HTMLElement) {
        applyCssVariables(node, palette);
      }
    });
  }
}

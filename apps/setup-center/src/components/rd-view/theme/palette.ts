/**
 * rd-view 色值唯一来源（亮色 / 暗色）。
 * 修改颜色请只改本文件；CSS 变量由 RdViewThemeProvider 注入，TS 组件用 useRdViewColors()。
 */

/** 两主题共享的图表业务色（不随黑白主题变化） */
export const RD_VIEW_CHART_SERIES = {
  completed: '#165DFF',
  inProgress: '#00B42A',
  pending: '#FF7D00',
} as const;

export interface RdViewThemePalette {
  /** 页面背景 */
  bgPage: string;
  bgShell: string;
  bgCard: string;
  bgCardHover: string;
  bgElevated: string;
  bgMuted: string;
  bgSubtle: string;
  bgInput: string;
  border: string;
  borderLight: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  primary: string;
  primaryHover: string;
  primarySoft: string;
  primaryBorder: string;
  success: string;
  successBg: string;
  successBorder: string;
  error: string;
  errorBg: string;
  errorBorder: string;
  warning: string;
  warningBg: string;
  shadowCard: string;
  shadowCardHover: string;
  shadowPopover: string;
  scrollbarTrack: string;
  scrollbarThumb: string;
  headerBg: string;
  headerBorder: string;
  headerShadow: string;
  chartGrid: string;
  chatUserBg: string;
  chatAssistantBg: string;
  chatSystemBg: string;
  maskFade: string;
  overlayBg: string;
  /** 图表 hover 行背景 / Tooltip 底（Recharts cursor） */
  chartHoverRow: string;
  chartTooltipCursorLight: string;
  /** 工单卡片 */
  woAccentWidth: string;
  woItemBg: string;
  woItemBgCompleted: string;
  woItemBgInProgress: string;
  woItemBgPending: string;
  woItemBgError: string;
  woItemBgManual: string;
  woItemBorder: string;
  woItemBorderCompleted: string;
  woItemBorderInProgress: string;
  woItemBorderPending: string;
  woItemBorderError: string;
  woItemBorderManual: string;
  woItemBorderWidth: string;
  woItemRadius: string;
  woItemMainBg: string;
  woItemMainHoverBg: string;
  woItemHoverShadow: string;
  woEmojiBarBorderWidth: string;
  woEmojiBarBorder: string;
  woEmojiBarBg: string;
  woEmojiTriggerBg: string;
  woEmojiTriggerBorder: string;
  woAvatarBg: string;
  woAvatarColor: string;
  woAvatarBorder: string;
  woTagCompletedFg: string;
  woTagCompletedBg: string;
  woTagCompletedBorder: string;
  woTagInProgressFg: string;
  woTagInProgressBg: string;
  woTagInProgressBorder: string;
  woTagPendingFg: string;
  woTagPendingBg: string;
  woTagPendingBorder: string;
  woTagErrorFg: string;
  woTagErrorBg: string;
  woTagErrorBorder: string;
  woTagManualFg: string;
  woTagManualBg: string;
  woTagManualBorder: string;
  woTagSopCompletedFg: string;
  woTagSopCompletedBg: string;
  woTagSopCompletedBorder: string;
  woTagSopRunningFg: string;
  woTagSopRunningBg: string;
  woTagSopRunningBorder: string;
  woTagSopManualFg: string;
  woTagSopManualBg: string;
  woTagSopManualBorder: string;
  woTagSopAbnormalFg: string;
  woTagSopAbnormalBg: string;
  woTagSopAbnormalBorder: string;
  woTagSopPendingFg: string;
  woTagSopPendingBg: string;
  woTagSopPendingBorder: string;
  woAccentCompleted: string;
  woAccentInProgress: string;
  woAccentPending: string;
  woAccentError: string;
  woAccentManual: string;
}

export const RD_VIEW_PALETTE_LIGHT: RdViewThemePalette = {
  bgPage: '#F5F7FA',
  bgShell: '#F5F7FA',
  bgCard: '#FFFFFF',
  bgCardHover: '#FAFBFC',
  bgElevated: '#FFFFFF',
  bgMuted: '#F7F8FA',
  bgSubtle: '#FAFBFC',
  bgInput: '#F5F7FA',
  border: '#E5E6EB',
  borderLight: '#F2F3F5',
  borderStrong: '#C9CDD4',
  textPrimary: '#1D2129',
  textSecondary: '#4E5969',
  textMuted: '#86909C',
  textDisabled: '#C9CDD4',
  primary: '#165DFF',
  primaryHover: '#4080FF',
  primarySoft: '#E8F3FF',
  primaryBorder: '#C9D8FF',
  success: '#00B42A',
  successBg: '#F0FBF2',
  successBorder: '#7BE188',
  error: '#F53F3F',
  errorBg: '#FFF1F0',
  errorBorder: '#FFCCC7',
  warning: '#FF7D00',
  warningBg: '#FFF7E8',
  shadowCard: 'rgba(22, 93, 255, 0.1)',
  shadowCardHover: 'rgba(22, 93, 255, 0.12)',
  shadowPopover: 'rgba(22, 93, 255, 0.12)',
  scrollbarTrack: '#f0f0f0',
  scrollbarThumb: '#c0c0c0',
  headerBg: '#FFFFFF',
  headerBorder: '#E5E6EB',
  headerShadow: 'rgba(0, 0, 0, 0.04)',
  chartGrid: '#F2F3F5',
  chatUserBg: '#E8F3FF',
  chatAssistantBg: '#F2F3F5',
  chatSystemBg: '#FFF7E8',
  maskFade: '#000',
  overlayBg: '#FFFFFF',
  chartHoverRow: 'rgba(0, 0, 0, 0.06)',
  chartTooltipCursorLight: 'rgba(0, 0, 0, 0.06)',
  woAccentWidth: '0px',
  woItemBg: '#FFFFFF',
  woItemBgCompleted: '#F0FBF2',
  woItemBgInProgress: '#FFFFFF',
  woItemBgPending: '#FFFFFF',
  woItemBgError: '#FFF1F0',
  woItemBgManual: '#FFF9F8',
  woItemBorder: '#E5E6EB',
  woItemBorderCompleted: '#7BE188',
  woItemBorderInProgress: '#E5E6EB',
  woItemBorderPending: '#E5E6EB',
  woItemBorderError: '#FFCCC7',
  woItemBorderManual: '#FFCCC7',
  woItemBorderWidth: '1px',
  woItemRadius: '8px',
  woItemMainBg: 'transparent',
  woItemMainHoverBg: 'transparent',
  woItemHoverShadow: 'none',
  woEmojiBarBorderWidth: '1px',
  woEmojiBarBorder: '#F2F3F5',
  woEmojiBarBg: 'transparent',
  woEmojiTriggerBg: '#FFFFFF',
  woEmojiTriggerBorder: '#E5E6EB',
  woAvatarBg: '#E8F3FF',
  woAvatarColor: '#165DFF',
  woAvatarBorder: '#C9D8FF',
  woTagCompletedFg: '#00B42A',
  woTagCompletedBg: '#F0FBF2',
  woTagCompletedBorder: '#7BE188',
  woTagInProgressFg: '#165DFF',
  woTagInProgressBg: '#E8F3FF',
  woTagInProgressBorder: '#C9D8FF',
  woTagPendingFg: '#FF7D00',
  woTagPendingBg: '#FFF7E8',
  woTagPendingBorder: 'rgba(255, 125, 0, 0.35)',
  woTagErrorFg: '#F53F3F',
  woTagErrorBg: '#FFF1F0',
  woTagErrorBorder: '#FFCCC7',
  woTagManualFg: '#FF7875',
  woTagManualBg: '#FFF2F0',
  woTagManualBorder: '#FFCCC7',
  woTagSopCompletedFg: '#00B42A',
  woTagSopCompletedBg: '#F0FBF2',
  woTagSopCompletedBorder: '#7BE188',
  woTagSopRunningFg: '#00B42A',
  woTagSopRunningBg: '#F0FBF2',
  woTagSopRunningBorder: '#7BE188',
  woTagSopManualFg: '#FF7D00',
  woTagSopManualBg: '#FFF7E8',
  woTagSopManualBorder: 'rgba(255, 125, 0, 0.35)',
  woTagSopAbnormalFg: '#F53F3F',
  woTagSopAbnormalBg: '#FFF1F0',
  woTagSopAbnormalBorder: '#FFCCC7',
  woTagSopPendingFg: '#86909C',
  woTagSopPendingBg: '#F7F8FA',
  woTagSopPendingBorder: '#E5E6EB',
  woAccentCompleted: '#00B42A',
  woAccentInProgress: '#165DFF',
  woAccentPending: '#FF7D00',
  woAccentError: '#F53F3F',
  woAccentManual: '#FF7875',
};

export const RD_VIEW_PALETTE_DARK: RdViewThemePalette = {
  bgPage: '#000000',
  bgShell: '#000000',
  bgCard: '#141414',
  bgCardHover: '#1a1a1a',
  bgElevated: '#1a1a1a',
  bgMuted: '#1f1f1f',
  bgSubtle: '#121212',
  bgInput: '#1a1a1a',
  border: '#2a2a2a',
  borderLight: '#252525',
  borderStrong: '#404040',
  textPrimary: '#F2F3F7',
  textSecondary: '#C9CDD4',
  textMuted: '#86909C',
  textDisabled: '#5c5c5c',
  primary: '#4080FF',
  primaryHover: '#6AA1FF',
  primarySoft: 'rgba(22, 93, 255, 0.16)',
  primaryBorder: 'rgba(64, 128, 255, 0.35)',
  success: '#23C343',
  successBg: 'rgba(0, 180, 42, 0.12)',
  successBorder: 'rgba(35, 195, 67, 0.45)',
  error: '#F76560',
  errorBg: 'rgba(245, 63, 63, 0.12)',
  errorBorder: 'rgba(247, 101, 96, 0.45)',
  warning: '#FF9A2E',
  warningBg: 'rgba(255, 122, 0, 0.12)',
  shadowCard: 'rgba(0, 0, 0, 0.35)',
  shadowCardHover: 'rgba(64, 128, 255, 0.18)',
  shadowPopover: 'rgba(0, 0, 0, 0.55)',
  scrollbarTrack: '#1a1a1a',
  scrollbarThumb: '#404040',
  headerBg: '#0a0a0a',
  headerBorder: '#2a2a2a',
  headerShadow: 'rgba(0, 0, 0, 0.4)',
  chartGrid: '#252525',
  chatUserBg: 'rgba(22, 93, 255, 0.2)',
  chatAssistantBg: '#1f1f1f',
  chatSystemBg: 'rgba(255, 122, 0, 0.15)',
  maskFade: '#000',
  overlayBg: '#1a1a1a',
  chartHoverRow: '#000000',
  chartTooltipCursorLight: 'rgba(0, 0, 0, 0.06)',
  woAccentWidth: '4px',
  woItemBg: '#000000',
  woItemBgCompleted: '#000000',
  woItemBgInProgress: '#000000',
  woItemBgPending: '#000000',
  woItemBgError: '#000000',
  woItemBgManual: '#000000',
  woItemBorder: '#2a2a2a',
  woItemBorderCompleted: '#2a2a2a',
  woItemBorderInProgress: '#2a2a2a',
  woItemBorderPending: '#2a2a2a',
  woItemBorderError: '#2a2a2a',
  woItemBorderManual: '#2a2a2a',
  woItemBorderWidth: '1px',
  woItemRadius: '8px',
  woItemMainBg: '#000000',
  woItemMainHoverBg: '#000000',
  woItemHoverShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
  woEmojiBarBorderWidth: '0',
  woEmojiBarBorder: 'transparent',
  woEmojiBarBg: 'transparent',
  woEmojiTriggerBg: 'transparent',
  woEmojiTriggerBorder: 'rgba(255, 255, 255, 0.12)',
  woAvatarBg: 'rgba(22, 93, 255, 0.15)',
  woAvatarColor: '#6AA1FF',
  woAvatarBorder: 'rgba(64, 128, 255, 0.35)',
  woTagCompletedFg: '#7BE188',
  woTagCompletedBg: 'rgba(0, 180, 42, 0.15)',
  woTagCompletedBorder: 'rgba(123, 225, 136, 0.35)',
  woTagInProgressFg: '#6AA1FF',
  woTagInProgressBg: 'rgba(22, 93, 255, 0.18)',
  woTagInProgressBorder: 'rgba(106, 161, 255, 0.35)',
  woTagPendingFg: '#FF9A2E',
  woTagPendingBg: 'rgba(255, 125, 0, 0.15)',
  woTagPendingBorder: 'rgba(255, 154, 46, 0.35)',
  woTagErrorFg: '#F76560',
  woTagErrorBg: 'rgba(247, 101, 96, 0.15)',
  woTagErrorBorder: 'rgba(247, 101, 96, 0.35)',
  woTagManualFg: '#FFA39E',
  woTagManualBg: 'rgba(255, 163, 158, 0.12)',
  woTagManualBorder: 'rgba(255, 163, 158, 0.35)',
  woTagSopCompletedFg: '#7BE188',
  woTagSopCompletedBg: 'rgba(0, 180, 42, 0.15)',
  woTagSopCompletedBorder: 'rgba(123, 225, 136, 0.35)',
  woTagSopRunningFg: '#7BE188',
  woTagSopRunningBg: 'rgba(0, 180, 42, 0.12)',
  woTagSopRunningBorder: 'rgba(123, 225, 136, 0.28)',
  woTagSopManualFg: '#FF9A2E',
  woTagSopManualBg: 'rgba(255, 125, 0, 0.12)',
  woTagSopManualBorder: 'rgba(255, 154, 46, 0.28)',
  woTagSopAbnormalFg: '#F76560',
  woTagSopAbnormalBg: 'transparent',
  woTagSopAbnormalBorder: 'rgba(247, 101, 96, 0.55)',
  woTagSopPendingFg: '#86909C',
  woTagSopPendingBg: 'rgba(255, 255, 255, 0.06)',
  woTagSopPendingBorder: '#2E3238',
  woAccentCompleted: '#7BE188',
  woAccentInProgress: '#6AA1FF',
  woAccentPending: '#FF9A2E',
  woAccentError: '#F76560',
  woAccentManual: '#FFA39E',
};

export function getRdViewPalette(isDark: boolean): RdViewThemePalette {
  return isDark ? RD_VIEW_PALETTE_DARK : RD_VIEW_PALETTE_LIGHT;
}

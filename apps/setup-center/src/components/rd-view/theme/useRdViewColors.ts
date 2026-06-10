import { useMemo } from 'react';
import { useAntThemeDark } from '@rd-view/useAntThemeDark';
import { getRdViewPalette, RD_VIEW_CHART_SERIES, type RdViewThemePalette } from './palette';

export interface RdViewChartColors {
  series: typeof RD_VIEW_CHART_SERIES;
  axisTick: string;
  grid: string;
  hoverRow: string;
  tooltip: {
    background: string;
    color: string;
    border: string;
  };
}

export interface RdViewColors {
  palette: RdViewThemePalette;
  isDark: boolean;
  chart: RdViewChartColors;
}

export function buildChartColors(palette: RdViewThemePalette, isDark: boolean): RdViewChartColors {
  return {
    series: RD_VIEW_CHART_SERIES,
    axisTick: palette.textMuted,
    grid: palette.chartGrid,
    hoverRow: isDark ? palette.chartHoverRow : palette.chartTooltipCursorLight,
    tooltip: {
      background: isDark ? palette.chartHoverRow : palette.overlayBg,
      color: palette.textPrimary,
      border: palette.border,
    },
  };
}

export function useRdViewColors(): RdViewColors {
  const isDark = useAntThemeDark();
  return useMemo(() => {
    const palette = getRdViewPalette(isDark);
    return {
      palette,
      isDark,
      chart: buildChartColors(palette, isDark),
    };
  }, [isDark]);
}

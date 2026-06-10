export {
  RD_VIEW_CHART_SERIES,
  RD_VIEW_PALETTE_DARK,
  RD_VIEW_PALETTE_LIGHT,
  getRdViewPalette,
  type RdViewThemePalette,
} from './palette';
export { applyCssVariables, paletteToCssVariables, syncPortalThemeVariables } from './cssVariables';
export { buildChartColors, useRdViewColors, type RdViewChartColors, type RdViewColors } from './useRdViewColors';
export { injectRdViewThemeFallback } from './injectStaticFallback';
export { RdViewThemeProvider } from './RdViewThemeProvider';

import { injectRdViewThemeFallback } from './injectStaticFallback';
injectRdViewThemeFallback();

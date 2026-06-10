import { paletteToCssVariables } from './cssVariables';
import { RD_VIEW_PALETTE_DARK, RD_VIEW_PALETTE_LIGHT } from './palette';

function cssBlock(selector: string, palette: typeof RD_VIEW_PALETTE_LIGHT): string {
  const vars = paletteToCssVariables(palette);
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `${selector} {\n${lines.join('\n')}\n}`;
}

/** 首屏兜底：从 palette.ts 生成静态 CSS，与 RdViewThemeProvider 运行时注入一致 */
export function injectRdViewThemeFallback(): void {
  if (typeof document === 'undefined') return;
  const id = 'rd-view-theme-fallback';
  if (document.getElementById(id)) return;

  const css = [
    cssBlock('.rdViewRoot', RD_VIEW_PALETTE_LIGHT),
    cssBlock(
      "[data-theme='dark'] .rdViewRoot, [data-theme='daltonized-dark'] .rdViewRoot, [data-theme='high-contrast'] .rdViewRoot",
      RD_VIEW_PALETTE_DARK,
    ),
    cssBlock('.person-workload-drawer', RD_VIEW_PALETTE_LIGHT),
    cssBlock(
      "[data-theme='dark'] .person-workload-drawer, [data-theme='daltonized-dark'] .person-workload-drawer, [data-theme='high-contrast'] .person-workload-drawer",
      RD_VIEW_PALETTE_DARK,
    ),
    cssBlock('.work-order-drawer', RD_VIEW_PALETTE_LIGHT),
    cssBlock(
      "[data-theme='dark'] .work-order-drawer, [data-theme='daltonized-dark'] .work-order-drawer, [data-theme='high-contrast'] .work-order-drawer",
      RD_VIEW_PALETTE_DARK,
    ),
  ].join('\n\n');

  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

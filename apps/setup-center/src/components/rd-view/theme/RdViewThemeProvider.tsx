import { useEffect, useLayoutEffect } from 'react';
import { useAntThemeDark } from '@rd-view/useAntThemeDark';
import { applyCssVariables, syncPortalThemeVariables } from './cssVariables';
import { getRdViewPalette } from './palette';

/**
 * 从 theme/palette.ts 注入 CSS 变量到 .rdViewRoot 及 Drawer 等 portal 容器。
 * 挂载在 rdViewRoot 内部即可。
 */
export function RdViewThemeProvider({ children }: { children: React.ReactNode }) {
  const isDark = useAntThemeDark();
  const palette = getRdViewPalette(isDark);

  useLayoutEffect(() => {
    const root = document.querySelector('.rdViewRoot');
    if (root instanceof HTMLElement) {
      root.style.colorScheme = isDark ? 'dark' : 'light';
      applyCssVariables(root, palette);
    }
    syncPortalThemeVariables(palette);
  }, [palette, isDark]);

  // Drawer 打开后再同步一次（portal 节点可能稍晚挂载）
  useEffect(() => {
    syncPortalThemeVariables(palette);
    const observer = new MutationObserver(() => syncPortalThemeVariables(palette));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [palette]);

  return <>{children}</>;
}

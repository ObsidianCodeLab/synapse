import { useCallback, useEffect, useState } from "react";
import {
  BorderOutlined,
  CloseOutlined,
  MinusOutlined,
  SwitcherOutlined,
} from "@ant-design/icons";
import logoUrl from "../assets/logo.png";

/** 标题栏控制键图标尺寸（继承按钮 color） */
const iconSm = { fontSize: 12 } as const;
const iconClose = { fontSize: 14 } as const;

/**
 * Windows + Tauri：自绘标题栏（可调高度）。系统自带标题栏高度由 DWM 固定，无法通过配置增大。
 */
export function WindowsTitleBar() {
  const [maximized, setMaximized] = useState(false);

  const syncMaximized = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      setMaximized(await getCurrentWindow().isMaximized());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let unlistenResize: (() => void) | undefined;
    let unlistenMove: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (cancelled) return;
        const win = getCurrentWindow();
        await syncMaximized();
        unlistenResize = await win.onResized(() => {
          void syncMaximized();
        });
        unlistenMove = await win.onMoved(() => {
          void syncMaximized();
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      unlistenResize?.();
      unlistenMove?.();
    };
  }, [syncMaximized]);

  const minimize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().minimize();
  };

  const toggleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      if (await win.isMaximized()) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
      await syncMaximized();
    } catch {
      /* ignore */
    }
  };

  const close = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  };

  return (
    <header className="winNativeTitlebar" role="banner">
      <div className="winNativeTitlebarBrand" data-tauri-drag-region>
        <img src={logoUrl} alt="" className="winNativeTitlebarLogo" draggable={false} />
        <span className="winNativeTitlebarTitle">Synapse</span>
      </div>
      <div className="winNativeTitlebarDragPad" data-tauri-drag-region />
      <div className="winNativeTitlebarControls">
        <button
          type="button"
          className="winNativeTitlebarBtn winNativeTitlebarMin"
          onClick={() => void minimize()}
          aria-label="最小化"
        >
          <MinusOutlined style={iconSm} />
        </button>
        <button
          type="button"
          className="winNativeTitlebarBtn winNativeTitlebarMax"
          onClick={() => void toggleMaximize()}
          aria-label={maximized ? "还原" : "最大化"}
        >
          {maximized ? (
            <SwitcherOutlined style={iconSm} />
          ) : (
            <BorderOutlined style={iconSm} />
          )}
        </button>
        <button
          type="button"
          className="winNativeTitlebarBtn winNativeTitlebarClose"
          onClick={() => void close()}
          aria-label="关闭"
        >
          <CloseOutlined style={iconClose} />
        </button>
      </div>
    </header>
  );
}

import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Alert, Button, Space, Tabs, Tooltip, Typography, message } from "antd";
import type { KeyboardEvent, MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke, listen, IS_TAURI, IS_WINDOWS } from "../../platform";
import {
  rdProjectPathForWorkOrder,
  rdSessionNameForWorkOrderId,
} from "./rdWorkOrderPaths";

export type RdWorkOrder = {
  id: string;
  title: string;
};

const MOCK_WORK_ORDERS: RdWorkOrder[] = [
  {
    id: "21832622",
    title:
      "【P1里程碑】-故障应急数字员工-批价异常快速回退场景-MDB组件支持定时备份能力",
  },
  {
    id: "21838379",
    title: "【云化-计费中心】广西-需求-统版-ZMDB链接登录超时异常优化",
  },
  {
    id: "21840102",
    title: "【账务中心】跨省调账接口偶发 504 超时与重试策略对齐",
  },
  {
    id: "21841288",
    title: "【5G 专网】切片开通流程与编排平台状态机不一致问题排查",
  },
  {
    id: "21842501",
    title: "【客服一线】IVR 转人工排队时长统计口径与报表对账",
  },
  {
    id: "21843067",
    title: "【资源池】OpenStack 虚机冷迁移失败率升高-宿主机磁盘告警关联分析",
  },
  {
    id: "21844123",
    title: "【信控】高额信控规则灰度发布-双写校验与回滚演练",
  },
  {
    id: "21845678",
    title: "【数据平台】日批任务依赖 DAG 某节点 SLA 告警噪声治理",
  },
];

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64Decode(s: string): Uint8Array {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Tab 展示：#工单号 + 标题，过长省略，悬停看全文 */
function RdTabTitle({ ticket }: { ticket: RdWorkOrder }) {
  const line = `#${ticket.id} ${ticket.title}`;
  return (
    <Tooltip title={line} placement="bottom" mouseEnterDelay={0.3}>
      <span className="rdCenterTabLabel">{line}</span>
    </Tooltip>
  );
}

function RdTicketPanel({ ticket, homeDir }: { ticket: RdWorkOrder; homeDir: string }) {
  const { t } = useTranslation();
  const sessionName = useMemo(() => rdSessionNameForWorkOrderId(ticket.id), [ticket.id]);
  const projectPath = useMemo(
    () => rdProjectPathForWorkOrder(homeDir, ticket.id),
    [homeDir, ticket.id],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const unlistenDataRef = useRef<(() => void) | null>(null);
  const unlistenExitRef = useRef<(() => void) | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const disposeTerminal = useCallback(async () => {
    roRef.current?.disconnect();
    roRef.current = null;
    unlistenDataRef.current?.();
    unlistenExitRef.current?.();
    unlistenDataRef.current = null;
    unlistenExitRef.current = null;
    if (sessionIdRef.current !== null) {
      try {
        await invoke("pty_close", { sessionId: sessionIdRef.current });
      } catch {
        /* ignore */
      }
      sessionIdRef.current = null;
    }
    termRef.current?.dispose();
    termRef.current = null;
    fitRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      void disposeTerminal();
    };
  }, [disposeTerminal]);

  const ensureTerm = useCallback(() => {
    if (!containerRef.current || termRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Consolas", monospace',
      theme: {
        background: "#0d0d0d",
        foreground: "#f0f0f0",
        cursor: "#e94560",
        selectionBackground: "#e9456040",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    requestAnimationFrame(() => fit.fit());
    termRef.current = term;
    fitRef.current = fit;
  }, []);

  const onCreateWorkspace = async () => {
    try {
      await invoke("create_agent_workspace", {
        sessionName: null,
        projectPath: null,
        workOrderKey: ticket.id,
      });
      message.success(t("rdCenter.toastWorkspaceOk"));
    } catch (e) {
      message.error(String(e));
    }
  };

  const onAttach = async () => {
    try {
      await disposeTerminal();
      ensureTerm();
      const term = termRef.current!;
      const fit = fitRef.current!;
      fit.fit();
      const sid = await invoke<number>("pty_create_attach", {
        rows: term.rows,
        cols: term.cols,
        targetSession: sessionName,
      });
      sessionIdRef.current = sid;
      const ud = await listen<string>(`pty://data/${sid}`, (ev) => {
        const raw = base64Decode(ev.payload);
        try {
          term.write(new TextDecoder().decode(raw));
        } catch {
          term.write(raw as unknown as string);
        }
      });
      const ue = await listen(`pty://exit/${sid}`, () => {
        term.writeln("\r\n\x1b[33m[进程已退出]\x1b[0m");
      });
      unlistenDataRef.current = ud;
      unlistenExitRef.current = ue;
      term.onData((data) => {
        if (sessionIdRef.current === null) return;
        const enc = base64Encode(new TextEncoder().encode(data));
        invoke("pty_write", { sessionId: sessionIdRef.current, data: enc }).catch(console.error);
      });
      const parent = term.element?.parentElement;
      if (parent) {
        roRef.current = new ResizeObserver(() => {
          fit.fit();
          if (sessionIdRef.current !== null) {
            invoke("pty_resize", {
              sessionId: sessionIdRef.current,
              rows: term.rows,
              cols: term.cols,
            }).catch(() => {});
          }
        });
        roRef.current.observe(parent);
      }
      message.success(t("rdCenter.toastAttachOk"));
    } catch (e) {
      message.error(String(e));
    }
  };

  const onTranscriptsStart = async () => {
    try {
      await invoke("transcripts_start", {
        sessionName,
        projectPath,
        workOrderKey: ticket.id,
      });
      message.success(t("rdCenter.toastTranscriptsOn"));
    } catch (e) {
      message.error(String(e));
    }
  };

  const onTranscriptsStop = async () => {
    try {
      await invoke("transcripts_stop", { sessionName });
      message.success(t("rdCenter.toastTranscriptsOff"));
    } catch (e) {
      message.error(String(e));
    }
  };

  const onKillSession = async () => {
    try {
      await invoke("agent_psmux_kill_session", { sessionName });
      message.success(t("rdCenter.toastKillOk"));
    } catch (e) {
      message.error(String(e));
    }
  };

  const sessionLine = `${t("rdCenter.session")}: ${sessionName}`;
  const pathLine = `${t("rdCenter.projectPath")}: ${projectPath}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, flex: 1, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "nowrap",
          gap: 16,
          alignItems: "center",
          minWidth: 0,
          flexShrink: 0,
        }}
      >
        <Typography.Text
          type="secondary"
          ellipsis
          style={{ fontSize: 12,  minWidth: 0 }}
        >
          {sessionLine}
        </Typography.Text>
        <Typography.Text
          type="secondary"
          ellipsis
          style={{ fontSize: 12,  minWidth: 0 }}
        >
          {pathLine}
        </Typography.Text>
      </div>
      <Space wrap size="small" style={{ flexShrink: 0 }}>
        <Button size="small" type="primary" onClick={() => void onCreateWorkspace()}>
          {t("rdCenter.createWorkspace")}
        </Button>
        <Button size="small" onClick={() => void onAttach()}>
          {t("rdCenter.attachTerminal")}
        </Button>
        <Button size="small" onClick={() => void onTranscriptsStart()}>
          {t("rdCenter.transcriptsStart")}
        </Button>
        <Button size="small" onClick={() => void onTranscriptsStop()}>
          {t("rdCenter.transcriptsStop")}
        </Button>
        <Button size="small" danger onClick={() => void onKillSession()}>
          {t("rdCenter.killSession")}
        </Button>
      </Space>
      <div ref={containerRef} className="rdCenterTerminalFrame" />
    </div>
  );
}

export function RdCenterView() {
  const { t } = useTranslation();
  const [homeDir, setHomeDir] = useState<string | null>(null);
  const [tickets, setTickets] = useState<RdWorkOrder[]>(MOCK_WORK_ORDERS);
  const [activeKey, setActiveKey] = useState<string>(() => MOCK_WORK_ORDERS[0]?.id ?? "");

  const addResearchTask = useCallback(() => {
    const id = `draft-${Date.now()}`;
    setTickets((prev) => [...prev, { id, title: t("rdCenter.newDraftTitle") }]);
    setActiveKey(id);
  }, [t]);

  const onTabEdit = useCallback(
    (targetKey: string | MouseEvent | KeyboardEvent, action: "add" | "remove") => {
      if (action === "add") {
        addResearchTask();
        return;
      }
      const key = String(targetKey);
      setTickets((prev) => {
        const i = prev.findIndex((x) => x.id === key);
        const next = prev.filter((x) => x.id !== key);
        if (activeKey === key && next.length > 0) {
          const neighbor = prev[i > 0 ? i - 1 : i + 1];
          if (neighbor) queueMicrotask(() => setActiveKey(neighbor.id));
        }
        return next;
      });
    },
    [activeKey, addResearchTask],
  );

  useEffect(() => {
    if (!IS_TAURI || !IS_WINDOWS) return;
    invoke<{ homeDir: string }>("get_platform_info")
      .then((p) => setHomeDir(p.homeDir))
      .catch(() => setHomeDir(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await new Promise((r) => setTimeout(r, 0));
      if (cancelled) return;
      // 登录后异步加载工单列表：接入 API 时在此 fetch 并更新工单 state
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!IS_TAURI || !IS_WINDOWS) {
    return (
      <div className="card" style={{ margin: 16 }}>
        <Alert type="info" message={t("rdCenter.windowsOnly")} showIcon />
      </div>
    );
  }

  if (!homeDir) {
    return (
      <div className="card" style={{ margin: 16 }}>
        <Typography.Text>{t("rdCenter.loadingHome")}</Typography.Text>
      </div>
    );
  }

  return (
    <div className="rdCenterRoot" style={{ padding: 16, boxSizing: "border-box" }}>
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 8, flexShrink: 0 }}>
        {t("rdCenter.title")}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 10, flexShrink: 0 }}>
        {t("rdCenter.subtitle")}
      </Typography.Paragraph>
      {tickets.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center" }}>
          <Typography.Paragraph type="secondary">{t("rdCenter.emptyTabsHint")}</Typography.Paragraph>
          <Button type="primary" onClick={addResearchTask}>
            {t("rdCenter.startResearchTask")}
          </Button>
        </div>
      ) : (
        <Tabs
          className="rdCenterTabs"
          type="editable-card"
          hideAdd
          activeKey={activeKey}
          onChange={setActiveKey}
          onEdit={onTabEdit}
          destroyInactiveTabPane={false}
          tabBarExtraContent={
            <Button type="primary" size="small" onClick={addResearchTask}>
              {t("rdCenter.startResearchTask")}
            </Button>
          }
          items={tickets.map((ticket) => ({
            key: ticket.id,
            label: <RdTabTitle ticket={ticket} />,
            closable: true,
            children: (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  minHeight: 0,
                  paddingTop: 8,
                  overflow: "hidden",
                }}
              >
                <RdTicketPanel ticket={ticket} homeDir={homeDir} />
              </div>
            ),
          }))}
        />
      )}
    </div>
  );
}

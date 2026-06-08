import { useMemo, useState } from "react";
import { Table, Tag, Button, Space, Avatar, Typography, Progress } from "antd";
import type { TableColumnsType } from "antd";
import {
  Ticket,
  ExternalLink,
  AlertCircle,
  GitMerge,
  ChevronDown,
  ChevronUp,
  FileCode2,
  BarChart2,
  Layers,
  Clock,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { RELATED_TICKETS, type TicketRecord } from "./processMockData";

const { Text, Link } = Typography;

function getMatchColor(rate: number): string {
  if (rate >= 90) return "var(--ok)";
  if (rate >= 70) return "var(--primary)";
  return "var(--warning)";
}

function getMatchBg(rate: number): string {
  if (rate >= 90) return "color-mix(in srgb, var(--ok) 14%, transparent)";
  if (rate >= 70) return "color-mix(in srgb, var(--primary) 14%, transparent)";
  return "color-mix(in srgb, var(--warning) 14%, transparent)";
}

function getMatchBorder(rate: number): string {
  if (rate >= 90) return "color-mix(in srgb, var(--ok) 35%, transparent)";
  if (rate >= 70) return "color-mix(in srgb, var(--primary) 35%, transparent)";
  return "color-mix(in srgb, var(--warning) 35%, transparent)";
}

function ExpandedDescription({ description }: { description: string }) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        margin: "0 0 2px 0",
        padding: "10px 16px 10px 44px",
        background: "color-mix(in srgb, var(--brand) 6%, transparent)",
        borderTop: "1px solid color-mix(in srgb, var(--brand) 20%, transparent)",
        borderBottom: `1px solid var(--border)`,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ marginTop: 1, flexShrink: 0 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: "color-mix(in srgb, var(--brand) 16%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FileCode2 size={11} color="var(--brand)" />
          </div>
        </div>
        <div>
          <Text style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>
            {t("rdProcess.tickets.descLabel")}
          </Text>
          <Text style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
            {description}
          </Text>
        </div>
      </div>
    </div>
  );
}

export function RdProcessTicketTable() {
  const { t } = useTranslation();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const sortedTickets = useMemo(
    () => [...RELATED_TICKETS].sort((a, b) => b.matchRate - a.matchRate),
    [],
  );

  const complexityConfig = useMemo(
    () =>
      ({
        low: {
          label: t("rdProcess.tickets.complexityLow"),
          color: "var(--ok)",
          bg: "color-mix(in srgb, var(--ok) 12%, transparent)",
          border: "color-mix(in srgb, var(--ok) 30%, transparent)",
        },
        medium: {
          label: t("rdProcess.tickets.complexityMid"),
          color: "var(--warning)",
          bg: "color-mix(in srgb, var(--warning) 12%, transparent)",
          border: "color-mix(in srgb, var(--warning) 30%, transparent)",
        },
        high: {
          label: t("rdProcess.tickets.complexityHigh"),
          color: "var(--error)",
          bg: "color-mix(in srgb, var(--error) 12%, transparent)",
          border: "color-mix(in srgb, var(--error) 30%, transparent)",
        },
      }) as Record<string, { label: string; color: string; bg: string; border: string }>,
    [t],
  );

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const columns: TableColumnsType<TicketRecord> = [
    {
      title: t("rdProcess.tickets.colId"),
      dataIndex: "id",
      key: "id",
      width: 126,
      render: (id: string, record: TicketRecord) => (
        <Space size={5} align="center">
          {record.type === "bug" ? (
            <AlertCircle size={12} color="var(--error)" />
          ) : (
            <GitMerge size={12} color="var(--primary)" />
          )}
          <Link
            style={{
              color: "var(--muted)",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: 12,
            }}
          >
            {id}
          </Link>
        </Space>
      ),
    },
    {
      title: t("rdProcess.tickets.colTitle"),
      dataIndex: "title",
      key: "title",
      ellipsis: true,
      render: (title: string, record: TicketRecord) => {
        const expanded = expandedKeys.includes(record.key);
        return (
          <div
            role="button"
            tabIndex={0}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              cursor: "pointer",
              userSelect: "none",
            }}
            onClick={() => toggleExpand(record.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleExpand(record.key);
              }
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: expanded ? "var(--brand2)" : "var(--muted)",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                transition: "color 0.15s",
              }}
            >
              {title}
            </Text>
            <span
              style={{
                flexShrink: 0,
                color: expanded ? "var(--brand)" : "var(--muted2)",
                transition: "color 0.15s",
              }}
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
          </div>
        );
      },
    },
    {
      title: t("rdProcess.tickets.colProduct"),
      dataIndex: "product",
      key: "product",
      width: 88,
      render: (product: string) => <Text style={{ color: "var(--muted)", fontSize: 12 }}>{product}</Text>,
    },
    {
      title: t("rdProcess.tickets.colModules"),
      dataIndex: "modules",
      key: "modules",
      width: 138,
      render: (modules: string[]) => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {modules.map((m) => (
            <Tag
              key={m}
              style={{
                background: "color-mix(in srgb, var(--brand) 12%, transparent)",
                color: "var(--brand2)",
                border: "1px solid color-mix(in srgb, var(--brand) 30%, transparent)",
                fontSize: 11,
                marginInlineEnd: 0,
                padding: "0 5px",
                lineHeight: "18px",
              }}
            >
              {m}
            </Tag>
          ))}
        </div>
      ),
    },
    {
      title: t("rdProcess.tickets.colMatch"),
      dataIndex: "matchRate",
      key: "matchRate",
      width: 110,
      render: (rate: number) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 40,
              height: 19,
              borderRadius: 10,
              background: getMatchBg(rate),
              border: `1px solid ${getMatchBorder(rate)}`,
              padding: "0 6px",
            }}
          >
            <Text
              style={{
                color: getMatchColor(rate),
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
                fontWeight: 600,
              }}
            >
              {rate}%
            </Text>
          </div>
          <Progress
            percent={rate}
            showInfo={false}
            size={[44, 3]}
            strokeColor={getMatchColor(rate)}
            railColor="var(--border)"
            style={{ marginBottom: 0 }}
          />
        </div>
      ),
    },
    {
      title: t("rdProcess.tickets.colEffort"),
      dataIndex: "effort",
      key: "effort",
      width: 70,
      render: (effort: string) => (
        <Text style={{ color: "var(--text)", fontSize: 12, fontFamily: "ui-monospace, monospace" }}>{effort}</Text>
      ),
    },
    {
      title: t("rdProcess.tickets.colDevTickets"),
      dataIndex: "devTickets",
      key: "devTickets",
      width: 66,
      render: (count: number) => (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 28,
              height: 19,
              borderRadius: 10,
              background: "color-mix(in srgb, var(--primary) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--primary) 28%, transparent)",
              padding: "0 7px",
            }}
          >
            <Text
              style={{
                color: "var(--primary)",
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
                fontWeight: 600,
              }}
            >
              {count}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: t("rdProcess.tickets.colComplexity"),
      dataIndex: "complexity",
      key: "complexity",
      width: 66,
      render: (complexity: string) => {
        const cfg = complexityConfig[complexity] ?? complexityConfig.medium;
        return (
          <Tag
            style={{
              background: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
              fontSize: 11,
              marginInlineEnd: 0,
              padding: "0 7px",
            }}
          >
            {cfg.label}
          </Tag>
        );
      },
    },
    {
      title: t("rdProcess.tickets.colAssignee"),
      dataIndex: "assignee",
      key: "assignee",
      width: 88,
      render: (assignee: string) => (
        <Space size={6} align="center">
          <Avatar
            size={20}
            style={{
              background: "var(--bg-subtle)",
              fontSize: 10,
              fontWeight: 600,
              border: `1px solid var(--border)`,
              color: "var(--muted)",
            }}
          >
            {assignee.charAt(0)}
          </Avatar>
          <Text style={{ color: "var(--muted)", fontSize: 12 }}>{assignee}</Text>
        </Space>
      ),
    },
  ];

  const total = sortedTickets.length;
  const featureCount = sortedTickets.filter((x) => x.type === "feature").length;
  const bugCount = sortedTickets.filter((x) => x.type === "bug").length;
  const featurePct = total ? Math.round((featureCount / total) * 100) : 0;
  const bugPct = 100 - featurePct;

  const moduleCount: Record<string, number> = {};
  sortedTickets.forEach((tk) => tk.modules.forEach((m) => { moduleCount[m] = (moduleCount[m] || 0) + 1; }));
  const topModule = Object.entries(moduleCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";

  const totalEffort = sortedTickets.reduce((sum, tk) => {
    const n = parseFloat(tk.effort);
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);

  const stats = [
    {
      icon: <BarChart2 size={12} color="var(--brand)" />,
      label: t("rdProcess.tickets.statSimilar"),
      value: t("rdProcess.tickets.statSimilarVal", { count: total }),
      color: "var(--brand2)",
      bg: "color-mix(in srgb, var(--brand) 8%, transparent)",
      border: "color-mix(in srgb, var(--brand) 22%, transparent)",
    },
    {
      icon: <AlertCircle size={12} color="var(--error)" />,
      label: t("rdProcess.tickets.statSplit"),
      value: t("rdProcess.tickets.statSplitVal", { feat: featurePct, bug: bugPct }),
      color: "var(--error)",
      bg: "color-mix(in srgb, var(--error) 8%, transparent)",
      border: "color-mix(in srgb, var(--error) 20%, transparent)",
    },
    {
      icon: <Layers size={12} color="var(--primary)" />,
      label: t("rdProcess.tickets.statModule"),
      value: topModule,
      color: "var(--primary)",
      bg: "color-mix(in srgb, var(--primary) 8%, transparent)",
      border: "color-mix(in srgb, var(--primary) 20%, transparent)",
    },
    {
      icon: <Clock size={12} color="var(--ok)" />,
      label: t("rdProcess.tickets.statEffort"),
      value: t("rdProcess.tickets.statEffortVal", { days: totalEffort }),
      color: "var(--ok)",
      bg: "color-mix(in srgb, var(--ok) 8%, transparent)",
      border: "color-mix(in srgb, var(--ok) 20%, transparent)",
    },
  ];

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-app)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "8px 16px 0",
          borderBottom: `1px solid var(--border)`,
          flexShrink: 0,
          background: "var(--card-bg)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 8,
            paddingLeft: 8,
            paddingRight: 8,
          }}
        >
          <Space size={8} align="center">
            <Ticket size={15} color="var(--brand)" />
            <Text style={{ color: "var(--text)", fontWeight: 600, fontSize: 13 }}>{t("rdProcess.tickets.panelTitle")}</Text>
          </Space>
          <Button
            type="link"
            size="small"
            style={{
              color: "var(--primary)",
              fontSize: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: 0,
            }}
            icon={<ExternalLink size={11} />}
            iconPlacement="end"
          >
            {t("rdProcess.tickets.openBoard")}
          </Button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6,
            padding: "0 8px 10px",
          }}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "7px 10px",
                background: s.bg,
                border: `1px solid ${s.border}`,
                borderRadius: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {s.icon}
                <Text style={{ fontSize: 10, color: "var(--muted)" }}>{s.label}</Text>
              </div>
              <Text
                style={{
                  fontSize: 13,
                  color: s.color,
                  fontWeight: 600,
                  fontFamily: "ui-monospace, monospace",
                  letterSpacing: "0.01em",
                }}
              >
                {s.value}
              </Text>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", background: "var(--card-bg)" }}>
        <Table<TicketRecord>
          dataSource={sortedTickets}
          columns={columns}
          rowKey="key"
          pagination={{
            pageSize: 5,
            size: "small",
            showSizeChanger: false,
            showTotal: (n) => <span style={{ color: "var(--muted)", fontSize: 12 }}>{t("rdProcess.tickets.total", { n })}</span>,
            style: {
              padding: "8px 16px",
              margin: 0,
              borderTop: `1px solid var(--border)`,
              background: "var(--card-bg)",
            },
          }}
          size="small"
          style={{ background: "transparent", height: "100%", margin: 0 }}
          expandable={{
            expandedRowKeys: expandedKeys,
            expandedRowRender: (record) => <ExpandedDescription description={record.description} />,
            showExpandColumn: false,
          }}
          onRow={() => ({
            style: { cursor: "default" },
          })}
        />
      </div>
    </div>
  );
}

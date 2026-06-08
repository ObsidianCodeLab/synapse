import { useEffect, useState } from "react";
import { Space, Tabs, Tag, Typography } from "antd";
import { BrainCircuit, Code, FileText, Activity, Database } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StepData } from "./processMockData";

const { Text } = Typography;

interface Props {
  selectedId: number | null;
  steps: StepData[];
}

export function RdProcessAgentDetailTabs({ selectedId, steps }: Props) {
  const { t } = useTranslation();
  const selectedStep = steps.find((s) => s.id === selectedId) ?? null;
  const [activeTab, setActiveTab] = useState<string>("kb");

  useEffect(() => {
    if (selectedStep) {
      if (selectedStep.id === 1) setActiveTab("kb");
      else if (selectedStep.id === 2) setActiveTab("kg");
      else setActiveTab("code");
    }
  }, [selectedId, selectedStep]);

  const tabItems = [
    {
      key: "kb",
      label: (
        <Space size={6}>
          <FileText size={14} />
          <span>{t("rdProcess.agentTab.kb")}</span>
        </Space>
      ),
      children: (
        <div style={{ padding: "16px 0" }}>
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <div
              style={{
                padding: "12px 16px",
                background: "color-mix(in srgb, var(--brand) 10%, transparent)",
                borderRadius: 10,
                border: "1px solid color-mix(in srgb, var(--brand) 28%, transparent)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Tag color="blue" bordered={false} style={{ fontSize: 11 }}>
                  {t("rdProcess.agentTab.ragTag")}
                </Tag>
                <Text style={{ color: "var(--brand)", fontSize: 12, fontWeight: 600 }}>{t("rdProcess.agentTab.match92")}</Text>
              </div>
              <Text style={{ color: "var(--text)", fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
                {t("rdProcess.agentTab.sampleIssue")}
              </Text>
              <Text style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.6, display: "block" }}>
                {t("rdProcess.agentTab.sampleKbBody")}
              </Text>
            </div>

            <div
              style={{
                padding: "12px 16px",
                background: "color-mix(in srgb, var(--ok) 10%, transparent)",
                borderRadius: 10,
                border: "1px solid color-mix(in srgb, var(--ok) 28%, transparent)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Tag color="green" bordered={false} style={{ fontSize: 11 }}>
                  {t("rdProcess.agentTab.specTag")}
                </Tag>
                <Text style={{ color: "var(--ok)", fontSize: 12, fontWeight: 600 }}>{t("rdProcess.agentTab.conf100")}</Text>
              </div>
              <Text style={{ color: "var(--text)", fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
                {t("rdProcess.agentTab.javaSpecTitle")}
              </Text>
              <Text style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.6, display: "block" }}>
                {t("rdProcess.agentTab.javaSpecBody")}
              </Text>
            </div>
          </Space>
        </div>
      ),
    },
    {
      key: "kg",
      label: (
        <Space size={6}>
          <BrainCircuit size={14} />
          <span>{t("rdProcess.agentTab.kg")}</span>
        </Space>
      ),
      children: (
        <div style={{ padding: "16px 0" }}>
          <div
            style={{
              background: "color-mix(in srgb, var(--primary) 6%, transparent)",
              borderRadius: 12,
              border: "1px solid color-mix(in srgb, var(--primary) 18%, transparent)",
              padding: 20,
              minHeight: 200,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--primary)",
                  boxShadow: "0 0 10px color-mix(in srgb, var(--primary) 60%, transparent)",
                }}
              />
              <Text style={{ color: "var(--text)", fontSize: 13, fontWeight: 500 }}>{t("rdProcess.agentTab.kgBuilding")}</Text>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { labelKey: "rdProcess.agentTab.kgSvc", value: "PaymentService", Icon: Database },
                { labelKey: "rdProcess.agentTab.kgMod", value: "CheckoutFlow", Icon: Activity },
                { labelKey: "rdProcess.agentTab.kgData", value: "OrderPrice", Icon: FileText },
              ].map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "var(--card-bg)",
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <item.Icon size={12} color="var(--muted)" />
                    <span style={{ color: "var(--muted)", fontSize: 11 }}>{t(item.labelKey)}</span>
                  </div>
                  <div style={{ color: "var(--text)", fontSize: 13, fontWeight: 600 }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                flex: 1,
                borderLeft: "2px dashed color-mix(in srgb, var(--primary) 25%, transparent)",
                marginLeft: 3,
                paddingLeft: 20,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <Text style={{ color: "var(--brand)", fontSize: 12 }}>{t("rdProcess.agentTab.kgPath")}</Text>
              <Text style={{ color: "var(--muted)", fontSize: 11 }}>{t("rdProcess.agentTab.kgHint")}</Text>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "code",
      label: (
        <Space size={6}>
          <Code size={14} />
          <span>{t("rdProcess.agentTab.code")}</span>
        </Space>
      ),
      children: (
        <div style={{ padding: "16px 0" }}>
          <div
            style={{
              background: "var(--bg-subtle)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              padding: 16,
              fontFamily: 'SFMono-Regular, Consolas, "Noto Sans SC", monospace',
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 12,
                borderBottom: "1px solid var(--border)",
                paddingBottom: 8,
              }}
            >
              <Text style={{ color: "var(--primary)", fontSize: 12 }}>{t("rdProcess.agentTab.codeFile")}</Text>
              <Tag color="error" style={{ fontSize: 10 }}>
                {t("rdProcess.agentTab.highRisk")}
              </Tag>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Text style={{ color: "var(--muted2)", fontSize: 12 }}>141 | // Calculate total with discount</Text>
              <div
                style={{
                  background: "color-mix(in srgb, var(--error) 15%, transparent)",
                  borderLeft: "3px solid var(--error)",
                  padding: "2px 8px",
                }}
              >
                <Text style={{ color: "var(--err)", fontSize: 12 }}>142 | double totalAmount = cart.getItems().stream()</Text>
                <Text style={{ color: "var(--err)", fontSize: 12 }}>143 | .mapToDouble(i -&gt; i.getPrice() * i.getQty()).sum();</Text>
              </div>
              <Text style={{ color: "var(--muted2)", fontSize: 12 }}>144 | </Text>
              <div
                style={{
                  background: "color-mix(in srgb, var(--error) 15%, transparent)",
                  borderLeft: "3px solid var(--error)",
                  padding: "2px 8px",
                }}
              >
                <Text style={{ color: "var(--err)", fontSize: 12 }}>145 | double discount = totalAmount * coupon.getRate();</Text>
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: "color-mix(in srgb, var(--warning) 12%, transparent)",
                borderRadius: 6,
                border: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
              }}
            >
              <Space align="start" size={8}>
                <Activity size={14} color="var(--warning)" style={{ marginTop: 2 }} />
                <div>
                  <Text style={{ color: "var(--warn)", fontSize: 12, fontWeight: 600, display: "block" }}>
                    {t("rdProcess.agentTab.riskTitle")}
                  </Text>
                  <Text style={{ color: "var(--muted)", fontSize: 11, display: "block", marginTop: 2 }}>
                    {t("rdProcess.agentTab.riskBody")}
                  </Text>
                </div>
              </Space>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div
      style={{
        flex: 1,
        padding: "0 24px 24px 24px",
        overflowY: "auto",
        background: "var(--bg-app)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} className="rdpAgentTabs" />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Space, Tag, Typography } from "antd";
import { motion, AnimatePresence } from "motion/react";
import { Check, Circle, Wrench, X, CheckCircle, Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buildInitialSteps, type PlanItem, type StepData } from "./processMockData";
import { RdProcessAgentDetailTabs } from "./RdProcessAgentDetailTabs";

const { Text } = Typography;

function updatePlanItem(
  steps: StepData[],
  stepId: number,
  itemId: number,
  patch: Partial<PlanItem>,
): StepData[] {
  return steps.map((s) =>
    s.id !== stepId
      ? s
      : { ...s, plan: s.plan.map((p) => (p.id !== itemId ? p : { ...p, ...patch })) },
  );
}

function updateStep(steps: StepData[], stepId: number, patch: Partial<StepData>): StepData[] {
  return steps.map((s) => (s.id !== stepId ? s : { ...s, ...patch }));
}

export function RdProcessFlow() {
  const { t } = useTranslation();
  const [steps, setSteps] = useState<StepData[]>(() => buildInitialSteps(t));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const labelWorking = t("rdProcess.flow.inProgress");

  useEffect(() => {
    const schedule = (fn: () => void, ms: number) => {
      const tid = setTimeout(fn, ms);
      timers.current.push(tid);
    };

    schedule(() => {
      setSteps((prev) => updatePlanItem(prev, 3, 3, { status: "completed", duration: "2.3s" }));
    }, 3500);

    schedule(() => {
      setSteps((prev) => updatePlanItem(prev, 3, 4, { status: "processing", duration: labelWorking }));
    }, 4000);

    schedule(() => {
      setSteps((prev) => updatePlanItem(prev, 3, 4, { status: "completed", duration: "3.1s" }));
    }, 7000);

    schedule(() => {
      setSteps((prev) => updateStep(prev, 3, { status: "completed", time: "8.4s" }));
    }, 7500);

    schedule(() => {
      setSteps((prev) => updateStep(prev, 4, { status: "processing", time: labelWorking }));
    }, 8000);

    schedule(() => {
      setSteps((prev) => updatePlanItem(prev, 4, 1, { status: "processing", duration: labelWorking }));
    }, 8000);

    schedule(() => {
      setSteps((prev) => updatePlanItem(prev, 4, 1, { status: "completed", duration: "2.8s" }));
    }, 11000);

    schedule(() => {
      setSteps((prev) => updatePlanItem(prev, 4, 2, { status: "processing", duration: labelWorking }));
    }, 11500);

    return () => timers.current.forEach(clearTimeout);
  }, [labelWorking]);

  const handleCardClick = (id: number) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

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
      <div className="rdpFlowStrip" style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
          {steps.map((step) => {
            const Icon = step.icon;
            const isSelected = selectedId === step.id;
            const isProcessing = step.status === "processing";
            const isCompleted = step.status === "completed";

            return (
              <motion.button
                key={step.id}
                type="button"
                onClick={() => handleCardClick(step.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 20px",
                  background: isSelected
                    ? "color-mix(in srgb, var(--primary) 14%, transparent)"
                    : "var(--card-bg)",
                  border: `1px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                  borderRadius: 12,
                  cursor: "pointer",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  minWidth: 180,
                  boxShadow: isSelected ? "var(--shadow)" : "none",
                  position: "relative",
                  overflow: "hidden",
                  color: "inherit",
                }}
              >
                {isProcessing && (
                  <motion.div
                    animate={{ opacity: [0.05, 0.12, 0.05] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "var(--primary)",
                      pointerEvents: "none",
                    }}
                  />
                )}

                <div
                  style={{
                    position: "relative",
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    background: isSelected
                      ? "color-mix(in srgb, var(--primary) 18%, transparent)"
                      : "var(--bg-subtle)",
                  }}
                >
                  <Icon size={16} color={isProcessing ? "var(--primary)" : isSelected ? "var(--text)" : "var(--muted)"} />
                </div>

                <div style={{ textAlign: "left", flex: 1, position: "relative", zIndex: 1 }}>
                  <div
                    style={{
                      color: isSelected ? "var(--text)" : "var(--text)",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "0.01em",
                    }}
                  >
                    {t(step.titleKey)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                    {isProcessing ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          border: "1.5px solid color-mix(in srgb, var(--primary) 25%, transparent)",
                          borderTopColor: "var(--primary)",
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: isCompleted ? "var(--ok)" : "var(--muted2)",
                        }}
                      />
                    )}
                    <span style={{ color: isProcessing ? "var(--primary)" : "var(--muted)", fontSize: 11, fontWeight: 500 }}>
                      {isProcessing
                        ? t("rdProcess.flow.statusWorking")
                        : isCompleted
                          ? t("rdProcess.flow.statusDone")
                          : t("rdProcess.flow.statusIdle")}
                    </span>
                  </div>
                </div>

                {isCompleted && !isSelected && (
                  <div style={{ position: "absolute", top: 6, right: 6 }}>
                    <Check size={10} color="var(--ok)" />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence>
          {selectedId && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: "auto", opacity: 1, marginTop: 20 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div
                style={{
                  padding: 16,
                  background: "var(--card-bg)",
                  borderRadius: 12,
                  border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)",
                  boxShadow: "var(--shadow)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Space size={8}>
                    <Wrench size={13} color="var(--primary)" />
                    <Text style={{ color: "var(--text)", fontWeight: 600, fontSize: 13 }}>
                      {(() => {
                        const sel = steps.find((s) => s.id === selectedId);
                        return sel ? `${t(sel.titleKey)} · ${t("rdProcess.flow.callDetail")}` : "";
                      })()}
                    </Text>
                  </Space>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--muted)",
                      display: "flex",
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {steps
                    .find((s) => s.id === selectedId)
                    ?.plan.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          background: "var(--bg-subtle)",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                        }}
                      >
                        <Space size={12}>
                          {item.status === "completed" ? (
                            <CheckCircle size={14} color="var(--ok)" />
                          ) : item.status === "processing" ? (
                            <Activity size={14} color="var(--primary)" />
                          ) : (
                            <Circle size={14} color="var(--muted2)" />
                          )}
                          <Text style={{ color: item.status === "pending" ? "var(--muted2)" : "var(--text)", fontSize: 12 }}>
                            {item.name}
                          </Text>
                        </Space>
                        <Space size={16}>
                          <Tag
                            style={{
                              background: "var(--bg-subtle)",
                              color: "var(--muted)",
                              border: "1px solid var(--border)",
                              fontSize: 10,
                              marginInlineEnd: 0,
                            }}
                          >
                            {item.tool}
                          </Tag>
                          <Text style={{ color: "var(--muted)", fontSize: 11, width: 48, textAlign: "right" }}>
                            {item.duration}
                          </Text>
                        </Space>
                      </div>
                    ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <RdProcessAgentDetailTabs selectedId={selectedId} steps={steps} />
    </div>
  );
}

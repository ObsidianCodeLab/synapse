import { useTranslation } from "react-i18next";

type Props = {
  /** i18n key for the page title (e.g. sidebar.workbenchProducts) */
  titleKey: string;
};

/**
 * 工作台子页面占位：后续将各路由替换为真实业务组件时，在 App.tsx 中改 lazy import 即可。
 */
export function WorkbenchPlaceholderView({ titleKey }: Props) {
  const { t } = useTranslation();
  return (
    <div className="card" style={{ padding: 32, maxWidth: 560, margin: "24px auto" }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 12px", color: "var(--fg)" }}>{t(titleKey)}</h2>
      <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.65, margin: 0 }}>{t("workbench.placeholderHint")}</p>
    </div>
  );
}

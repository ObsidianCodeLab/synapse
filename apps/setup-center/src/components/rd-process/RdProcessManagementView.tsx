import { CalendarOutlined } from "@ant-design/icons";
import { Tag, Typography } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import "../team-manage/team-manage.css";
import { RdProcessChatPanel } from "./RdProcessChatPanel";
import { RdProcessFlow } from "./RdProcessFlow";
import { RdProcessTicketTable } from "./RdProcessTicketTable";
import "./rd-process.css";

const { Text, Title } = Typography;

const WEEKDAYS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RdProcessManagementView() {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const zhLocale = i18n.language.startsWith("zh");
  const dateLocale = zhLocale ? "zh-CN" : "en-US";
  const dateStr = now.toLocaleDateString(dateLocale, { year: "numeric", month: "2-digit", day: "2-digit" });
  const weekDay = zhLocale ? WEEKDAYS_ZH[now.getDay()] : WEEKDAYS_EN[now.getDay()];

  const subtitle = useMemo(() => t("rdProcess.subtitle"), [t]);

  return (
    <div className="teamManageRoot rdProcessPage">
      <div className="teamManageHeader">
        <div className="teamManageHeaderLeft">
          <Title level={5} className="teamManagePageTitle">
            {t("rdProcess.pageTitle")}
          </Title>
          <span className="teamManageHeaderTitleSep" aria-hidden />
          <CalendarOutlined className="teamManageHeaderDateIcon" />
          <Text className="teamManageHeaderDate">
            {dateStr} {weekDay}
          </Text>
          <Tag className="rdpDemoTag">{t("rdProcess.demoBadge")}</Tag>
        </div>
        <div className="teamManageHeaderRight">
          <Text style={{ color: "var(--muted)", fontSize: 13, maxWidth: 420 }} ellipsis={{ tooltip: subtitle }}>
            {subtitle}
          </Text>
        </div>
      </div>

      <div className="teamManageMain">
        <div className="teamManageLeft" style={{ padding: 0 }}>
          <RdProcessChatPanel />
        </div>
        <div className="teamManageRight">
          <div className="teamManageWaterfall" style={{ flex: "7 1 0%", minHeight: 0, paddingTop: 0 }}>
            <RdProcessFlow />
          </div>
          <div className="rdpTicketPane" style={{ flex: "3 1 0%", minHeight: 140, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <RdProcessTicketTable />
          </div>
        </div>
      </div>
    </div>
  );
}

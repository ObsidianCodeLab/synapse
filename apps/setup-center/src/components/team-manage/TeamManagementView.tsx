import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Segmented, Badge, Avatar, Tooltip, Typography } from "antd";
import {
  TeamOutlined,
  BellOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { SummaryMetrics } from "./SummaryMetrics";
import { PersonnelTable } from "./PersonnelTable";
import { WaterfallFlow } from "./WaterfallFlow";
import { AIChatBox } from "./AIChatBox";
import { summaryData, personnelData, getWaterfallByDimension, type Dimension } from "./mockData";
import "./team-manage.css";

const { Text, Title } = Typography;

const TEAM_MEMBERS = [
  { name: "汲", fullName: "汲洋弘康", color: "#1677ff" },
  { name: "林", fullName: "林李杰", color: "#13c2c2" },
  { name: "王", fullName: "王荣中", color: "#722ed1" },
  { name: "李", fullName: "李静", color: "#52c41a" },
  { name: "林", fullName: "林鑫", color: "#fa8c16" },
  { name: "兰", fullName: "兰锦鸿", color: "#f5222d" },
  { name: "梁", fullName: "梁会当", color: "#eb2f96" },
  { name: "叶", fullName: "叶彬彬", color: "#faad14" },
];

const WEEKDAYS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TeamManagementView() {
  const { t, i18n } = useTranslation();
  const [dimension, setDimension] = useState<Dimension>("week");
  const now = new Date();
  const zhLocale = i18n.language.startsWith("zh");
  const dateLocale = zhLocale ? "zh-CN" : "en-US";
  const dateStr = now.toLocaleDateString(dateLocale, { year: "numeric", month: "2-digit", day: "2-digit" });
  const weekDay = zhLocale ? WEEKDAYS_ZH[now.getDay()] : WEEKDAYS_EN[now.getDay()];

  const segmentedOptions = useMemo(
    () => [
      { label: t("teamManage.dimMonth"), value: "month" as const },
      { label: t("teamManage.dimWeek"), value: "week" as const },
      { label: t("teamManage.dimDay"), value: "day" as const },
    ],
    [t],
  );

  return (
    <div className="teamManageRoot">
      <div className="teamManageHeader">
        <div className="teamManageHeaderLeft">
          <Title level={5} className="teamManagePageTitle">
            {t("teamManage.pageTitle")}
          </Title>
          <span className="teamManageHeaderTitleSep" aria-hidden />
          <CalendarOutlined className="teamManageHeaderDateIcon" />
          <Text className="teamManageHeaderDate">
            {dateStr} {weekDay}
          </Text>
          <Segmented
            className="teamManageSegmented"
            options={segmentedOptions}
            value={dimension}
            onChange={(val) => setDimension(val as Dimension)}
            size="small"
          />
        </div>

        <div className="teamManageHeaderRight">
          <div className="teamManageTeamRow">
            <TeamOutlined className="teamManageTeamIcon" />
            <Text className="teamManageTeamCount">
              {t("teamManage.memberCount", { count: TEAM_MEMBERS.length })}
            </Text>
            <Avatar.Group
              max={{
                count: 5,
                style: {
                  background: "var(--bg-subtle)",
                  color: "var(--muted)",
                  fontSize: 11,
                  border: "1px solid var(--border)",
                },
              }}
              size={24}
            >
              {TEAM_MEMBERS.map((m) => (
                <Tooltip key={m.fullName} title={m.fullName} placement="bottom">
                  <Avatar
                    size={24}
                    style={{
                      background: m.color,
                      fontSize: 11,
                      border: "2px solid var(--card-bg)",
                    }}
                  >
                    {m.name}
                  </Avatar>
                </Tooltip>
              ))}
            </Avatar.Group>
          </div>
          <div className="teamManageHeaderDivider" />
          <Tooltip title={t("teamManage.notifications")}>
            <Badge count={3} size="small" offset={[-2, 2]}>
              <button type="button" className="teamManageIconBtn" aria-label={t("teamManage.notifications")}>
                <BellOutlined />
              </button>
            </Badge>
          </Tooltip>
        </div>
      </div>

      <div className="teamManageMain">
        <div className="teamManageLeft">
          <SummaryMetrics data={summaryData[dimension]} dimension={dimension} />
          <PersonnelTable data={personnelData[dimension]} dimension={dimension} />
        </div>
        <div className="teamManageRight">
          <div className="teamManageWaterfall">
            <WaterfallFlow nodes={getWaterfallByDimension(dimension)} dimension={dimension} />
          </div>
          <AIChatBox dimension={dimension} />
        </div>
      </div>
    </div>
  );
}

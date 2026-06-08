import React from "react";
import { useTranslation } from "react-i18next";
import { Progress, Tag, Tooltip, Typography } from "antd";
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  CodeOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  ApartmentOutlined,
  RocketOutlined,
  BulbOutlined,
} from "@ant-design/icons";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { SummaryData, Dimension } from "./mockData";

const { Text } = Typography;

interface SummaryMetricsProps {
  data: SummaryData;
  dimension: Dimension;
}

const CompareTag: React.FC<{ value: number; label?: string }> = ({ value, label }) => {
  const isPositive = value >= 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: 11, padding: '1px 6px', borderRadius: 10,
      background: isPositive ? 'var(--ok-bg)' : 'var(--err-bg)',
      color: isPositive ? 'var(--success)' : 'var(--error)',
      border: `1px solid ${isPositive ? 'color-mix(in srgb, var(--success) 35%, transparent)' : 'color-mix(in srgb, var(--error) 35%, transparent)'}`,
    }}>
      {isPositive ? <ArrowUpOutlined style={{ fontSize: 9 }} /> : <ArrowDownOutlined style={{ fontSize: 9 }} />}
      {Math.abs(value)}%
      {label && <span style={{ opacity: 0.75, marginLeft: 2 }}>{label}</span>}
    </span>
  );
};

const MiniChart: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  const chartData = data.map((v, i) => ({ v }));
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#grad-${color.replace('#', '')})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

interface MetricCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string | number;
  unit?: string;
  prevMonthComp: number;
  prevWeekComp: number;
  prevDayComp: number;
  trend: number[];
  trendColor: string;
  dimension: Dimension;
  extra?: React.ReactNode;
  /** Token 总量：以 K（千 token）展示，避免与「万/M」缩写混用 */
  tokenDisplayK?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon, iconBg, label, value, unit,
  prevMonthComp, prevWeekComp, prevDayComp,
  trend, trendColor, dimension, extra, tokenDisplayK,
}) => {
  const { i18n } = useTranslation();
  const numberLocale = i18n.language.startsWith("zh") ? "zh-CN" : "en-US";
  const singleComp = dimension === 'month'
    ? { comp: prevMonthComp, label: '往月同比' }
    : dimension === 'week'
    ? { comp: prevWeekComp, label: '上周同比' }
    : { comp: prevDayComp, label: '昨日同比' };

  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 16px 32px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -20, right: -20,
        width: 80, height: 80, borderRadius: '50%',
        background: iconBg, opacity: 0.1, filter: 'blur(20px)',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${iconBg}22`,
          border: `1px solid ${iconBg}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: iconBg, fontSize: 16,
        }}>
          {icon}
        </div>
        <Text style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</Text>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', letterSpacing: -1 }}>
          {tokenDisplayK && typeof value === 'number' ? (
            <>
              {(value / 1000).toLocaleString(numberLocale, {
                maximumFractionDigits: value >= 10_000_000 ? 0 : 1,
              })}
              <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500, marginLeft: 2 }}>K</span>
            </>
          ) : typeof value === 'number' && value >= 10000
            ? (value >= 1000000 ? (value / 1000000).toFixed(1) + 'M' : (value / 10000).toFixed(1) + 'w')
            : value}
        </span>
        {!tokenDisplayK && unit ? <span style={{ color: 'var(--muted)', fontSize: 13 }}>{unit}</span> : null}
      </div>

      <MiniChart data={trend} color={trendColor} />

      {extra && <div style={{ marginTop: 8 }}>{extra}</div>}

      <div style={{ position: 'absolute', bottom: 10, left: 16 }}>
        <CompareTag value={singleComp.comp} label={singleComp.label} />
      </div>
    </div>
  );
};

export const SummaryMetrics: React.FC<SummaryMetricsProps> = ({ data, dimension }) => {
  const knowledgeExtra = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {data.knowledge.breakdown.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--muted)', fontSize: 11, width: 52, flexShrink: 0 }}>{item.label}</span>
          <Progress
            percent={Math.round((item.value / data.knowledge.total) * 100)}
            strokeColor={item.color}
            trailColor="var(--bg-subtle)"
            size="small"
            showInfo={false}
            style={{ flex: 1, margin: 0 }}
          />
          <span style={{ color: item.color, fontSize: 12, fontWeight: 600, width: 20, textAlign: 'right' }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );

  const efficiencyExtra = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Progress
        type="circle"
        percent={data.teamEfficiency.value}
        size={56}
        strokeColor={{
          '0%': 'var(--primary)',
          '50%': 'var(--brand2)',
          '100%': 'var(--success)',
        }}
        trailColor="var(--bg-subtle)"
        format={pct => (
          <span style={{ color: 'var(--success)', fontSize: 13, fontWeight: 700 }}>{pct}%</span>
        )}
      />
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 4 }}>团队效能评级</div>
        <Tag color="success" style={{ borderRadius: 8 }}>优秀</Tag>
        <div style={{ color: 'var(--muted2)', fontSize: 10, marginTop: 4 }}>行业平均 72.4%</div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 3, height: 16, background: 'linear-gradient(to bottom, var(--primary), var(--brand2))', borderRadius: 2 }} />
        <Text style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>汇总指标</Text>
        <span style={{
          borderRadius: 8, fontSize: 10, marginLeft: 4,
          padding: '1px 8px',
          background: 'var(--nav-active)',
          border: '1px solid var(--nav-active-border)',
          color: 'var(--primary)',
          fontWeight: 600,
        }}>
          {dimension === 'month' ? '本月' : dimension === 'week' ? '本周' : '本日'}
        </span>
      </div>

      <div className="teamManageMetricsGrid">
        <MetricCard
          icon={<RocketOutlined />} iconBg="#1677ff"
          label="处理需求数" value={data.requirements.value} unit={data.requirements.unit}
          prevMonthComp={data.requirements.prevMonthComp}
          prevWeekComp={data.requirements.prevWeekComp}
          prevDayComp={data.requirements.prevDayComp}
          trend={data.requirements.trend} trendColor="#1677ff" dimension={dimension}
        />
        <MetricCard
          icon={<ThunderboltOutlined />} iconBg="#13c2c2"
          label="处理任务数" value={data.tasks.value} unit={data.tasks.unit}
          prevMonthComp={data.tasks.prevMonthComp}
          prevWeekComp={data.tasks.prevWeekComp}
          prevDayComp={data.tasks.prevDayComp}
          trend={data.tasks.trend} trendColor="#13c2c2" dimension={dimension}
        />
        <MetricCard
          icon={<ApartmentOutlined />} iconBg="#722ed1"
          label="处理模块数" value={data.modules.value} unit={data.modules.unit}
          prevMonthComp={data.modules.prevMonthComp}
          prevWeekComp={data.modules.prevWeekComp}
          prevDayComp={data.modules.prevDayComp}
          trend={data.modules.trend} trendColor="#722ed1" dimension={dimension}
        />
        <MetricCard
          icon={<CodeOutlined />} iconBg="#52c41a"
          label="处理代码量" value={data.codeLines.value} unit="行"
          prevMonthComp={data.codeLines.prevMonthComp}
          prevWeekComp={data.codeLines.prevWeekComp}
          prevDayComp={data.codeLines.prevDayComp}
          trend={data.codeLines.trend} trendColor="#52c41a" dimension={dimension}
        />
        <MetricCard
          icon={<ThunderboltOutlined />} iconBg="#fa8c16"
          label="消耗Token总数" value={data.totalTokens.value} unit=""
          tokenDisplayK
          prevMonthComp={data.totalTokens.prevMonthComp}
          prevWeekComp={data.totalTokens.prevWeekComp}
          prevDayComp={data.totalTokens.prevDayComp}
          trend={data.totalTokens.trend} trendColor="#fa8c16" dimension={dimension}
        />
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '14px 16px 32px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* 右上角补色光晕 */}
          <div style={{
            position: 'absolute', top: -20, right: -20,
            width: 80, height: 80, borderRadius: '50%',
            background: '#eb2f96', opacity: 0.1, filter: 'blur(20px)',
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: '#eb2f9622', border: '1px solid #eb2f9644',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#eb2f96', fontSize: 16,
            }}>
              <BulbOutlined />
            </div>
            <div>
              <Text style={{ color: 'var(--muted)', fontSize: 12, display: 'block' }}>生成知识数</Text>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
                {data.knowledge.total}
              </span>
              <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 4 }}>篇</span>
            </div>
          </div>
          {knowledgeExtra}
          <div style={{ position: 'absolute', bottom: 10, left: 16 }}>
            <CompareTag
              value={
                dimension === 'month' ? data.knowledge.prevMonthComp
                : dimension === 'week' ? data.knowledge.prevWeekComp
                : data.knowledge.prevDayComp
              }
              label={
                dimension === 'month' ? '往月同比'
                : dimension === 'week' ? '上周同比'
                : '昨日同比'
              }
            />
          </div>
        </div>
      </div>

      {/* Team efficiency - full width */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '14px 16px 32px',
        marginTop: 10,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* 右上角补色光晕 */}
        <div style={{
          position: 'absolute', top: -20, right: -20,
          width: 80, height: 80, borderRadius: '50%',
          background: '#52c41a', opacity: 0.1, filter: 'blur(20px)',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: '#52c41a22', border: '1px solid #52c41a44',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#52c41a', fontSize: 16,
          }}>
            <TeamOutlined />
          </div>
          <Text style={{ color: 'var(--muted)', fontSize: 12 }}>团队能效</Text>
        </div>
        {efficiencyExtra}
        <MiniChart data={data.teamEfficiency.trend} color="#52c41a" />
        <div style={{ position: 'absolute', bottom: 10, left: 16 }}>
          <CompareTag
            value={
              dimension === 'month' ? data.teamEfficiency.prevMonthComp
              : dimension === 'week' ? data.teamEfficiency.prevWeekComp
              : data.teamEfficiency.prevDayComp
            }
            label={
              dimension === 'month' ? '往月同比'
              : dimension === 'week' ? '上周同比'
              : '昨日同比'
            }
          />
        </div>
      </div>
    </div>
  );
};
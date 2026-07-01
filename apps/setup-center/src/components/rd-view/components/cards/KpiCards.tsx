import { Card, Popover } from 'antd';
import { CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons';
import { useMemo, useState, type ComponentType } from 'react';
import { useDashboard } from '@rd-view/context/DashboardContext';
import type { KpiItem } from '@rd-view/types';
import { getTimeRangeTrendLabel, sumAssistantOutput } from '@rd-view/utils/assistantOutput';
import { dashboardCardStyle } from '@rd-view/constants/dashboardTheme';
import { EfficiencyGainPopoverContent } from './EfficiencyGainPopoverContent';
import { AiCoveragePopoverContent } from './AiCoveragePopoverContent';
import { OrderCoveragePopoverContent } from './OrderCoveragePopoverContent';
import { OrderSatisfactionPopoverContent } from './OrderSatisfactionPopoverContent';
import { TokenConsumedPopoverContent } from './TokenConsumedPopoverContent';
import { AssistantOutputPopoverContent } from './AssistantOutputPopoverContent';

const KPI_POPOVER_CONTENT: Record<string, ComponentType> = {
  efficiencyGain: EfficiencyGainPopoverContent,
  aiCoverage: AiCoveragePopoverContent,
  orderCoverage: OrderCoveragePopoverContent,
  satisfaction: OrderSatisfactionPopoverContent,
  tokenConsumed: TokenConsumedPopoverContent,
  assistantOutput: AssistantOutputPopoverContent,
};

function AssistantOutputKpiValue() {
  const { dashboard } = useDashboard();
  const summary = useMemo(
    () => sumAssistantOutput(dashboard.details.assistantOutput),
    [dashboard.details.assistantOutput],
  );

  return (
    <div className="assistant-output-kpi-value">
      <div className="assistant-output-kpi-metric">
        <span className="assistant-output-kpi-number">{summary.docCount}</span>
        <span className="assistant-output-kpi-label">文档</span>
      </div>
      <div className="assistant-output-kpi-metric">
        <span className="assistant-output-kpi-number">{summary.codeCount}</span>
        <span className="assistant-output-kpi-label">代码</span>
      </div>
    </div>
  );
}

function getKpiTrendPresentation(item: KpiItem): {
  Arrow: typeof CaretUpOutlined | null;
  color: string;
} {
  const { trend, isPositive } = item;
  const favorableColor = '#00B42A';
  const unfavorableColor = '#F53F3F';
  const neutralColor = 'var(--text-muted)';

  if (trend > 0) {
    return {
      Arrow: CaretUpOutlined,
      color: isPositive ? favorableColor : unfavorableColor,
    };
  }
  if (trend < 0) {
    return {
      Arrow: CaretDownOutlined,
      color: isPositive ? unfavorableColor : favorableColor,
    };
  }
  return { Arrow: null, color: neutralColor };
}

function KpiCardBody({ item }: { item: KpiItem }) {
  const { state } = useDashboard();
  const trendLabel = item.trendLabel || getTimeRangeTrendLabel(state.timeRange);
  const { Arrow: TrendArrow, color: trendColor } = getKpiTrendPresentation(item);

  return (
    <>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.2 }}>{item.title}</div>
      {item.key === 'assistantOutput' ? (
        <AssistantOutputKpiValue />
      ) : (
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.1 }}>
          {item.value}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: item.key === 'assistantOutput' ? 2 : 0 }}>
        {TrendArrow ? (
          <TrendArrow style={{ color: trendColor, fontSize: 10 }} />
        ) : null}
        <span style={{ fontSize: 10, fontWeight: 500, color: trendColor }}>
          {item.trend > 0 ? '+' : ''}
          {item.trend}
          {item.key === 'satisfaction' || item.key === 'assistantOutput' ? '' : '%'}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{trendLabel}</span>
      </div>
    </>
  );
}

export function KpiCards() {
  const { dashboard } = useDashboard();
  const kpiData = dashboard.kpiCards;
  const [popoverKeys, setPopoverKeys] = useState<Record<string, number>>({
    efficiencyGain: 0,
    aiCoverage: 0,
    orderCoverage: 0,
    satisfaction: 0,
    tokenConsumed: 0,
    assistantOutput: 0,
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
      {kpiData.map((item) => {
        const PopoverContent = KPI_POPOVER_CONTENT[item.key];

        const card = (
          <Card
            className="kpi-card dashboard-card"
            styles={{ body: { padding: '8px 12px' } }}
            style={{ ...dashboardCardStyle, overflow: 'hidden' }}
          >
            <KpiCardBody item={item} />
          </Card>
        );

        if (!PopoverContent) {
          return (
            <div key={item.key} style={{ height: '100%' }}>
              {card}
            </div>
          );
        }

        return (
          <Popover
            key={item.key}
            content={<PopoverContent key={popoverKeys[item.key]} />}
            trigger="hover"
            placement="bottom"
            mouseEnterDelay={0.15}
            onOpenChange={(open) => {
              if (open) {
                setPopoverKeys((keys) => ({ ...keys, [item.key]: (keys[item.key] ?? 0) + 1 }));
              }
            }}
            overlayClassName="efficiency-popover-overlay"
            arrow={false}
          >
            <div style={{ height: '100%' }}>{card}</div>
          </Popover>
        );
      })}
    </div>
  );
}
